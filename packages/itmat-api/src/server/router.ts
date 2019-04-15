import express from 'express';
import { Express, Request, Response, NextFunction } from 'express';
import { CustomError, Logger } from 'itmat-utils';
import { UserController, FileController } from '../RESTControllers';
import { ForbiddenError, ApolloError, UserInputError, withFilter } from 'apollo-server-express';
import bodyParser from 'body-parser';
import passport from 'passport';
import session from 'express-session';
import connectMongo from 'connect-mongo';
import multer from 'multer';
import http from 'http';
import { ApolloServer, gql } from 'apollo-server-express';
import { schema } from '../graphql/schema';
import { resolvers } from '../graphql/resolvers';
import { Database } from '../database/database';
import cors from 'cors';
const MongoStore = connectMongo(session);
const upload = multer();

export class Router {
    private readonly app: Express;
    private server: http.Server;

    constructor(
        db: Database /* the database to save sessions */,
        userController: UserController,
        fileController: FileController
    ) {
        this.app = express();

        this.app.use(cors({ origin: 'http://localhost:3000', credentials: true }));  // TO_DO: remove in production

        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));


        /* save persistent sessions in mongo */
        this.app.use(session({
            secret: 'IAmATeapot',
            store: new MongoStore({ db: db.db } as any)
        }));


        /* authenticating user of the request */
        this.app.use(passport.initialize());
        this.app.use(passport.session());
        passport.serializeUser(userController.serialiseUser);
        passport.deserializeUser(userController.deserialiseUser);


        /* register apolloserver for graphql requests */
        const gqlServer = new ApolloServer({
            typeDefs: schema,
            resolvers,
            context: ({ req, res }: any) => {
                /* Bounce all unauthenticated graphql requests */
                // if (req.user === undefined && req.body.operationName !== 'login' && req.body.operationName !== 'IntrospectionQuery' ) {  // login and schema introspection doesn't need authentication
                //     throw new ForbiddenError('not logged in');
                // }
                return ({ req, res, db });
            },
            formatError: (error: ApolloError) => {
                // TO_DO: generate a ref uuid for errors so the clients can contact admin
                // TO_DO: check if the error is not thrown my me manually then switch to generic error to client and log
                Logger.error(error);
                return error;
            }
        });
        gqlServer.applyMiddleware({ app: this.app, cors: { origin: 'http://localhost:3000', credentials: true } });


        /* register the graphql subscription functionalities */
        this.server = http.createServer(this.app);
        gqlServer.installSubscriptionHandlers(this.server);


        /* Bounce all unauthenticated non-graphql HTTP requests */
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            if (req.user === undefined || req.user.username === undefined) {
                res.status(401).json(new CustomError('Please log in first.'));
                return;
            }
            next();
        });


        this.app.route('/file')
            .get(fileController.downloadFile)
            .post(upload.single('file'), fileController.uploadFile);

        this.app.all('/', (err: Error, req: Request, res: Response, next: NextFunction) => {
            res.status(500).json(new CustomError('Server error.'));
        });
    }

    public getApp(): any {
        return this.server;
    }
}