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
import { resolversV0, resolversV1 } from '../graphql/resolvers';
import { schemaV0 } from '../graphql/schemaV0';
import { schemaV1 } from '../graphql/schemaV1';
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
            saveUninitialized: true
            // store: new MongoStore({ client: db.client })
        }));


        /* authenticating user of the request */
        this.app.use(passport.initialize());
        this.app.use(passport.session());
        passport.serializeUser(userLoginUtils.serialiseUser);
        passport.deserializeUser(userLoginUtils.deserialiseUser);


        /* register apolloserver for graphql requests */
        this.server = http.createServer(this.app);
        this.createApolloServer(resolversV0, schemaV0, '/api/v0');
        this.createApolloServer(resolversV1, schemaV1, '/api/v1');

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

    private createApolloServer(resolvers: any, schema: any, endPoints: string) {
        const gqlServer = new ApolloServer({
            typeDefs: schema,
            resolvers: resolvers,
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

        gqlServer.applyMiddleware({ app: this.app, cors: { credentials: true }, path: endPoints });

        /* register the graphql subscription functionalities */
        gqlServer.installSubscriptionHandlers(this.server);
    }

    public getApp(): Express {
        return this.app;
    }

    public getServer(): http.Server {
        return this.server;
    }
}
