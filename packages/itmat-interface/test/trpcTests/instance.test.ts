import request from 'supertest';
import { db } from '../../src/database/database';
import { TRPCError } from '@trpc/server';
import { objStore } from '../../src/objStore/objStore';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { Express } from 'express';
import { Router } from '../../src/server/router';
import { setupDatabase } from '@itmat-broker/itmat-setup';
import { connectAdmin } from './_loginHelper';
import config from '../../config/config.sample.json';

// Add necessary imports for instance types and enums
import { enumInstanceStatus, enumAppType, IInstance } from '@itmat-broker/itmat-types';

let app: Express;
let admin: request.SuperTest<request.Test>;
let mongodb: MongoMemoryServer;
let mongoConnection: MongoClient;
let mongoClient: Db;

beforeAll(async () => {
    const dbName = 'test-instance';
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

    app = router.getApp();

    admin = request.agent(app);
    await connectAdmin(admin);

});

afterAll(async () => {
    await mongoConnection.close();
    await mongodb.stop();
    jest.clearAllMocks();
});

describe('Instance operations via tRPC', () => {
    let instanceId: string;

    test('Create instance', async () => {
        const instanceData = {
            name: 'Test Instance',
            type: 'virtual-machine',
            appType: enumAppType.JUPYTER,
            lifeSpan: 3600,
            cpuLimit: 4,
            memoryLimit: '4GB'
        };
        const response = await admin.post('/trpc/instance.createInstance').send(instanceData);
        expect(response.status).toBe(200);
        const instance = await mongoClient.collection('instances').findOne({ name: 'Test Instance' });
        expect(instance).toBeDefined();
        expect(instance?.status).toBe(enumInstanceStatus.PENDING); // Added null check
        instanceId = instance?.id; // Added null check
    });

    test('Start instance', async () => {
        const action = 'start';
        const response = await admin.post('/trpc/instance.startStopInstance').send({ instanceId, action });
        expect(response.status).toBe(200);
        const instance = await mongoClient.collection('instance_collection').findOne({ id: instanceId });
        expect(instance?.status).toBe(enumInstanceStatus.STARTING);
    });

    test('Stop instance', async () => {
        const action = 'stop';
        const response = await admin.post('/trpc/instance.startStopInstance').send({ instanceId, action });
        expect(response.status).toBe(200);
        const instance = await mongoClient.collection('instance_collection').findOne({ id: instanceId });
        expect(instance?.status).toBe(enumInstanceStatus.STOPPING);
    });

    test('Edit instance', async () => {
        const updates = { name: 'Updated Test Instance' };
        const response = await admin.post('/trpc/instance.editInstance').send({ instanceId, updates });
        expect(response.status).toBe(200);
        const updatedInstance = await mongoClient.collection('instance_collection').findOne({ id: instanceId });
        expect(updatedInstance?.name).toBe('Updated Test Instance');
    });

    test('Delete instance', async () => {
        const response = await admin.post('/trpc/instance.deleteInstance').send({ instanceId });
        expect(response.status).toBe(200);
        const deletedInstance = await mongoClient.collection('instance_collection').findOne({ id: instanceId });
        expect(deletedInstance?.status).toBe(enumInstanceStatus.DELETED);
    });

    test('Get instances', async () => {
        const response = await admin.get('/trpc/instance.getInstances');
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBeTruthy();
        expect(response.body.length).toBeGreaterThan(0);
    });
});

