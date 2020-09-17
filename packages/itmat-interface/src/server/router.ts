import { ApolloServer } from 'apollo-server-express';
import bodyParser from 'body-parser';
// import connectMongo from 'connect-mongo';
import cors from 'cors';
import express from 'express';
import { Express } from 'express';
import session from 'express-session';
import http from 'http';
import passport from 'passport';
// import { db } from '../database/database';
import { resolversV1, resolversV2 } from '../graphql/resolvers';
import { schemaV1 } from '../graphql/schemaV1';
import { schemaV2 } from '../graphql/schemaV2';
import { fileDownloadController } from '../rest/fileDownload';
import { userLoginUtils } from '../utils/userLoginUtils';
import { IConfiguration } from '../utils/configManager';
import { logPlugin } from '../log/logPlugin';
import { spaceFixing } from '../utils/regrex';
// const MongoStore = connectMongo(session);

export class Router {
    private readonly app: Express;
    private readonly server: http.Server;

    constructor(config: IConfiguration) {
        this.app = express();

        if (process.env.NODE_ENV === 'development')
            this.app.use(cors({ credentials: true }));

        this.app.use(bodyParser.json({ limit: '50mb' }));
        this.app.use(bodyParser.urlencoded({ extended: true }));


        /* save persistent sessions in mongo */
        this.app.use(session({
            secret: config.sessionsSecret,
            resave: true,
            saveUninitialized: true,
            cookie: { maxAge: 2 *60 * 60 * 1000 /** 2 hour **/ }
            // store: new MongoStore({ client: db.client })
        }));


        /* authenticating user of the request */
        this.app.use(passport.initialize());
        this.app.use(passport.session());
        passport.serializeUser(userLoginUtils.serialiseUser);
        passport.deserializeUser(userLoginUtils.deserialiseUser);


        /* register apolloserver for graphql requests */
        const gqlServer = new ApolloServer({
            typeDefs: schemaV1,
            resolvers: resolversV1,
            plugins: [
                {
                    serverWillStart() {
                        logPlugin.serverWillStartLogPlugin();
                    }
                },
                {
                    requestDidStart() {
                        return {
                            executionDidStart(requestContext) {
                                const operation = requestContext.operationName;
                                const actionData = requestContext.request.variables;
                                (requestContext as any).request.variables = spaceFixing(operation, actionData);
                            },
                            willSendResponse(requestContext) {
                                logPlugin.requestDidStartLogPlugin(requestContext);
                            }
                        };
                    },
                }
            ],
            context: ({ req, res }) => {
                /* Bounce all unauthenticated graphql requests */
                // if (req.user === undefined && req.body.operationName !== 'login' && req.body.operationName !== 'IntrospectionQuery' ) {  // login and schema introspection doesn't need authentication
                //     throw new ForbiddenError('not logged in');
                // }
                return ({ req, res });
            },
            formatError: (error) => {
                // TO_DO: generate a ref uuid for errors so the clients can contact admin
                // TO_DO: check if the error is not thrown my me manually then switch to generic error to client and log
                // Logger().error(error);
                return error;
            }
        });

        gqlServer.applyMiddleware({ app: this.app, cors: { credentials: true }, path: '/api/v1' });

        /* register the graphql subscription functionalities */
        this.server = http.createServer(this.app);
        gqlServer.installSubscriptionHandlers(this.server);

        /* SECOND SERVER */
        /* register apolloserver for graphql requests */
        const gqlServer2 = new ApolloServer({
            typeDefs: schemaV2,
            resolvers: resolversV2,
            plugins: [
                {
                    serverWillStart() {
                        logPlugin.serverWillStartLogPlugin();
                    }
                },
                {
                    requestDidStart() {
                        return {
                            executionDidStart(requestContext) {
                                const operation = requestContext.operationName;
                                const actionData = requestContext.request.variables;
                                (requestContext as any).request.variables = spaceFixing(operation, actionData);
                            },
                            willSendResponse(requestContext) {
                                logPlugin.requestDidStartLogPlugin(requestContext);
                            }
                        };
                    },
                }
            ],
            context: ({ req, res }) => {
                /* Bounce all unauthenticated graphql requests */
                // if (req.user === undefined && req.body.operationName !== 'login' && req.body.operationName !== 'IntrospectionQuery' ) {  // login and schema introspection doesn't need authentication
                //     throw new ForbiddenError('not logged in');
                // }
                return ({ req, res });
            },
            formatError: (error) => {
                // TO_DO: generate a ref uuid for errors so the clients can contact admin
                // TO_DO: check if the error is not thrown my me manually then switch to generic error to client and log
                // Logger().error(error);
                return error;
            }
        });

        gqlServer2.applyMiddleware({ app: this.app, cors: { credentials: true }, path: '/api/v2' });

        /* register the graphql subscription functionalities */
        this.server = http.createServer(this.app);
        gqlServer2.installSubscriptionHandlers(this.server);

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

    public getApp(): Express {
        return this.app;
    }

    public getServer(): http.Server {
        return this.server;
    }
}
