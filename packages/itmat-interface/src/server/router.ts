
import { ApolloServer } from '@apollo/server';
import { ApolloServerErrorCode } from '@apollo/server/errors';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { GraphQLError } from 'graphql';
import { graphqlUploadExpress, GraphQLUpload } from 'graphql-upload-minimal';
import { execute, subscribe } from 'graphql';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import MongoStore from 'connect-mongo';
// import cors from 'cors';
import express from 'express';
import { Express } from 'express';
import session from 'express-session';



import rateLimit from 'express-rate-limit';
import http from 'node:http';
import passport from 'passport';
import { db } from '../database/database';
import { resolvers } from '../graphql/resolvers';
import { typeDefs } from '../graphql/typeDefs';
import { fileDownloadController } from '../rest/fileDownload';
import { userLoginUtils } from '../utils/userLoginUtils';
import { IConfiguration } from '../utils/configManager';
import { logPlugin } from '../log/logPlugin';
import { spaceFixing } from '../utils/regrex';
import { BigIntResolver as scalarResolvers } from 'graphql-scalars';
import jwt from 'jsonwebtoken';
import { userRetrieval } from '../authentication/pubkeyAuthentication';
import * as fs from 'fs';
import * as https from 'https';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';

import qs from 'qs';
import { IUser } from '@itmat-broker/itmat-types';
interface ApolloServerContext {
    token?: string;
}
import cors from 'cors';
import axios from 'axios';

declare module 'express-session' {
    interface SessionData {
        /**
         * A simple way of storing a user's current challenge being signed by registration or authentication.
         * It should be expired after `timeout` milliseconds (optional argument for `generate` methods,
         * defaults to 60000ms)
         */
        currentChallenge?: string;
    }
}

export class Router {
    private readonly app: Express;
    private readonly server: http.Server;
    private readonly config: IConfiguration;
    public readonly proxies: Array<RequestHandler> = [];

    constructor(config: IConfiguration) {

        this.config = config;
        this.app = express();

        this.app.use(rateLimit({
            windowMs: 1 * 60 * 1000,
            max: 500
        }));

        // if (process.env.NODE_ENV === 'development')
        //     this.app.use(cors({ credentials: true }));

        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // process.env.NODE_ENV = 'development';
        /* save persistent sessions in mongo */
        this.app.use(
            session({
                store: MongoStore.create({
                    client: db.client,
                    collectionName: config.database.collections.sessions_collection
                }),
                secret: this.config.sessionsSecret,
                saveUninitialized: false,
                resave: false,
                rolling: true,
                cookie: {
                    maxAge: 2 * 60 * 60 * 1000 /* 2 hour */,
                    secure: 'auto'
                }
            })
        );

        // webauthn local test
        // this.app.use(cors({ origin: 'http://localhost:4200'}));
        // Enable CORS for your React frontend
        // this.app.use(cors({ origin: 'http://localhost:4200', credentials: true }));
        this.app.use(cors());

        /* authenticating user of the request */
        this.app.use(passport.initialize());
        this.app.use(passport.session());
        passport.serializeUser(userLoginUtils.serialiseUser);
        passport.deserializeUser(userLoginUtils.deserialiseUser);

        this.server = http.createServer({
            allowHTTP1: true,
            keepAlive: true,
            keepAliveInitialDelay: 0,
            requestTimeout: 0,
            headersTimeout: 0,
            noDelay: true
        } as any, this.app);

        this.server.timeout = 0;
        this.server.headersTimeout = 0;
        this.server.requestTimeout = 0;
        this.server.keepAliveTimeout = 1000 * 60 * 60 * 24 * 5;
        this.server.on('connection', (socket) => {
            socket.setKeepAlive(true);
            socket.setNoDelay(true);
            socket.setTimeout(0);
            (socket as any).timeout = 0;
        });

    }


    async init() {

        const _this = this;

        /* putting schema together */
        const schema = makeExecutableSchema({
            typeDefs,
            resolvers: {
                ...resolvers,
                BigInt: scalarResolvers,
                // This maps the `Upload` scalar to the implementation provided
                // by the `graphql-upload` package.
                Upload: GraphQLUpload
            }
        });

        /* register apolloserver for graphql requests */
        const gqlServer = new ApolloServer<ApolloServerContext>({
            schema,
            csrfPrevention: false,
            allowBatchedHttpRequests: true,
            plugins: [
                {
                    async serverWillStart() {
                        logPlugin.serverWillStartLogPlugin();
                        return {
                            async drainServer() {
                                serverCleanup.dispose();
                            }
                        };
                    },
                    async requestDidStart() {
                        return {
                            async executionDidStart(requestContext) {
                                const operation = requestContext.operationName;
                                const actionData = requestContext.request.variables;
                                (requestContext as any).request.variables = spaceFixing(operation as any, actionData);
                            },
                            async willSendResponse(requestContext) {
                                logPlugin.requestDidStartLogPlugin(requestContext);
                            }
                        };
                    }
                },
                ApolloServerPluginDrainHttpServer({ httpServer: this.server })
            ],
            formatError: (error) => {
                // TO_DO: generate a ref uuid for errors so the clients can contact admin
                // TO_DO: check if the error is not thrown my me manually then switch to generic error to client and log
                // Logger().error(error);
                return error;
            }
        });

        /* AE proxy middleware */
        // initial this before graphqlUploadExpress middleware
        const ae_proxy = createProxyMiddleware({
            target: _this.config.aeEndpoint,
            ws: true,
            xfwd: true,
            // logLevel: 'debug',
            autoRewrite: true,
            changeOrigin: true,
            onProxyReq: function (preq, req, res) {
                if (!req.user)
                    return res.status(403).redirect('/');
                res.cookie('ae_proxy', req.headers['host']);
                const data = (req.user as IUser).username + ':token';
                preq.setHeader('authorization', `Basic ${Buffer.from(data).toString('base64')}`);
                if (req.body && Object.keys(req.body).length) {
                    const contentType = preq.getHeader('Content-Type');
                    preq.setHeader('origin', _this.config.aeEndpoint);
                    const writeBody = (bodyData: string) => {
                        preq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                        preq.write(bodyData);
                        preq.end();
                    };

                    if (contentType === 'application/json') {  // contentType.includes('application/json')
                        writeBody(JSON.stringify(req.body));
                    }

                    if (contentType === 'application/x-www-form-urlencoded') {
                        writeBody(qs.stringify(req.body));
                    }

                }
            },
            onProxyReqWs: function (preq) {
                const data = 'username:token';
                preq.setHeader('authorization', `Basic ${Buffer.from(data).toString('base64')}`);
            },
            onError: function (err, req, res, target) {
                console.error(err, target);
            }
        });

        // this.proxies.push(ae_proxy);

        /* AE routers */
        // pun for AE portal
        // node and rnode for AE application
        // public for public resource like favicon and logo
        const proxy_routers = ['/pun', '/node', '/rnode', '/public'];

        proxy_routers.forEach(router => {
            this.app.use(router, ae_proxy);
        });

        await gqlServer.start();

        this.app.use(
            '/graphql',
            express.json(),
            graphqlUploadExpress(),
            expressMiddleware(gqlServer, {
                // context: async({ req }) => ({ token: req.headers.token })
                context: async ({ req, res }) => {
                    /* Bounce all unauthenticated graphql requests */
                    // if (req.user === undefined && req.body.operationName !== 'login' && req.body.operationName !== 'IntrospectionQuery' ) {  // login and schema introspection doesn't need authentication
                    //     throw new ForbiddenError('not logged in');
                    // }
                    const token: string = req.headers.authorization || '';

                    if ((token !== '') && (req.user === undefined)) {
                        console.log('JWT verify');
                        // get the decoded payload ignoring signature, no symmetric secret or asymmetric key needed
                        const decodedPayload = jwt.decode(token);
                        // obtain the public-key of the robot user in the JWT payload
                        const pubkey = (decodedPayload as any).publicKey;

                        // verify the JWT
                        jwt.verify(token, pubkey, function (error: any) {
                            if (error) {
                                throw new GraphQLError('JWT verification failed. ' + error, { extensions: { code: ApolloServerErrorCode.BAD_USER_INPUT, error } });
                            }
                        });
                        // store the associated user with the JWT to context
                        const associatedUser = await userRetrieval(pubkey);
                        req.user = associatedUser;
                    }
                    return ({ req, res });
                }

            })
        );

        /* register the graphql subscription functionalities */
        // Creating the WebSocket subscription server
        const wsServer = new WebSocketServer({
            // This is the `httpServer` returned by createServer(app);
            server: this.server,
            // Pass a different path here if your ApolloServer serves at
            // a different path.
            path: '/graphql'
        });

        // Passing in an instance of a GraphQLSchema and
        // telling the WebSocketServer to start listening
        const serverCleanup = useServer({ schema: schema, execute: execute, subscribe: subscribe }, wsServer);

        /* Bounce all unauthenticated non-graphql HTTP requests */
        // this.app.use((req: Request, res: Response, next: NextFunction) => {
        //     if (req.user === undefined || req.user.username === undefined) {
        //         res.status(401).json(new CustomError('Please log in first.'));
        //         return;
        //     }
        //     next();
        // });

        this.app.get('/file/:fileId', fileDownloadController);

        // Load the SSL certificate and key
        const sslCert = fs.readFileSync('/Users/jwang12/mylxd.crt');
        const sslKey = fs.readFileSync('/Users/jwang12/mylxd.key');

        // Create an HTTPS agent for the proxy
        const httpsAgent = new https.Agent({
            cert: sslCert,
            key: sslKey,
            rejectUnauthorized: false
        });

        // const wsLxdServer = new WebSocketServer({ noServer: true, path: '/lxd' });

        // Define the LXD proxy middleware
        const lxdProxy = createProxyMiddleware({
            target: _this.config.lxdEndpoint,
            ws: true,
            xfwd: true,
            autoRewrite: true,
            changeOrigin: true,
            agent: httpsAgent,
            secure: false, // Set to false if your target server has a self-signed or invalid SSL certificate
            // ssl: {
            //     cert: sslCert,
            //     key: sslKey,
            //     rejectUnauthorized: false
            // },
            pathRewrite: (path) => {
                // Retain the part of the path after '/lxd'
                const newPath = path.replace(/^\/lxd/, '');
                console.log(`Rewriting path: ${path} to ${newPath}`);
                return newPath;
            },
            onProxyReq: (proxyReq, req) => {

                proxyReq.setHeader('Content-Type', 'application/json');
                proxyReq.setHeader('Connection', 'keep-alive');
                console.log('Proxying LXD API request:', req.url);
            },
            onProxyRes: (proxyRes, req, res) => {
                // Check if the request is a WebSocket request
                const isWebSocket = req.headers.upgrade === 'websocket';

                if (isWebSocket) {
                    // WebSocket specific handling
                    console.log('Handling WebSocket response...');

                    // const socket = res.socket;

                    // socket.on('data', (chunk) => {
                    //     console.log('Data from target WebSocket server:', chunk.toString());
                    // });

                    // socket.on('end', () => {
                    //     console.log('WebSocket connection to target server ended');
                    // });

                    // socket.on('error', (err) => {
                    //     console.error('Error in WebSocket response from target server:', err);
                    // });
                } else {
                    // Non-WebSocket handling
                    if (!res.headersSent && !req.url.includes('/websocket')) {
                        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
                    }
                    console.log('Handling non-WebSocket response...');
                }
                console.log('Received response from LXD:', proxyRes.statusCode);
            },
            onProxyReqWs: (proxyReq, req, socket, options) => {
                console.log('Proxying WebSocket request:', req.url);
                console.log('Target WebSocket server:', options.target);
                console.log('Target WebSocket server type', typeof options.target);
                // Modify the target protocol to 'wss' as it's an HTTPS connection
                // Ensure that options.target is treated as a URL object

                // Check if options.target is an object and has a protocol property
                if (typeof options.target === 'object' && options.target && 'protocol' in options.target) {
                    if (options.target.protocol !== 'wss:') {
                        options.target.protocol = 'wss:';
                        console.log('Modified Target WebSocket server protocol to wss:', options.target);
                    }
                } else {
                    console.error('Invalid target for WebSocket proxying');
                }

                options.agent = httpsAgent;

            },
            onError: (err, req, res) => {
                console.error('Error during proxying:', err);
                console.log('Failed request:', req.url);
                res.status(500).send('Proxy Error');
            }
        });
        // Then, apply the LXD proxy middleware to the Express application
        // instance creation, instance management
        const lxd_proxy_routers = [
            '/lxd/*',
            '/lxd/1.0/instances'
            // '/lxd/1.0/instances/:instanceId',
            // '/lxd/1.0/instances/:instanceId/*',
            // '/lxd/1.0/operations/:operationId/websocket'
        ];

        lxd_proxy_routers.forEach(router => {
            this.app.use(router, lxdProxy);
        });

        this.server.on('upgrade', (request, socket, head) => {
            console.log('Received upgrade request from', request.headers.origin);
            console.log('Upgrade request URL:', request.url);

            // wsLxdServer.handleUpgrade(request, socket, head, (socket) => {
            //     wsServer.emit('connection', socket, request);
            // });

            if (request.headers.origin === 'http://localhost:4200' && request.url?.startsWith('/lxd')) {
                console.log('Proxying WebSocket request:', request.url);

                const proxyUpgrade = lxdProxy.upgrade;
                if (proxyUpgrade) {
                    // Using type assertion to match the expected type
                    proxyUpgrade(request as any, socket as any, head);
                } else {
                    socket.destroy();
                }
            } else {
                socket.destroy();
            }
        });


        this.app.post('/api/lxd/instances/:instanceName/exec', async (req, res) => {

            console.log('Proxying to LXD:', req.body);
            console.log(req.headers);
            const instanceName = req.params.instanceName;
            console.log(`Proxying exec command to instance: ${instanceName}`);
            const lxdUrl = `https://192.168.64.4:8443/1.0/instances/${encodeURIComponent(instanceName)}/exec`;
            console.log('lxd url', lxdUrl);

            const execPayload = {
                'command': ['bash'],
                'environment': {
                    TERM: 'xterm-256color',
                    HOME: '/root',
                    ...req.body.environment // Add additional environment variables if provided
                },
                'user': req.body.user || 0, // Use provided user or default to 0
                'group': req.body.group || 0, // Use provided group or default to 0
                'wait-for-websocket': true,
                'interactive': true
            };
            // Create an instance of axios with a custom HTTPS agent
            const axiosInstance = axios.create({
                httpsAgent: new https.Agent({
                    cert: fs.readFileSync('/Users/jwang12/mylxd.crt'),
                    key: fs.readFileSync('/Users/jwang12/mylxd.key'),
                    rejectUnauthorized: false // to allow self-signed certs
                })
            });
            const headers = {
                // ...req.headers,
                'Content-Type': 'application/json',
                'Connection': 'keep-alive',
                'Accept': '*/*',
                'Cache-Control': 'no-cache',
                'Host': '192.168.64.4:8443',
                'Accept-Encoding': 'gzip, deflate, br',
                'User-Agent': 'axios/1.4.0'
                // 'Origin': 'https://192.168.64.4:8443/'
            };
            try {


                // Proxy the request to the LXD server
                // const lxdResponse = await axiosInstance.post(lxdUrl, req.body, {headers});
                const lxdResponse = await axiosInstance.post(lxdUrl, execPayload, { headers });
                // console.log('Initial response from LXD:', lxdResponse.data);

                if (lxdResponse.data.metadata.class === 'websocket' && lxdResponse.data.metadata.metadata.fds) {

                    console.log('WebSocket information received from LXD:', lxdResponse.data.metadata.metadata);
                    res.json({ fds: lxdResponse.data.metadata.metadata.fds, operationId: lxdResponse.data.metadata.id });
                } else {
                    throw new Error('File descriptors not found in operation response');
                }

            } catch (error) {
                console.error('Error proxying to LXD:', error);
                res.status(500).send('Error proxying to LXD');
            }
        });

        this.proxies.push(lxdProxy);

    }

    public getApp(): Express {
        return this.app;
    }

    public getProxy(): RequestHandler {
        return this.proxies[0];
    }

    public getServer(): http.Server {
        return this.server;
    }
}


