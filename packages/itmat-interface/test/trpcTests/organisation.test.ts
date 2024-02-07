/**
 * @with Minio
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { MongoMemoryServer } from 'mongodb-memory-server';
import { db } from '../../src/database/database';
import { Express } from 'express';
import { objStore } from '../../src/objStore/objStore';
import request from 'supertest';
import { connectAdmin, connectUser } from './_loginHelper';
import { Router } from '../../src/server/router';
import { MongoClient } from 'mongodb';
import { setupDatabase } from '@itmat-broker/itmat-setup';
import config from '../../config/config.sample.json';
import { v4 as uuid } from 'uuid';
import { enumUserTypes } from '@itmat-broker/itmat-types';
import path from 'path';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { errorCodes } from 'packages/itmat-interface/src/graphql/errors';
if (global.hasMinio) {
    let app: Express;
    let mongodb: MongoMemoryServer;
    let admin: request.SuperTest<request.Test>;
    let user: request.SuperTest<request.Test>;
    let mongoConnection: MongoClient;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let mongoClient: Db;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let adminProfile;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let userProfile;

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
        config.objectStore.port = (global as any).minioContainerPort;
        config.database.mongo_url = connectionString;
        config.database.database = dbName;
        await db.connect(config.database, MongoClient);
        await objStore.connect(config.objectStore);
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

        // add the root node for each user
        const users = await db.collections!.users_collection.find({}).toArray();
        adminProfile = users.filter(el => el.type === enumUserTypes.ADMIN)[0];
        userProfile = users.filter(el => el.type === enumUserTypes.STANDARD)[0];
    });

    afterEach(async () => {
        await db.collections!.studies_collection.deleteMany({});
        await db.collections!.files_collection.deleteMany({});
        await db.collections!.roles_collection.deleteMany({});
        await db.collections!.field_dictionary_collection.deleteMany({});
        await db.collections!.data_collection.deleteMany({});
        await db.collections!.organisations_collection.deleteMany({});
    });

    describe('tRPC organisation APIs', () => {
        test('Create organisation', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/org.createOrganisation');
            request.attach('profile', filePath);
            request.field('name', 'Test Organisation');
            const response = await request;
            expect(response.status).toBe(200);
            expect(response.body.result.data.name).toBe('Test Organisation');
            const org = await db.collections!.organisations_collection.findOne({ name: 'Test Organisation' });
            expect(org.id).toBe(response.body.result.data.id);
        });
        test('Create organisation (no permission)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = user.post('/trpc/org.createOrganisation');
            request.attach('profile', filePath);
            request.field('name', 'Test Organisation');
            const response = await request;
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
        });
        test('Create organisation (duplicate)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/org.createOrganisation');
            request.attach('profile', filePath);
            request.field('name', 'Test Organisation');
            await request;
            const request2 = admin.post('/trpc/org.createOrganisation');
            request2.attach('profile', filePath);
            request2.field('name', 'Test Organisation');
            const response = await request2;
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Organisation already exists.');
        });
        test('Create organisation (no permission)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/RandomFile.random');
            const request = admin.post('/trpc/org.createOrganisation');
            request.attach('profile', filePath);
            request.field('name', 'Test Organisation');
            const response = await request;
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('File type not supported.');
        });
        test('Delete organisation', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/org.createOrganisation');
            request.attach('profile', filePath);
            request.field('name', 'Test Organisation');
            const response1 = await request;
            const response2 = await admin.post('/trpc/org.deleteOrganisation')
                .send({
                    organisationId: response1.body.result.data.id
                });
            expect(response2.status).toBe(200);
            expect(response2.body.result.data.successful).toBe(true);
        });
        test('Delete organisation (no permission)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/org.createOrganisation');
            request.attach('profile', filePath);
            request.field('name', 'Test Organisation');
            const response1 = await request;
            const response2 = await user.post('/trpc/org.deleteOrganisation')
                .send({
                    organisationId: response1.body.result.data.id
                });
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
        });
        test('Delete organisation (organisation does not exist)', async () => {
            const response = await admin.post('/trpc/org.deleteOrganisation')
                .send({
                    organisationId: 'random'
                });
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Organisation does not exist.');
        });
        test('Edit organisation', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/org.createOrganisation');
            request.attach('profile', filePath);
            request.field('name', 'Test Organisation');
            const response1 = await request;
            const request2 = admin.post('/trpc/org.editOrganisation');
            request2.attach('profile', filePath);
            request2.field('organisationId', response1.body.result.data.id);
            request2.field('name', 'Edit Organisation');
            const response2 = await request2;
            expect(response2.status).toBe(200);
            expect(response2.body.result.data.successful).toBe(true);
            const org = await db.collections!.organisations_collection.findOne({ id: response1.body.result.data.id });
            const files = await db.collections!.files_collection.find({}).toArray();
            expect(org.name).toBe('Edit Organisation');
            expect(files).toHaveLength(2);
        });
        test('Edit organisation (no permission)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/org.createOrganisation');
            request.attach('profile', filePath);
            request.field('name', 'Test Organisation');
            const response1 = await request;
            const request2 = user.post('/trpc/org.editOrganisation');
            request2.attach('profile', filePath);
            request2.field('organisationId', response1.body.result.data.id);
            request2.field('name', 'Edit Organisation');
            const response2 = await request2;
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
            const org = await db.collections!.organisations_collection.findOne({ id: response1.body.result.data.id });
            const files = await db.collections!.files_collection.find({}).toArray();
            expect(org.name).toBe('Test Organisation');
            expect(files).toHaveLength(1);
        });
        test('Edit organisation (invalid file type)', async () => {
            let filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/org.createOrganisation');
            request.attach('profile', filePath);
            request.field('name', 'Test Organisation');
            const response1 = await request;
            filePath = path.join(__dirname, '../filesForTests/RandomFile.random');
            const request2 = admin.post('/trpc/org.editOrganisation');
            request2.attach('profile', filePath);
            request2.field('organisationId', response1.body.result.data.id);
            request2.field('name', 'Edit Organisation');
            const response2 = await request2;
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe('File type not supported.');
            const org = await db.collections!.organisations_collection.findOne({ id: response1.body.result.data.id });
            const files = await db.collections!.files_collection.find({}).toArray();
            expect(org.name).toBe('Test Organisation');
            expect(files).toHaveLength(1);
        });
        test('Edit organisation (organisation does not exist)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/org.editOrganisation');
            request.attach('profile', filePath);
            request.field('organisationId', 'random');
            request.field('name', 'Edit Organisation');
            const response = await request;
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Organisation does not exist.');
        });
    });
} else {
    test(`${__filename.split(/[\\/]/).pop()} skipped because it requires Minio on Docker`, () => {
        expect(true).toBe(true);
    });
}