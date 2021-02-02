import request from 'supertest';
import { print } from 'graphql';
import { connectAdmin, connectUser } from './_loginHelper';
import { db } from '../../src/database/database';
import { Router } from '../../src/server/router';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setupDatabase } from 'itmat-setup';
import config from '../../config/config.sample.json';
import { errorCodes } from '../../src/graphql/errors';
import * as mfa from '../../src/utils/mfa';
import { v4 as uuid} from 'uuid';
import {
    CREATE_DOC,
    EDIT_DOC,
    GET_DOCS,
    IDoc,
    DOC_TYPE,
    DOC_STATUS
} from 'itmat-commons';
import { expression } from '@babel/template';

let app;
let mongodb;
let admin;
let user;
let mongoConnection;
let mongoClient;

// const SEED_STANDARD_USER_USERNAME = 'standardUser';
// const SEED_STANDARD_USER_EMAIL = 'standard@example.com';
// const TEMP_USER_TEST_EMAIL = process.env.TEST_RECEIVER_EMAIL_ADDR || SEED_STANDARD_USER_EMAIL;
// const SKIP_EMAIL_TEST = process.env.SKIP_EMAIL_TEST === 'true';


afterAll(async () => {
    await db.closeConnection();
    await mongoConnection?.close();
    await mongodb.stop();

    /* clear all mocks */
    jest.clearAllMocks();
});

beforeAll(async () => { // eslint-disable-line no-undef
    /* Creating a in-memory MongoDB instance for testing */
    mongodb = new MongoMemoryServer();
    const connectionString = await mongodb.getUri();
    const database = await mongodb.getDbName();
    await setupDatabase(connectionString, database);

    /* Wiring up the backend server */
    config.database.mongo_url = connectionString;
    config.database.database = database;
    await db.connect(config.database, MongoClient.connect);
    const router = new Router(config);

    /* Connect mongo client (for test setup later / retrieve info later) */
    mongoConnection = await MongoClient.connect(connectionString, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    mongoClient = mongoConnection.db(database);

    /* Connecting clients for testing later */
    app = router.getApp();
    admin = request.agent(app);
    user = request.agent(app);
    await connectAdmin(admin);
    await connectUser(user);

    /* Mock for testing */
    jest.spyOn(Date, 'now').mockImplementation(() => 1591134065000);
    // jest.mock('uuid', () => ({ v4: () => 'testId'}));
    jest.spyOn(uuid.prototype, 'uuid').mockReturnValue('testId');

});

describe('DOC API', () => {
    describe('Create a doc (admin)', () => {
        test('Write log (Login)', async () => {
            const userSecret = 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA';
            const newDoc = {
                docType: DOC_TYPE.DOCUMENTATION,
                title: 'test title0',
                data: '<p>test data</p>',
                user: 'test user0',
                attachments: [{fileName: 'test attachment filename0', fileBase64: 'test attachment filebase640'}]
            };
            const res = await admin.post('/graphql').set('Content-type', 'application/json').send({
                query: print(CREATE_DOC),
                variables: newDoc
            });
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.createDoc).toEqual({
                id: 'testId',
                title: 'test title0',
                data: '<p>test data</p>',
                docType: DOC_TYPE.DOCUMENTATION,
                createdAt: 1591134065000,
                lastModifiedAt: 1591134065000,
                lastModifiedBy: 'test user0',
                status: DOC_STATUS.DEACTIVATED,
                attachments:[{fileName: 'test attachment filename0', fileBase64: 'test attachment filebase640'}]
            });
        }, 30000);
    });

    // describe('Edit a doc (admin)', () => {
    //     test('Write log (Login)', async () => {
    //         const userSecret = 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA';
    //         const existedDoc: IDoc = {
    //             id: 'testId',
    //             title: 'test title0',
    //             data: '<p>test data</p>',
    //             docType: DOC_TYPE.DOCUMENTATION,
    //             createdAt: 1591134065000,
    //             lastModifiedAt: 1591134065000,
    //             lastModifiedBy: 'test user0',
    //             status: DOC_STATUS.DEACTIVATED,
    //             attachments:[{fileName: 'test attachment filename0', fileBase64: 'test attachment filebase640'}]
    //         };
    //         await mongoClient.collection(config.database.collections.docs_collection).insertOne(existedDoc);
    //         const res = await admin.post('/graphql').set('Content-type', 'application/json').send({
    //             query: print(EDIT_DOC),
    //             variables: {
    //                 docType: DOC_TYPE.NOTIFICATION,
    //                 title: 'test title modified',
    //                 data: '<p>test data modified</p>',
    //                 status: DOC_STATUS.ACTIVATED
    //             }
    //         });
    //         expect(res.status).toBe(200);
    //         expect(res.body.errors).toBeUndefined();
    //         expect(res.body.data.createDoc).toEqual({
    //             id: 'testId',
    //             title: 'test title modified',
    //             data: '<p>test data modified</p>',
    //             docType: DOC_TYPE.DOCUMENTATION,
    //             createdAt: 1591134060000,
    //             lastModifiedAt: 1591134065000,
    //             lastModifiedBy: 'test user0',
    //             status: DOC_STATUS.ACTIVATED,
    //             attachments:[{fileName: 'test attachment filename0', fileBase64: 'test attachment filebase640'}]
    //         })
    //     }, 30000);

    // });

    // describe('Get logs', () => {
    //     beforeAll(async () => {
    //         // write initial data for testing
    //         const logSample = [{
    //             id: '001',
    //             requesterName: userTypes.SYSTEM,
    //             requesterType: userTypes.SYSTEM,
    //             logType: LOG_TYPE.SYSTEM_LOG,
    //             userAgent: USER_AGENT.MOZILLA,
    //             actionType: LOG_ACTION.startSERVER,
    //             actionData: JSON.stringify({}),
    //             time: 100000000,
    //             status: LOG_STATUS.SUCCESS,
    //             error: ''
    //         }];
    //         await db.collections!.log_collection.insertMany(logSample);
    //     });

    //     afterAll(async () => {
    //         await mongoClient.collection(config.database.collections.log_collection).remove({});
    //     });

    //     test('GET log (admin)', async () => {
    //         const res = await admin.post('/graphql').send({
    //             query: print(GET_LOGS),
    //             variables: {
    //             }
    //         });
    //         expect(res.status).toBe(200);
    //         expect(res.body.errors).toBeUndefined();
    //         expect(res.body.data.getLogs.length).toBeGreaterThanOrEqual(1);
    //     }, 30000);

    //     test('GET log (user) should fail', async () => {
    //         const res = await user.post('/graphql').send({
    //             query: print(GET_LOGS),
    //             variables: {
    //                 requesterId: 'test_id1'
    //             }
    //         });
    //         expect(res.status).toBe(200);
    //         expect(res.body.errors).toHaveLength(1);
    //         expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
    //     }, 30000);
    // });
});
