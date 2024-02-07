import { v4 as uuid } from 'uuid';
import request from 'supertest';
import { print } from 'graphql';
import { connectAdmin, connectUser } from './_loginHelper';
import { db } from '../../src/database/database';
import { Router } from '../../src/server/router';
import { Db, MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setupDatabase } from '@itmat-broker/itmat-setup';
import config from '../../config/config.sample.json';
import * as mfa from '../../src/utils/mfa';
import { LOGIN } from '@itmat-broker/itmat-models';
import { enumAPIResolver, enumEventStatus, enumEventType } from '@itmat-broker/itmat-types';
import { Express } from 'express';
import { seedUsers } from 'packages/itmat-setup/src/databaseSetup/seed/users';

let app: Express;
let mongodb: MongoMemoryServer;
let admin: request.SuperTest<request.Test>;
let user: request.SuperTest<request.Test>;
let mongoConnection: MongoClient;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let mongoClient: Db;

afterAll(async () => {
    await db.closeConnection();
    await mongoConnection?.close();
    await mongodb.stop();

    /* claer all mocks */
    jest.clearAllMocks();
});

beforeAll(async () => { // eslint-disable-line no-undef
    /* Creating a in-memory MongoDB instance for testing */
    const dbName = uuid();
    mongodb = await MongoMemoryServer.create({ instance: { dbName } });
    const connectionString = mongodb.getUri();
    await setupDatabase(connectionString, dbName);

    /* Wiring up the backend server */
    config.database.mongo_url = connectionString;
    config.database.database = dbName;
    await db.connect(config.database, MongoClient);
    const router = new Router(config);
    await router.init();

    /* Connect mongo client (for test setup later / retrieve info later) */
    mongoConnection = await MongoClient.connect(connectionString);
    mongoClient = mongoConnection.db(dbName);

    /* Connecting clients for testing later */
    app = router.getApp();
    admin = request.agent(app);
    user = request.agent(app);
    await connectAdmin(admin);
    await connectUser(user);

    /* Mock Date for testing */
    jest.spyOn(Date, 'now').mockImplementation(() => 1591134065000);
});

describe('LOG API', () => {
    describe('Write logs', () => {
        test('Write log (Login)', async () => {
            const otp = mfa.generateTOTP(seedUsers[1].otpSecret).toString();
            const res = await user.post('/graphql').set('Content-type', 'application/json').send({
                query: print(LOGIN),
                variables: {
                    username: seedUsers[1].username,
                    password: 'admin',
                    totp: otp
                }
            });
            expect(res.status).toBe(200);
            const findLogInMongo = await db.collections!.log_collection.find({}).toArray();
            const lastLog = findLogInMongo.pop();
            expect(lastLog).toBeDefined();
            if (!lastLog)
                return;
            expect(lastLog.requester).toBe(seedUsers[1].id);
            expect(lastLog.type).toBe(enumEventType.API_LOG);
            expect(lastLog.apiResolver).toBe(enumAPIResolver.GraphQL);
            expect(lastLog.event).toBe('login');
            expect(lastLog.status).toBe(enumEventStatus.SUCCESS);
            expect(lastLog.errors).toBeNull();
        });
    });
});