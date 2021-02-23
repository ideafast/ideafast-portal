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
import {
    CREATE_DOC,
    EDIT_DOC,
    GET_DOCS,
    IDoc,
    DOC_TYPE,
    DOC_STATUS
} from 'itmat-commons';

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
});

describe('DOC API', () => {
    describe('Write doc', () => {
        test('Write a doc (admin)', async () => {
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
            expect(res.body.data.createDoc.title).toEqual('test title0');
            expect(res.body.data.createDoc.docType).toEqual(DOC_TYPE.DOCUMENTATION);
            expect(res.body.data.createDoc.createdAt).toEqual(1591134065000);
            expect(res.body.data.createDoc.lastModifiedAt).toEqual(1591134065000);
            expect(res.body.data.createDoc.lastModifiedBy).toEqual('test user0');
            expect(res.body.data.createDoc.status).toEqual(DOC_STATUS.DEACTIVATED);

        }, 30000);

        test('Write a doc (user, should fail)', async () => {
            const newDoc = {
                docType: DOC_TYPE.DOCUMENTATION,
                title: 'test title0',
                data: '<p>test data</p>',
                user: 'test user0',
                attachments: [{fileName: 'test attachment filename0', fileBase64: 'test attachment filebase640'}]
            };
            const res = await user.post('/graphql').set('Content-type', 'application/json').send({
                query: print(CREATE_DOC),
                variables: newDoc
            });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
        }, 30000);
    });

    describe('Edit a doc', () => {
        test('Edit doc (admin)', async () => {
            const existedDoc: IDoc = {
                id: 'testId',
                title: 'test title0',
                data: '<p>test data</p>',
                docType: DOC_TYPE.DOCUMENTATION,
                createdAt: 1591134060000,
                lastModifiedAt: 1591134060000,
                lastModifiedBy: 'test user0',
                status: DOC_STATUS.DEACTIVATED,
                attachments:[{id: 'attach1', fileName: 'test attachment filename0', fileBase64: 'test attachment filebase640'}]
            };
            await mongoClient.collection(config.database.collections.docs_collection).insertOne(existedDoc);
            const res = await admin.post('/graphql').set('Content-type', 'application/json').send({
                query: print(EDIT_DOC),
                variables: {
                    id: 'testId',
                    docType: DOC_TYPE.NOTIFICATION,
                    title: 'test title modified',
                    data: '<p>test data modified</p>',
                    user: 'test user1',
                    status: DOC_STATUS.ACTIVATED,
                    attachments: [{fileName: 'test attachment filename0', fileBase64: 'test attachment filebase640'}]
                }
            });
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.editDoc.title).toEqual('test title modified');
            expect(res.body.data.editDoc.docType).toEqual(DOC_TYPE.NOTIFICATION);
            expect(res.body.data.editDoc.lastModifiedAt).toEqual(1591134065000);
            expect(res.body.data.editDoc.lastModifiedBy).toEqual('test user1');
            expect(res.body.data.editDoc.status).toEqual(DOC_STATUS.ACTIVATED);
        }, 30000);

        test('Edit doc (user, should fail)', async () => {
            const res = await user.post('/graphql').set('Content-type', 'application/json').send({
                query: print(EDIT_DOC),
                variables: {
                    id: 'testId',
                    docType: DOC_TYPE.NOTIFICATION,
                    title: 'test title modified',
                    data: '<p>test data modified</p>',
                    user: 'test user1',
                    status: DOC_STATUS.ACTIVATED,
                    attachments: [{fileName: 'test attachment filename0', fileBase64: 'test attachment filebase640'}]
                }
            });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
        }, 30000);

    });

    describe('Get docs (admin)', () => {
        test('Get doc', async () => {
            const res = await admin.post('/graphql').set('Content-type', 'application/json').send({
                query: print(GET_DOCS),
                variables: {
                    withData: true
                }
            });
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.getDocs).toHaveLength(2);
            expect(res.body.data.getDocs[1].title).toEqual('test title modified');
            expect(res.body.data.getDocs[1].data).toEqual('<p>test data modified</p>');
            expect(res.body.data.getDocs[1].docType).toEqual(DOC_TYPE.NOTIFICATION);
            expect(res.body.data.getDocs[1].createdAt).toEqual(1591134060000);
            expect(res.body.data.getDocs[1].lastModifiedAt).toEqual(1591134065000);
            expect(res.body.data.getDocs[1].lastModifiedBy).toEqual('test user1');
            expect(res.body.data.getDocs[1].status).toEqual(DOC_STATUS.ACTIVATED);
            expect(res.body.data.getDocs[1].attachments[0].fileName).toEqual('test attachment filename0');
            expect(res.body.data.getDocs[1].attachments[0].fileBase64).toEqual('test attachment filebase640');
        }, 30000);

    });
});
