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
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import qs from 'qs';
import { defaultSettings, enumConfigType, IUser, IUserConfig } from '@itmat-broker/itmat-types';
import { v2 as webdav } from 'webdav-server';
import { DMPFileSystem, DMPWebDAVAuthentication } from '../webdav/dmpWebDAV';
import { routers } from '../tRPC/procedures/index';
import path from 'path';
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import multer from 'multer';
import lxdRouter, { registerContainSocketServer } from '../lxd';
// local test
import cors from 'cors';

// created for each request

export const createContext = async ({
    req,
    res
}: trpcExpress.CreateExpressContextOptions) => {
    const token: string = req.headers.authorization || '';
    if ((token !== '') && (req.user === undefined)) {
        const decodedPayload = jwt.decode(token);
        const pubkey = (decodedPayload as any).publicKey;
        // verify the JWT
        jwt.verify(token, pubkey, function (error: any) {
            if (error) {
                throw new GraphQLError('JWT verification failed. ' + error, { extensions: { code: ApolloServerErrorCode.BAD_USER_INPUT, error } });
            }
        });
        const associatedUser = await userRetrieval(pubkey);
        req.user = associatedUser;
    }
    return ({ req, res });
}; // no context
type Context = inferAsyncReturnType<typeof createContext>;
const t = initTRPC.context<Context>().create();
const appRouter = t.router(routers);

export type AppRouter = typeof appRouter;
interface ApolloServerContext {
    token?: string;
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
            max: async function (req) {
                // TODO: Queries do not use token
                const token: string = req.headers.authorization || '';
                if ((token !== '') && (req.user === undefined)) {
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
                    const config = await db.collections!.configs_collection.findOne({
                        type: enumConfigType.USERCONFIG,
                        key: associatedUser.id
                    });
                    if (config) {
                        return (config.properties as IUserConfig).defaultMaximumQPS;
                    }
                    return defaultSettings.userConfig.defaultMaximumQPS;
                }
                return defaultSettings.userConfig.defaultMaximumQPS;
            }
        }));

        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true }));


        /* save persistent sessions in mongo */
        this.app.use(
            session({
                store: process.env.NODE_ENV === 'test' ? undefined : MongoStore.create({
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
        this.app.use(cors({
            origin: '*', // Be cautious with this in production
            credentials: true
        }));

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

        // const _this = this;

        /* putting schema together */
        const schema = makeExecutableSchema({
            typeDefs,
            resolvers: {
                ...resolvers,
                BigInt: scalarResolvers,
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
                                // serverCleanup.dispose();
                            }
                        };
                    },
                    async requestDidStart() {
                        const startTime = Date.now();
                        return {
                            async executionDidStart(requestContext) {
                                const operation = requestContext.operationName;
                                const actionData = requestContext.request.variables;
                                (requestContext as any).request.variables = spaceFixing(operation as any, actionData);
                            },
                            async willSendResponse(requestContext) {
                                logPlugin.requestDidStartLogPlugin(requestContext, Date.now() - startTime);
                            }
                        };
                    }
                },
                ApolloServerPluginDrainHttpServer({ httpServer: this.server })
            ],
            formatError: (error) => {
                return error;
            }
        });

        /* AE proxy middleware */
        // initial this before graphqlUploadExpress middleware
        // const ae_proxy = createProxyMiddleware({
        //     target: _this.config.aeEndpoint,
        //     ws: true,
        //     xfwd: true,
        //     // logLevel: 'debug',
        //     autoRewrite: true,
        //     changeOrigin: true,
        //     onProxyReq: function (preq, req, res) {
        //         if (!req.user)
        //             return res.status(403).redirect('/');
        //         res.cookie('ae_proxy', req.headers['host']);
        //         const data = (req.user as IUser).username + ':token';
        //         preq.setHeader('authorization', `Basic ${Buffer.from(data).toString('base64')}`);
        //         if (req.body && Object.keys(req.body).length) {
        //             const contentType = preq.getHeader('Content-Type');
        //             preq.setHeader('origin', _this.config.aeEndpoint);
        //             const writeBody = (bodyData: string) => {
        //                 preq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        //                 preq.write(bodyData);
        //                 preq.end();
        //             };

        //             if (contentType === 'application/json') {  // contentType.includes('application/json')
        //                 writeBody(JSON.stringify(req.body));
        //             }

        //             if (contentType === 'application/x-www-form-urlencoded') {
        //                 writeBody(qs.stringify(req.body));
        //             }

        //         }
        //     },
        //     onProxyReqWs: function (preq) {
        //         const data = 'username:token';
        //         preq.setHeader('authorization', `Basic ${Buffer.from(data).toString('base64')}`);
        //     },
        //     onError: function (err, req, res, target) {
        //         console.error(err, target);
        //     }
        // });

        // this.proxies.push(ae_proxy);

        // const proxy_routers = ['/pun', '/node', '/rnode', '/public'];

        // proxy_routers.forEach(router => {
        //     this.app.use(router, ae_proxy);
        // });

        /* Containered Service Routes */

        // Top level Websocket server Object
        const containerWsServer = new WebSocketServer({
            // This is the `httpServer` returned by createServer(app);
            server: this.server,
            // Pass a different path here if your ApolloServer serves at
            // a different path.
            path: '/rtc'
        });

        registerContainSocketServer(containerWsServer);

        // REST-API
        this.app.use('/lxd', lxdRouter);

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
        // const wsServer = new WebSocketServer({
        //     // This is the `httpServer` returned by createServer(app);
        //     server: this.server,
        //     // Pass a different path here if your ApolloServer serves at
        //     // a different path.
        //     path: '/graphql'
        // });

        // Passing in an instance of a GraphQLSchema and
        // telling the WebSocketServer to start listening
        // const serverCleanup = useServer({ schema: schema, execute: execute, subscribe: subscribe }, wsServer);

        this.app.get('/file/:fileId', fileDownloadController);


        if (this.config.useWebdav) {
            const httpAuthentication = new DMPWebDAVAuthentication('realem');
            const webServer = new webdav.WebDAVServer({
                port: this.config.webdavPort,
                httpAuthentication: httpAuthentication as any
            });

            webServer.setFileSystem('/DMP', new DMPFileSystem(), (success) => {
                console.log('MinIO file system attached:', success);
                webServer.start(() => console.log('READY'));
            });

            webServer.setFileSystem('/Physical', new webdav.PhysicalFileSystem('/Users/jwang12/Documents/DMP'), (success) => {
                console.log('Physical webdav started:', success);
            });

            console.log('Webdav is starting...');
            this.app.use('/dav', (req, res, next) => {
                // webServer.requestListener(req, res, next);
                next();
            });
            // this.app.listen(this.config.webdavPort);
        }

        const uploadDir = 'uploads'; // Make sure this directory exists
        const storage = multer.diskStorage({
            destination: function (req, file, cb) {
                // Define the directory where files will be saved
                cb(null, uploadDir);
            },
            filename: function (req, file, cb) {
                // Define the filename
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
            }
        });
        const upload = multer({ storage: storage });
        const fileNames = ['file', 'profile', 'attachments', 'fileUpload'];
        fileNames.forEach(el => this.app.post('/upload', upload.single(el), (req, res) => {
            if (req.file) {
                res.json({ filePath: req.file.path });
            } else {
                res.status(400).send('No file uploaded.');
            }
        }));


        // Use multer middleware for handling multipart/form-data
        this.app.use(upload.any());

        this.app.use('/trpc', (req, res, next) => {
            if (req.files) {
                const filesArray = req.files as Express.Multer.File[];
                filesArray.forEach(file => {
                    if (!req.body[file.fieldname] || !Array.isArray(req.body[file.fieldname])) {
                        req.body[file.fieldname] = [];
                    }
                    // Push the file data into the field array.
                    req.body[file.fieldname].push({
                        path: file.path,
                        filename: file.originalname,
                        mimetype: file.mimetype,
                        size: file.size
                    });
                });
            }
            next();
        });

        this.app.use(
            '/trpc',
            trpcExpress.createExpressMiddleware({
                router: appRouter,
                createContext
            })
        );


        // this.app.listen(4200);
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
