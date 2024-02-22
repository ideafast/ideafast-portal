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

// Load the SSL certificate and key
const lxdSslCert = fs.readFileSync(process.env.NX_ITMAT_INTERFACE_LXD_CERT_PATH || '/');
const lxdSslKey = fs.readFileSync(process.env.NX_ITMAT_INTERFACE_LXD_KEY_PATH || '/');

export class Router {
    private readonly app: Express;
    private readonly server: http.Server;
    private readonly httpsServer: https.Server; // TODO, Test in local
    private readonly config: IConfiguration;
    public readonly proxies: Array<RequestHandler> = [];

    constructor(config: IConfiguration) {
        this.config = config;
        this.app = express();

        this.app.use(
            rateLimit({
                windowMs: 1 * 60 * 1000,
                max: 500
            })
        );

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
                    collectionName:
                        config.database.collections.sessions_collection
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
        this.app.use(cors({
            origin: '*', // Be cautious with this in production
            credentials: true
        }));

        /* authenticating user of the request */
        this.app.use(passport.initialize());
        this.app.use(passport.session());
        passport.serializeUser(userLoginUtils.serialiseUser);
        passport.deserializeUser(userLoginUtils.deserialiseUser);

        this.server = http.createServer(
            {
                allowHTTP1: true,
                keepAlive: true,
                keepAliveInitialDelay: 0,
                requestTimeout: 0,
                headersTimeout: 0,
                noDelay: true
            } as any,
            this.app
        );

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

        // Create an HTTPS server
        this.httpsServer = https.createServer(
            { key: lxdSslKey, cert: lxdSslCert },
            this.app
        );
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
                                const actionData =
                                    requestContext.request.variables;
                                (requestContext as any).request.variables =
                                    spaceFixing(operation as any, actionData);
                            },
                            async willSendResponse(requestContext) {
                                logPlugin.requestDidStartLogPlugin(
                                    requestContext
                                );
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

                    if (token !== '' && req.user === undefined) {
                        console.log('JWT verify');
                        // get the decoded payload ignoring signature, no symmetric secret or asymmetric key needed
                        const decodedPayload = jwt.decode(token);
                        // obtain the public-key of the robot user in the JWT payload
                        const pubkey = (decodedPayload as any).publicKey;

                        // verify the JWT
                        jwt.verify(token, pubkey, function (error: any) {
                            if (error) {
                                throw new GraphQLError(
                                    'JWT verification failed. ' + error,
                                    {
                                        extensions: {
                                            code: ApolloServerErrorCode.BAD_USER_INPUT,
                                            error
                                        }
                                    }
                                );
                            }
                        });
                        // store the associated user with the JWT to context
                        const associatedUser = await userRetrieval(pubkey);
                        req.user = associatedUser;
                    }
                    return { req, res };
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
        const serverCleanup = useServer(
            { schema: schema, execute: execute, subscribe: subscribe },
            wsServer
        );

        /* Bounce all unauthenticated non-graphql HTTP requests */
        // this.app.use((req: Request, res: Response, next: NextFunction) => {
        //     if (req.user === undefined || req.user.username === undefined) {
        //         res.status(401).json(new CustomError('Please log in first.'));
        //         return;
        //     }
        //     next();
        // });

        this.app.get('/file/:fileId', fileDownloadController);

        // Create an HTTPS agent for the proxy
        const httpsAgent = new https.Agent({
            cert: lxdSslCert,
            key: lxdSslKey,
            rejectUnauthorized: false
        });

        // Endpoint to connect to Jupyter through LXD
        // Middleware to proxy HTTP requests to the Jupyter server via the LXD API
        this.app.use('/api/connect-jupyter/:instanceName', createProxyMiddleware({
            target: this.config.lxdEndpoint, // LXD server's endpoint
            changeOrigin: true,
            ws: true, // Enable WebSocket proxying
            agent: httpsAgent, // Use the HTTPS agent for secure connections
            pathRewrite: (path, req) => {
                const instanceName = req.params.instanceName;
                // Rewrite the path to point to the exec endpoint for the instance
                return `/1.0/instances/${instanceName}/exec`;
            },
            router: (req) => {
                const instanceName = req.params.instanceName;
                // Return the URL to the LXD instance's WebSocket
                return `wss://${this.config.lxdEndpoint.replace('https://', '')}/1.0/instances/${instanceName}/console`;
            },
            onProxyReq: (proxyReq /*, req, res*/) => {
                // Modify the proxy request to include the command to access the Jupyter server
                const execPayload = {
                    command: ['bash', '-c', 'jupyter notebook list | grep http | awk \'{print $1}\' | sed \'s/::/0.0.0.0/\''],
                    environment: {}, // Set any necessary environment variables
                    wait_for_websocket: true,
                    interactive: true
                };

                // Write the modified body to the proxy request
                const bodyData = JSON.stringify(execPayload);
                proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
                proxyReq.end();
            },
            onProxyReqWs: (proxyReq/*, req, socket, options, head*/) => {
                // Modify the WebSocket handshake or headers if needed
                proxyReq.setHeader('origin', this.config.lxdEndpoint);
                // Additional headers can be set here
            },
            onError: (err, req, res) => {
                console.error('Error during proxying:', err);
                res.status(500).send('Proxy Error');
            }
        }));

        // Define the LXD proxy middleware
        const lxdwsProxy = createProxyMiddleware({
            target: 'wss://localhost:8443',
            ws: true,
            xfwd: true,
            autoRewrite: true,
            changeOrigin: true,
            agent: httpsAgent,
            secure: false, // Set to false if your target server has a self-signed or invalid SSL certificate
            pathRewrite: (path/*, req*/) => {
                // Retain the part of the path after '/lxd'
                const newPath = path.replace(/^\/ae_wslxd/, '');
                console.log(`Rewriting path: ${path} to ${newPath}`);
                return newPath;
            },
            onProxyReqWs: (proxyReq, req, socket, options/*, head*/) => {
                console.log('Proxying WebSocket request 11111111:', req.url);
                console.log('Target WebSocket server:', options.target);
                console.log(
                    'Target WebSocket server type',
                    typeof options.target
                );
                options.agent = httpsAgent;
                proxyReq.setHeader('origin', 'wss://10.142.106.1:8443');
                proxyReq.setHeader('host', '10.142.106.1:8443');

                // Remove the 'sec-websocket-extensions' header
                proxyReq.removeHeader('sec-websocket-extensions');
            }
        });


        // this.server.on('upgrade', lxdwsProxy.upgrade);
        // Check if the upgrade function is available and use it
        if (lxdwsProxy.upgrade) {
            this.server.on('upgrade', (request, socket, head) => {
                console.log('Received upgrade request from:', request.headers.origin);
                console.log('Upgrade request URL:', request.url);
                console.log('Upgrade request headers:', request.headers);

                if (request.url?.startsWith('/ae_wslxd')) {
                    // Add CORS headers to the response
                    socket.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
                        'Upgrade: WebSocket\r\n' +
                        'Connection: Upgrade\r\n' +
                        'Access-Control-Allow-Credentials: true\r\n' +
                        'Access-Control-Allow-Origin: *\r\n' +
                        '\r\n');
                    request.headers['access-control-allow-credentials'] = 'true';
                    request.headers['access-control-allow-origin'] = '*'; // Replace '*' with your frontend origin in production

                    lxdwsProxy.upgrade!(request as any, socket as any, head);
                } else {
                    console.log('Upgrade request not for WebSocket proxy, destroying socket.');
                    socket.destroy();
                }
            });
        } else {
            console.error('WebSocket upgrade function is not available in proxy middleware');
        }

        this.app.use('/ae_wslxd', lxdwsProxy);

        // Define the LXD proxy middleware
        const lxdProxy = createProxyMiddleware({
            target: _this.config.lxdEndpoint, // 'https://localhost:8443';
            // ws: true,
            xfwd: true,
            autoRewrite: true,
            changeOrigin: true,
            agent: httpsAgent,
            secure: false, // Set to false if your target server has a self-signed or invalid SSL certificate
            pathRewrite: (path/*, req*/) => {
                // Retain the part of the path after '/lxd'
                const newPath = path.replace(/^\/lxd/, '');
                console.log(`Rewriting path: ${path} to ${newPath}`);
                return newPath;
            },
            onProxyReq: (proxyReq, req/*, res*/) => {
                console.log('Proxy Req headers: ', req.headers);
                console.log('Proxy Req body: ', req.body);

                // Set other necessary headers
                proxyReq.setHeader('Content-Type', 'application/json');
                proxyReq.setHeader('Connection', 'keep-alive');

                // Set the 'Host' header to the correct value of the LXD server you are proxying to
                // This should match the domain or IP address and port number that the LXD server expects
                proxyReq.setHeader(
                    'Host', new URL(_this.config.lxdEndpoint).host
                );

                // Log the modified proxy request headers for debugging
                // console.log(
                //     'Modified Proxy Req headers: ',
                //     proxyReq.getHeaders()
                // );
                console.log('Proxying LXD API request:', req.url);
            },
            onProxyRes: (proxyRes, req, res) => {
                // Check if the request is a WebSocket request
                const isWebSocket = req.headers.upgrade === 'websocket';

                if (isWebSocket) {
                    // WebSocket specific handling
                    console.log('Handling WebSocket response...');

                    // const socket = res.socket;
                } else {
                    // Non-WebSocket handling
                    if (!res.headersSent && !req.url.includes('/websocket')) {
                        res.setHeader(
                            'Access-Control-Allow-Origin',
                            req.headers.origin || '*'
                        );
                    }
                    console.log('Handling non-WebSocket response...');
                }
                console.log('Received response from LXD:', proxyRes.statusCode);
            },
            onProxyReqWs: (proxyReq, req, socket, options/*, head*/) => {
                console.log('Proxying WebSocket request 11111111:', req.url);
                console.log('Target WebSocket server:', options.target);
                console.log(
                    'Target WebSocket server type',
                    typeof options.target
                );

                options.agent = httpsAgent;
            },
            onError: (err, req, res) => {
                console.error('Error during proxying:', err);
                console.log('Failed request:', req.url);
                res.status(500).send('Proxy Error');
            }
        });

        this.app.use('/lxd/1.0/instances', lxdProxy);

        this.app.post(
            '/api/lxd/instances/:instanceName/exec',
            async (req, res) => {
                console.log('Proxying to LXD:', req.body);
                console.log(req.headers);
                const instanceName = req.params.instanceName;
                console.log(
                    `Proxying exec command to instance: ${instanceName}`
                );
                const lxdUrl = `${_this.config.lxdEndpoint}/1.0/instances/${encodeURIComponent(instanceName)}/exec`;
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
                        cert: lxdSslCert,
                        key: lxdSslKey,
                        rejectUnauthorized: false // to allow self-signed certs
                    })
                });
                const headers = {
                    // ...req.headers,
                    'Content-Type': 'application/json',
                    'Connection': 'keep-alive',
                    'Accept': '*/*',
                    'Cache-Control': 'no-cache',
                    'Host': 'localhost:8443',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'User-Agent': 'axios/1.4.0'
                };
                try {
                    // Proxy the request to the LXD server
                    // const lxdResponse = await axiosInstance.post(lxdUrl, req.body, {headers});
                    const lxdResponse = await axiosInstance.post(
                        lxdUrl,
                        execPayload,
                        { headers }
                    );
                    // console.log('Initial response from LXD:', lxdResponse.data);

                    if (
                        lxdResponse.data.metadata.class === 'websocket' &&
                        lxdResponse.data.metadata.metadata.fds
                    ) {
                        console.log(
                            'WebSocket information received from LXD:',
                            lxdResponse.data.metadata.metadata
                        );
                        res.json({
                            fds: lxdResponse.data.metadata.metadata.fds,
                            operationId: lxdResponse.data.metadata.id
                        });
                    } else {
                        throw new Error(
                            'File descriptors not found in operation response'
                        );
                    }
                } catch (error) {
                    console.error('Error proxying to LXD:', error);
                    res.status(500).send('Error proxying to LXD');
                }
            }
        );

        this.app.post('/api/lxd/instances/create', cors(), async (req, res) => {
            const payload = req.body;
            const lxdUrl = `${_this.config.lxdEndpoint}/1.0/instances`;

            const httpsAgent = new https.Agent({
                cert: lxdSslCert,
                key: lxdSslKey,
                rejectUnauthorized: false // Allow self-signed certs
            });

            try {
                const lxdResponse = await axios.post(lxdUrl, payload, {
                    headers: { 'Content-Type': 'application/json' },
                    httpsAgent
                });

                console.log('Response from LXD:', lxdResponse.data);
                res.json(lxdResponse.data);
            } catch (error) {
                console.error('Error proxying to LXD:', error);
                res.status(500).send('Error proxying to LXD');
            }
        });

        // Combined endpoint for starting/stopping an instance
        this.app.put(
            '/api/lxd/instances/:instanceName/action',
            async (req, res) => {
                const instanceName = req.params.instanceName;
                const action = req.body.action; // 'start' or 'stop'
                const lxdUrl = `${_this.config.lxdEndpoint}/1.0/instances/${instanceName}/state`;

                const httpsAgent = new https.Agent({
                    cert: lxdSslCert,
                    key: lxdSslKey,
                    rejectUnauthorized: false // Allow self-signed certs
                });

                const actionPayload = {
                    action: action,
                    timeout: 30,
                    force: false,
                    stateful: false
                };

                try {
                    const lxdResponse = await axios.put(lxdUrl, actionPayload, {
                        headers: { 'Content-Type': 'application/json' },
                        httpsAgent
                    });

                    console.log('Response from LXD:', lxdResponse.data);
                    res.json(lxdResponse.data);
                } catch (error) {
                    console.error('Error proxying to LXD:', error);
                    res.status(500).send('Error proxying to LXD');
                }
            }
        );

        this.app.delete('/api/lxd/instances/:instanceName', async (req, res) => {
            const instanceName = req.params.instanceName;
            const lxdUrl = `${this.config.lxdEndpoint}/1.0/instances/${instanceName}`;

            try {
                // It's a good practice to use the httpsAgent for consistency
                const lxdResponse = await axios.delete(lxdUrl, { httpsAgent });
                console.log('Response from LXD:', lxdResponse.data);
                res.json(lxdResponse.data);
            } catch (error) {
                console.error('Error proxying to LXD:', error);
                res.status(500).send('Error proxying to LXD');
            }
        });


        // this.proxies.push(lxdProxy);
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
    public getHttpsServer(): https.Server {
        return this.httpsServer;
    }
}
