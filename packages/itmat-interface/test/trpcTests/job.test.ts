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
import { Db, MongoClient } from 'mongodb';
import { setupDatabase } from '@itmat-broker/itmat-setup';
import config from '../../config/config.sample.json';
import { v4 as uuid } from 'uuid';
import { enumJobType, enumUserTypes } from '@itmat-broker/itmat-types';
if (global.hasMinio) {
    let app: Express;
    let mongodb: MongoMemoryServer;
    let admin: request.SuperTest<request.Test>;
    let user: request.SuperTest<request.Test>;
    let mongoConnection: MongoClient;
    // let mongoClient: Db;
    // let adminProfile;
    // let userProfile;

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
        await db.collections!.jobs_collection.deleteMany({});
    });

    describe('tRPC job APIs', () => {
        test('Create a job', async () => {
            const response = await user.post('/trpc/job.createJob')
                .send({
                    name: 'Test Job',
                    startTime: 10000,
                    period: 10000,
                    type: enumJobType.SYSTEMPROCESS,
                    data: null,
                    parameters: {},
                    priority: 100
                });
            expect(response.status).toBe(200);
            expect(response.body.result.data.name).toBe('Test Job');
            const job = await db.collections!.jobs_collection.findOne({});
            expect(job.id).toBe(response.body.result.data.id);
        });
    });
} else {
    test(`${__filename.split(/[\\/]/).pop()} skipped because it requires Minio on Docker`, () => {
        expect(true).toBe(true);
    });
}