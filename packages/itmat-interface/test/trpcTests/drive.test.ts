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
import { enumUserTypes, enumDriveNodeTypes, IGroupNode, enumGroupNodeTypes } from '@itmat-broker/itmat-types';
import { encodeQueryParams } from '../utils/trpc';
import { errorCodes } from '../../src/graphql/errors';
import path from 'path';

if (global.hasMinio) {
    let app: Express;
    let mongodb: MongoMemoryServer;
    let admin: request.SuperTest<request.Test>;
    let user: request.SuperTest<request.Test>;
    let mongoConnection: MongoClient;
    // let mongoClient: Db;
    let adminProfile;
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

    beforeEach(async () => {
        const users = await db.collections!.users_collection.find({}).toArray();
        for (const user of users) {
            const uid = uuid();
            await db.collections!.drives_collection.insertOne({
                id: uid,
                managerId: user.id,
                path: [uid],
                restricted: true,
                name: 'My Drive',
                description: null,
                fileId: null,
                type: enumDriveNodeTypes.FOLDER,
                parent: null,
                children: [],
                sharedUsers: [],
                sharedGroups: [],
                life: {
                    createdTime: 0,
                    createdUser: enumUserTypes.SYSTEM,
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            });
        }
    });

    afterEach(async () => {
        await db.collections!.drives_collection.deleteMany({});
        await db.collections!.groups_collection.deleteMany({});
    });

    describe('tRPC drive APIs', () => {
        test('Get drives of a user', async () => {
            const paramteres: any = {
                userId: userProfile.id
            };
            const response = await user.get('/trpc/drive.getDrives?input=' + encodeQueryParams(paramteres))
                .query({

                });
            expect(response.status).toBe(200);
            expect(response.body.errors).toBeUndefined();
            expect(Object.keys(response.body.result.data)).toHaveLength(1);
            const key = Object.keys(response.body.result.data)[0];
            expect(response.body.result.data[key]).toHaveLength(1);
        });
        test('Get drives of a user (User does not exist)', async () => {
            const paramteres: any = {
                userId: 'random'
            };
            const response = await user.get('/trpc/drive.getDrives?input=' + encodeQueryParams(paramteres))
                .query({

                });
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('User does not exist.');
            // expect(response.body.errors[0])
        });
        test('Get drives of a user (Invalid root id)', async () => {
            const paramteres: any = {
                userId: userProfile.id,
                rootId: 'random'
            };
            const response = await user.get('/trpc/drive.getDrives?input=' + encodeQueryParams(paramteres))
                .query({

                });
            expect(response.status).toBe(200);
            expect(Object.keys(response.body.result.data)).toHaveLength(0);
        });
        test('Create a Drive Folder', async () => {
            const root = (await db.collections!.drives_collection.find({ managerId: userProfile.id }).toArray())[0];
            const response = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: root.id,
                    description: null
                });
            expect(response.status).toBe(200);
            expect(response.body.result.data.name).toBe('Test');
            const drives = await db.collections!.drives_collection.find({ managerId: userProfile.id }).toArray();
            expect(drives[1].parent).toBe(drives[0].id);
        });
        test('Create a Drive Folder (in default root)', async () => {
            const response = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            expect(response.status).toBe(200);
            expect(response.body.result.data.name).toBe('Test');
            const drives = await db.collections!.drives_collection.find({ managerId: userProfile.id }).toArray();
            expect(drives[1].parent).toBe(drives[0].id);
        });
        test('Create a Drive Folder (for unpermitted parent)', async () => {
            const root = (await db.collections!.drives_collection.find({ managerId: adminProfile.id }).toArray())[0];
            const response = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: root.id,
                    description: null
                });
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
        });
        test('Create a Drive Folder (folder already exist)', async () => {
            await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            const response = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Folder already exists.');
        });
        test('Create a Drive File', async () => {
            const root = (await db.collections!.drives_collection.find({ managerId: userProfile.id }).toArray())[0];
            const filePath = path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt');
            const request = user.post('/trpc/drive.createDriveFile');
            request.attach('file', filePath);
            request.field('parentId', root.id);
            request.field('description', '');
            const response = await request;

            expect(response.status).toBe(200);
            expect(response.body.result.data.name).toBe('I7N3G6G-MMM7N3G6G-20200704-20200721.txt');
            const drives = await db.collections!.drives_collection.find({ managerId: userProfile.id }).toArray();
            expect(drives).toHaveLength(2);
            expect(response.body.result.data.parent).toBe(drives[0].id);

        });
        test('Create a Drive File （in default root）', async () => {
            const filePath = path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt');
            const request = user.post('/trpc/drive.createDriveFile');
            request.attach('file', filePath);
            request.field('parentId', '');
            request.field('description', '');
            const response = await request;

            expect(response.status).toBe(200);
            expect(response.body.result.data.name).toBe('I7N3G6G-MMM7N3G6G-20200704-20200721.txt');
            const drives = await db.collections!.drives_collection.find({ managerId: userProfile.id }).toArray();
            expect(drives).toHaveLength(2);
            expect(response.body.result.data.parent).toBe(drives[0].id);

        });
        test('Create a Drive File （for unpermitted parent）', async () => {
            const filePath = path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt');
            const request = user.post('/trpc/drive.createDriveFile');
            request.attach('file', filePath);
            request.field('parentId', 'random');
            request.field('description', '');
            const response = await request;
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Parent node does not exist.');
            const drives = await db.collections!.drives_collection.find({ managerId: userProfile.id }).toArray();
            expect(drives).toHaveLength(1);
        });
        test('Create a Drive File （file already exist）', async () => {
            function createDriveFile(filePath, parentId, description) {
                const request = user.post('/trpc/drive.createDriveFile');
                request.attach('file', filePath);
                request.field('parentId', parentId);
                request.field('description', description);
                return request;
            }

            const filePath = path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt');
            await createDriveFile(filePath, '', '');
            const response = await createDriveFile(filePath, '', '');
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('File already exists.');
        });
        test('Delete a drive node', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            const drives = await db.collections!.drives_collection.find({ 'managerId': userProfile.id, 'life.deletedTime': null }).toArray();
            expect(drives).toHaveLength(2);
            const response2 = await user.post('/trpc/drive.deleteDrive')
                .send({
                    driveId: response1.body.result.data.id
                });
            expect(response2.status).toBe(200);
            expect(response2.body.result.data.id).toBe(response1.body.result.data.id);
            const drives2 = await db.collections!.drives_collection.find({ 'managerId': userProfile.id, 'life.deletedTime': null }).toArray();
            expect(drives2).toHaveLength(1);
        });
        test('Delete a drive node (with recursive children)', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            const drives = await db.collections!.drives_collection.find({ 'managerId': userProfile.id, 'life.deletedTime': null }).toArray();
            expect(drives).toHaveLength(2);
            await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test2',
                    parentId: response1.body.result.data.id,
                    description: null
                });
            const drives2 = await db.collections!.drives_collection.find({ 'managerId': userProfile.id, 'life.deletedTime': null }).toArray();
            expect(drives2).toHaveLength(3);
            const response3 = await user.post('/trpc/drive.deleteDrive')
                .send({
                    driveId: response1.body.result.data.id
                });
            expect(response3.status).toBe(200);
            expect(response3.body.result.data.id).toBe(response1.body.result.data.id);
            const drives3 = await db.collections!.drives_collection.find({ 'managerId': userProfile.id, 'life.deletedTime': null }).toArray();
            expect(drives3).toHaveLength(1);
        });
        test('Delete a drive node (node does not exist)', async () => {
            await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            const response = await user.post('/trpc/drive.deleteDrive')
                .send({
                    driveId: 'random'
                });
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Drive does not exist.');
            const drives = await db.collections!.drives_collection.find({ 'managerId': userProfile.id, 'life.deletedTime': null }).toArray();
            expect(drives).toHaveLength(2);
        });
        test('Share folders/files to another user via email', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            const response2 = await user.post('/trpc/drive.shareDriveToUserViaEmail')
                .send({
                    userEmails: [adminProfile.email],
                    driveId: response1.body.result.data.parent,
                    permissions: {
                        read: true,
                        write: false,
                        delete: false
                    }
                });
            expect(response2.status).toBe(200);
            expect(response2.body.result.data.driveIds).toEqual([response1.body.result.data.parent, response1.body.result.data.id]);
            const drives = await db.collections!.drives_collection.find({ managerId: userProfile.id }).toArray();
            expect(drives[0].sharedUsers).toContainEqual({ iid: adminProfile.id, read: true, write: false, delete: false });
            expect(drives[1].sharedUsers).toContainEqual({ iid: adminProfile.id, read: true, write: false, delete: false });
            const paramteres: any = {
                userId: adminProfile.id
            };
            const response3 = await user.get('/trpc/drive.getDrives?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response3.status).toBe(200);
            expect(response3.body.result.data[userProfile.id]).toBeDefined();
            expect(response3.body.result.data[userProfile.id]).toHaveLength(2);
        });
        test('Share folders/files to another user via email (Email does not exist)', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            const response2 = await user.post('/trpc/drive.shareDriveToUserViaEmail')
                .send({
                    userEmails: ['random'],
                    driveId: response1.body.result.data.parent,
                    permissions: {
                        read: true,
                        write: false,
                        delete: false
                    }
                });
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe('User does not exist.');
        });
        test('Share folders/files to another user group', async () => {
            const group: IGroupNode = {
                id: 'group',
                studyId: null,
                nameOrId: 'Group',
                type: enumGroupNodeTypes.GROUP,
                description: null,
                parentId: null,
                children: [adminProfile.id],
                life: {
                    createdTime: 0,
                    createdUser: enumUserTypes.SYSTEM,
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            };
            await db.collections!.groups_collection.insertOne(group);
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            const response2 = await user.post('/trpc/drive.shareDriveToGroupById')
                .send({
                    groupId: group.id,
                    driveId: response1.body.result.data.parent,
                    permissions: {
                        read: true,
                        write: false,
                        delete: false
                    }
                });
            expect(response2.status).toBe(200);
            expect(response2.body.result.data.driveIds).toEqual([response1.body.result.data.parent, response1.body.result.data.id]);
            const drives = await db.collections!.drives_collection.find({ managerId: userProfile.id }).toArray();
            expect(drives[0].sharedGroups).toContainEqual({ iid: group.id, read: true, write: false, delete: false });
            expect(drives[1].sharedGroups).toContainEqual({ iid: group.id, read: true, write: false, delete: false });
            const paramteres: any = {
                userId: adminProfile.id
            };
            const response3 = await user.get('/trpc/drive.getDrives?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response3.status).toBe(200);
            expect(response3.body.result.data[userProfile.id]).toBeDefined();
            expect(response3.body.result.data[userProfile.id]).toHaveLength(2);
        });
        test('Edit a drive', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            const response2 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: response1.body.result.data.id,
                    description: null
                });
            const response3 = await user.post('/trpc/drive.editDrive')
                .send({
                    driveId: response1.body.result.data.id,
                    sharedUsers: [{
                        iid: adminProfile.id,
                        read: true,
                        write: false,
                        delete: false
                    }]
                });
            expect(response3.status).toBe(200);
            expect(response3.body.result.data.driveIds).toEqual([response1.body.result.data.id, response2.body.result.data.id]);
            const drives = await db.collections!.drives_collection.find({ id: { $in: [response1.body.result.data.id, response2.body.result.data.id] } }).toArray();
            expect(drives[0].sharedUsers[0]).toEqual({ iid: adminProfile.id, read: true, write: false, delete: false });
            expect(drives[1].sharedUsers[0]).toEqual({ iid: adminProfile.id, read: true, write: false, delete: false });
        });
        test('Edit a drive (drive does not exist)', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: response1.body.result.data.id,
                    description: null
                });
            const response3 = await user.post('/trpc/drive.editDrive')
                .send({
                    driveId: 'random',
                    sharedUsers: [{
                        iid: adminProfile.id,
                        read: true,
                        write: false,
                        delete: false
                    }]
                });
            expect(response3.status).toBe(400);
            expect(response3.body.error.message).toBe('Drive does not exist.');
        });
        test('Edit a drive (not owned drive)', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: response1.body.result.data.id,
                    description: null
                });
            const response3 = await admin.post('/trpc/drive.editDrive')
                .send({
                    driveId: response1.body.result.data.id,
                    sharedUsers: [{
                        iid: adminProfile.id,
                        read: true,
                        write: false,
                        delete: false
                    }]
                });
            expect(response3.status).toBe(400);
            expect(response3.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
        });
        test('Edit a drive (manager does not exist)', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: response1.body.result.data.id,
                    description: null
                });
            const response3 = await user.post('/trpc/drive.editDrive')
                .send({
                    driveId: response1.body.result.data.id,
                    managerId: 'random'
                });
            expect(response3.status).toBe(400);
            expect(response3.body.error.message).toBe('Manager does not exist.');
        });
        test('Edit a drive (parent does not exist)', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: response1.body.result.data.id,
                    description: null
                });
            const response3 = await user.post('/trpc/drive.editDrive')
                .send({
                    driveId: response1.body.result.data.id,
                    parentId: 'random'
                });
            expect(response3.status).toBe(400);
            expect(response3.body.error.message).toBe('Parent does not exist.');
        });
        test('Edit a drive (children does not exist)', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: response1.body.result.data.id,
                    description: null
                });
            const response3 = await user.post('/trpc/drive.editDrive')
                .send({
                    driveId: response1.body.result.data.id,
                    children: ['random']
                });
            expect(response3.status).toBe(400);
            expect(response3.body.error.message).toBe('Children do not exist.');
        });
        test('Edit a drive (shared users do not exist)', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: response1.body.result.data.id,
                    description: null
                });
            const response3 = await user.post('/trpc/drive.editDrive')
                .send({
                    driveId: response1.body.result.data.id,
                    sharedUsers: [{
                        iid: 'random',
                        read: true,
                        write: false,
                        delete: false
                    }]
                });
            expect(response3.status).toBe(400);
            expect(response3.body.error.message).toBe('Shared users do not exist.');
        });
        test('Edit a drive (shared groups do not exist)', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: response1.body.result.data.id,
                    description: null
                });
            const response3 = await user.post('/trpc/drive.editDrive')
                .send({
                    driveId: response1.body.result.data.id,
                    sharedGroups: [{
                        iid: 'random',
                        read: true,
                        write: false,
                        delete: false
                    }]
                });
            expect(response3.status).toBe(400);
            expect(response3.body.error.message).toBe('Shared groups do not exist.');
        });
        test('Edit a drive (empty update)', async () => {
            const response1 = await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: null,
                    description: null
                });
            await user.post('/trpc/drive.createDriveFolder')
                .send({
                    folderName: 'Test',
                    parentId: response1.body.result.data.id,
                    description: null
                });
            const response3 = await user.post('/trpc/drive.editDrive')
                .send({
                    driveId: response1.body.result.data.id
                });
            expect(response3.status).toBe(400);
            expect(response3.body.error.message).toBe('You have to edit at lease one property.');
        });
    });
} else {
    test(`${__filename.split(/[\\/]/).pop()} skipped because it requires Minio on Docker`, () => {
        expect(true).toBe(true);
    });
}