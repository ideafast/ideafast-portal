import { ApolloServer, UserInputError } from 'apollo-server-express';
import { ApolloServerPluginDrainHttpServer } from 'apollo-server-core';
import { graphqlUploadExpress, GraphQLUpload } from 'graphql-upload-minimal';
import { execute, subscribe } from 'graphql';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
// import connectMongo from 'connect-mongo';
import cors from 'cors';
import express from 'express';
import { Express } from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import http from 'http';
import passport from 'passport';
// import { db } from '../database/database';
import { resolversV0, resolversV1 } from '../graphql/resolvers';
import { schemaV0 } from '../graphql/schemaV0';
import { schemaV1 } from '../graphql/schemaV1';
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
import { IUser } from '@itmat-broker/itmat-types';


export class Router {
    private readonly app: Express;
    private readonly server: http.Server;
    public readonly proxies: Array<RequestHandler> = [];

    constructor(config: IConfiguration) {

        this.app = express();

        this.app.use(rateLimit({
            windowMs: 1 * 60 * 1000,
            max: 500
        }));

        if (process.env.NODE_ENV === 'development')
            this.app.use(cors({ credentials: true }));

        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true }));


        /* save persistent sessions in mongo */
        this.app.use(
            session({
                secret: config.sessionsSecret,
                saveUninitialized: false,
                resave: true,
                rolling: true,
                cookie: {
                    maxAge: 2 * 60 * 60 * 1000 /* 2 hour */
                }
            })
        );


        /* authenticating user of the request */
        this.app.use(passport.initialize());
        this.app.use(passport.session());
        passport.serializeUser(userLoginUtils.serialiseUser);
        passport.deserializeUser(userLoginUtils.deserialiseUser);

        this.server = http.createServer(this.app);


        /* register apolloserver for graphql requests */
        /* TODO: need to consider to make apis have rolling capacity */
        this.server = http.createServer(this.app);
        this.createApolloServer(resolversV0, schemaV0, '/api/v0');
        this.createApolloServer(resolversV1, schemaV1, '/api/v1');

        /* AE proxy middleware */
        // initial this before graphqlUploadExpress middleware
        const ae_proxy = createProxyMiddleware({
            target: config.aeEndpoint,
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
                if (req.method == 'POST' && req.body) {
                    const contentType = preq.getHeader('Content-Type');
                    preq.setHeader('origin', config.aeEndpoint);
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

        this.proxies.push(ae_proxy);

        /* AE routers */
        // pun for AE portal
        // node and rnode for AE application
        // public for public resource like favicon and logo
        const proxy_routers = ['/pun', '/node', '/rnode', '/public'];

        proxy_routers.forEach(router => {
            this.app.use(router, ae_proxy);
        });

        this.app.use(graphqlUploadExpress());

        /* Bounce all unauthenticated non-graphql HTTP requests */
        // this.app.use((req: Request, res: Response, next: NextFunction) => {
        //     if (req.user === undefined || req.user.username === undefined) {
        //         res.status(401).json(new CustomError('Please log in first.'));
        //         return;
        //     }
        //     next();
        // });

        this.app.get('/file/:fileId', fileDownloadController);

    }


    private createApolloServer(resolvers: any, typeDefsSchema: any, endpoint: string) {

        /* putting schema together */
        const schema = makeExecutableSchema({
            typeDefs: typeDefsSchema,
            resolvers: {
                ...resolvers,
                BigInt: scalarResolvers,
                // This maps the `Upload` scalar to the implementation provided
                // by the `graphql-upload` package.
                Upload: GraphQLUpload
            }
        });

        const gqlServer = new ApolloServer({
            schema,
            allowBatchedHttpRequests: true,
            plugins: [
                {
                    async serverWillStart() {
                        logPlugin.serverWillStartLogPlugin();
                        return {
                            async drainServer() {
                                subscriptionServer.close();
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
                    jwt.verify(token, pubkey, function (err: any) {
                        if (err) {
                            throw new UserInputError('JWT verification failed. ' + err);
                        }
                    });
                    // store the associated user with the JWT to context
                    const associatedUser = await userRetrieval(pubkey);
                    req.user = associatedUser;
                }
                return ({ req, res });
            },
            formatError: (error) => {
                // TO_DO: generate a ref uuid for errors so the clients can contact admin
                // TO_DO: check if the error is not thrown my me manually then switch to generic error to client and log
                // Logger().error(error);
                return error;
            }
        });

        gqlServer.start().then(() => {
            gqlServer.applyMiddleware({ app: this.app, cors: { credentials: true }, path: endpoint });
        });


        /* register the graphql subscription functionalities */
        const subscriptionServer = SubscriptionServer.create({
            // This is the `schema` we just created.
            schema,
            // These are imported from `graphql`.
            execute,
            subscribe
        }, {
            // This is the `httpServer` we created in a previous step.
            server: this.server,
            // Pass a different path here if your ApolloServer serves at
            // a different path.
            path: endpoint
        });
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
