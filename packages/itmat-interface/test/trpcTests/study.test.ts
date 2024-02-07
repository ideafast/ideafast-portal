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
import { enumUserTypes, enumStudyRoles, enumDataTypes } from '@itmat-broker/itmat-types';
import path from 'path';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { errorCodes } from 'packages/itmat-interface/src/graphql/errors';
import { encodeQueryParams } from '../utils/trpc';
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
    });

    describe('tRPC drive APIs', () => {
        test('Create a study', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response = await request;
            expect(response.status).toBe(200);
            expect(response.body.result.data.name).toBe('Test Study');
            const file = await db.collections!.files_collection.findOne({});
            expect(file?.id).toBe(response.body.result.data.profile);
            const study = await db.collections!.studies_collection.findOne({});
            expect(study.id).toBe(response.body.result.data.id);
        });
        test('Create a study (no permission)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = user.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response = await request;
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
        });
        test('Create a study (duplicates names)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            await request;
            const request2 = admin.post('/trpc/study.createStudy');
            request2.attach('profile', filePath);
            request2.field('name', 'Test Study');
            request2.field('description', '');
            const response2 = await request2;
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe('Study name already used.');
        });
        test('Edit a study', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const request2 = admin.post('/trpc/study.editStudy');
            request2.field('studyId', response1.body.result.data.id);
            request2.attach('profile', filePath);
            request2.field('name', 'Test Study edited');
            request2.field('description', '');
            const response2 = await request2;
            expect(response2.status).toBe(200);
            expect(response2.body.result.data.name).toBe('Test Study edited');
            const files = await db.collections!.files_collection.find({}).toArray();
            expect(files).toHaveLength(2);
            expect(files[1]?.id).toBe(response2.body.result.data.profile);
            const study = await db.collections!.studies_collection.findOne({});
            expect(study.id).toBe(response2.body.result.data.id);
        });
        test('Edit a study (no permission)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const request2 = user.post('/trpc/study.editStudy');
            request2.field('studyId', response1.body.result.data.id);
            request2.attach('profile', filePath);
            request2.field('name', 'Test Study edited');
            request2.field('description', '');
            const response2 = await request2;
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
        });
        test('Edit a study (study does not exist)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.editStudy');
            request.field('studyId', 'random');
            request.attach('profile', filePath);
            request.field('name', 'Test Study edited');
            request.field('description', '');
            const response = await request;
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Study does not exist.');
        });
        test('Delete a study', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const response2 = await admin.post('/trpc/study.deleteStudy')
                .send({
                    studyId: response1.body.result.data.id
                });
            expect(response2.status).toBe(200);
            expect(response2.body.result.data.id).toBe(response1.body.result.data.id);
        });
        test('Delete a study (no permission)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const response2 = await user.post('/trpc/study.deleteStudy')
                .send({
                    studyId: response1.body.result.data.id
                });
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
        });
        test('Delete a study (study does not exist)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            await request;
            const response2 = await admin.post('/trpc/study.deleteStudy')
                .send({
                    studyId: 'random'
                });
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe('Study does not exist.');
        });
        test('Get studies', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const fullPermissionRole = {
                id: 'full_permission_role_id',
                studyId: response1.body.result.data.id,
                name: 'Full Permissison Role',
                description: '',
                // data permissions for studyId
                dataPermissions: [{
                    fields: ['^1.*$'],
                    dataProperties: {
                    },
                    permission: parseInt('110', 2)
                }],
                studyRole: enumStudyRoles.STUDY_MANAGER,
                users: [userProfile.id],
                groups: []
            };
            await db.collections!.roles_collection.insertOne(fullPermissionRole);
            const paramteres: any = {
            };
            const response2 = await user.get('/trpc/study.getStudies?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response2.status).toBe(200);
            expect(response2.body.result.data).toHaveLength(1);
            expect(response2.body.result.data[0].id).toBe(response1.body.result.data.id);
        });
        test('Get studies (with valid study id)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const fullPermissionRole = {
                id: 'full_permission_role_id',
                studyId: response1.body.result.data.id,
                name: 'Full Permissison Role',
                description: '',
                // data permissions for studyId
                dataPermissions: [{
                    fields: ['^1.*$'],
                    dataProperties: {
                    },
                    permission: parseInt('110', 2)
                }],
                studyRole: enumStudyRoles.STUDY_MANAGER,
                users: [userProfile.id],
                groups: []
            };
            await db.collections!.roles_collection.insertOne(fullPermissionRole);
            const paramteres: any = {
                studyId: response1.body.result.data.id
            };
            const response2 = await user.get('/trpc/study.getStudies?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response2.status).toBe(200);
            expect(response2.body.result.data).toHaveLength(1);
            expect(response2.body.result.data[0].id).toBe(response1.body.result.data.id);
        });
        test('Get studies (with valid study id)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const fullPermissionRole = {
                id: 'full_permission_role_id',
                studyId: response1.body.result.data.id,
                name: 'Full Permissison Role',
                description: '',
                // data permissions for studyId
                dataPermissions: [{
                    fields: ['^1.*$'],
                    dataProperties: {
                    },
                    permission: parseInt('110', 2)
                }],
                studyRole: enumStudyRoles.STUDY_MANAGER,
                users: [userProfile.id],
                groups: []
            };
            await db.collections!.roles_collection.insertOne(fullPermissionRole);
            const paramteres: any = {
                studyId: 'random'
            };
            const response2 = await user.get('/trpc/study.getStudies?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
        });
        test('Create a new data version', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const fullPermissionRole = {
                id: 'full_permission_role_id',
                studyId: response1.body.result.data.id,
                name: 'Full Permissison Role',
                description: '',
                // data permissions for studyId
                dataPermissions: [{
                    fields: ['^1.*$'],
                    dataProperties: {
                    },
                    permission: parseInt('110', 2)
                }],
                studyRole: enumStudyRoles.STUDY_MANAGER,
                users: [userProfile.id],
                groups: []
            };
            await db.collections!.roles_collection.insertOne(fullPermissionRole);
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: response1.body.result.data.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: response1.body.result.data.id,
                    data: [{
                        fieldId: '1',
                        value: '10'
                    }]
                });
            const response2 = await user.post('/trpc/study.createDataVersion')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersion: '1.0',
                    tag: '1.0'
                });
            expect(response2.status).toBe(200);
            expect(response2.body.result.data.version).toBe('1.0');
            const data = await db.collections!.data_collection.findOne({});
            const field = await db.collections!.field_dictionary_collection.findOne({});
            const study = await db.collections!.studies_collection.findOne({});
            expect(field?.dataVersion).toBe(response2.body.result.data.id);
            expect(data?.dataVersion).toBe(response2.body.result.data.id);
            expect(study?.currentDataVersion).toBe(0);
            expect(study?.dataVersions).toHaveLength(1);
            expect(study?.dataVersions[0].id).toBe(response2.body.result.data.id);
        });
        test('Create a new data version (no permission)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const fullPermissionRole = {
                id: 'full_permission_role_id',
                studyId: response1.body.result.data.id,
                name: 'Full Permissison Role',
                description: '',
                // data permissions for studyId
                dataPermissions: [{
                    fields: ['^1.*$'],
                    dataProperties: {
                    },
                    permission: parseInt('110', 2)
                }],
                studyRole: enumStudyRoles.STUDY_USER,
                users: [userProfile.id],
                groups: []
            };
            await db.collections!.roles_collection.insertOne(fullPermissionRole);
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: response1.body.result.data.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: response1.body.result.data.id,
                    data: [{
                        fieldId: '1',
                        value: '10'
                    }]
                });
            const response2 = await user.post('/trpc/study.createDataVersion')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersion: '1.0',
                    tag: '1.0'
                });
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
        });
        test('Create a new data version (version is not float string)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const fullPermissionRole = {
                id: 'full_permission_role_id',
                studyId: response1.body.result.data.id,
                name: 'Full Permissison Role',
                description: '',
                // data permissions for studyId
                dataPermissions: [{
                    fields: ['^1.*$'],
                    dataProperties: {
                    },
                    permission: parseInt('110', 2)
                }],
                studyRole: enumStudyRoles.STUDY_MANAGER,
                users: [userProfile.id],
                groups: []
            };
            await db.collections!.roles_collection.insertOne(fullPermissionRole);
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: response1.body.result.data.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: response1.body.result.data.id,
                    data: [{
                        fieldId: '1',
                        value: '10'
                    }]
                });
            const response2 = await user.post('/trpc/study.createDataVersion')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersion: '1.0.5',
                    tag: '1.0'
                });
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe('Version must be a float number.');
        });
        test('Create a new data version (duplicate versions)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const fullPermissionRole = {
                id: 'full_permission_role_id',
                studyId: response1.body.result.data.id,
                name: 'Full Permissison Role',
                description: '',
                // data permissions for studyId
                dataPermissions: [{
                    fields: ['^1.*$'],
                    dataProperties: {
                    },
                    permission: parseInt('110', 2)
                }],
                studyRole: enumStudyRoles.STUDY_MANAGER,
                users: [userProfile.id],
                groups: []
            };
            await db.collections!.roles_collection.insertOne(fullPermissionRole);
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: response1.body.result.data.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: response1.body.result.data.id,
                    data: [{
                        fieldId: '1',
                        value: '10'
                    }]
                });
            await user.post('/trpc/study.createDataVersion')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersion: '1.0',
                    tag: '1.0'
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: response1.body.result.data.id,
                    data: [{
                        fieldId: '1',
                        value: '11'
                    }]
                });
            const response2 = await user.post('/trpc/study.createDataVersion')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersion: '1.0',
                    tag: '1.0'
                });
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe('Version has been used.');
        });
        test('Create a new data version (nothing update)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const fullPermissionRole = {
                id: 'full_permission_role_id',
                studyId: response1.body.result.data.id,
                name: 'Full Permissison Role',
                description: '',
                // data permissions for studyId
                dataPermissions: [{
                    fields: ['^1.*$'],
                    dataProperties: {
                    },
                    permission: parseInt('110', 2)
                }],
                studyRole: enumStudyRoles.STUDY_MANAGER,
                users: [userProfile.id],
                groups: []
            };
            await db.collections!.roles_collection.insertOne(fullPermissionRole);
            const response = await user.post('/trpc/study.createDataVersion')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersion: '1.0',
                    tag: '1.0'
                });
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Nothing to update.');
        });
        test('Set to a previous data version', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const fullPermissionRole = {
                id: 'full_permission_role_id',
                studyId: response1.body.result.data.id,
                name: 'Full Permissison Role',
                description: '',
                // data permissions for studyId
                dataPermissions: [{
                    fields: ['^1.*$'],
                    dataProperties: {
                    },
                    permission: parseInt('110', 2)
                }],
                studyRole: enumStudyRoles.STUDY_MANAGER,
                users: [userProfile.id],
                groups: []
            };
            await db.collections!.roles_collection.insertOne(fullPermissionRole);
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: response1.body.result.data.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: response1.body.result.data.id,
                    data: [{
                        fieldId: '1',
                        value: '10'
                    }]
                });
            const response2 = await user.post('/trpc/study.createDataVersion')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersion: '1.0',
                    tag: '1.0'
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: response1.body.result.data.id,
                    data: [{
                        fieldId: '1',
                        value: '11'
                    }]
                });
            await user.post('/trpc/study.createDataVersion')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersion: '1.1',
                    tag: '1.1'
                });
            const response3 = await user.post('/trpc/study.setDataversionAsCurrent')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersionId: response2.body.result.data.id
                });
            expect(response3.status).toBe(200);
            expect(response3.body.result.data.successful).toBe(true);
            const study = await db.collections!.studies_collection.findOne({});
            expect(study?.currentDataVersion).toBe(0);
            expect(study?.dataVersions).toHaveLength(2);
        });
        test('Set to a previous data version (no permission)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const fullPermissionRole = {
                id: 'full_permission_role_id',
                studyId: response1.body.result.data.id,
                name: 'Full Permissison Role',
                description: '',
                // data permissions for studyId
                dataPermissions: [{
                    fields: ['^1.*$'],
                    dataProperties: {
                    },
                    permission: parseInt('110', 2)
                }],
                studyRole: enumStudyRoles.STUDY_MANAGER,
                users: [userProfile.id],
                groups: []
            };
            await db.collections!.roles_collection.insertOne(fullPermissionRole);
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: response1.body.result.data.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: response1.body.result.data.id,
                    data: [{
                        fieldId: '1',
                        value: '10'
                    }]
                });
            const response2 = await user.post('/trpc/study.createDataVersion')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersion: '1.0',
                    tag: '1.0'
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: response1.body.result.data.id,
                    data: [{
                        fieldId: '1',
                        value: '11'
                    }]
                });
            await db.collections?.roles_collection.updateOne({}, {
                $set: {
                    studyRole: enumStudyRoles.STUDY_USER
                }
            });
            await user.post('/trpc/study.createDataVersion')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersion: '1.1',
                    tag: '1.1'
                });
            const response3 = await user.post('/trpc/study.setDataversionAsCurrent')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersionId: response2.body.result.data.id
                });
            expect(response3.status).toBe(400);
            expect(response3.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
        });
        test('Set to a previous data version (version id not exist)', async () => {
            const filePath = path.join(__dirname, '../filesForTests/dsi.jpeg');
            const request = admin.post('/trpc/study.createStudy');
            request.attach('profile', filePath);
            request.field('name', 'Test Study');
            request.field('description', '');
            const response1 = await request;
            const fullPermissionRole = {
                id: 'full_permission_role_id',
                studyId: response1.body.result.data.id,
                name: 'Full Permissison Role',
                description: '',
                // data permissions for studyId
                dataPermissions: [{
                    fields: ['^1.*$'],
                    dataProperties: {
                    },
                    permission: parseInt('110', 2)
                }],
                studyRole: enumStudyRoles.STUDY_MANAGER,
                users: [userProfile.id],
                groups: []
            };
            await db.collections!.roles_collection.insertOne(fullPermissionRole);
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: response1.body.result.data.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: response1.body.result.data.id,
                    data: [{
                        fieldId: '1',
                        value: '10'
                    }]
                });
            await user.post('/trpc/study.createDataVersion')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersion: '1.0',
                    tag: '1.0'
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: response1.body.result.data.id,
                    data: [{
                        fieldId: '1',
                        value: '11'
                    }]
                });
            await user.post('/trpc/study.createDataVersion')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersion: '1.1',
                    tag: '1.1'
                });
            const response3 = await user.post('/trpc/study.setDataversionAsCurrent')
                .send({
                    studyId: response1.body.result.data.id,
                    dataVersionId: 'random'
                });
            expect(response3.status).toBe(400);
            expect(response3.body.error.message).toBe('Data version does not exist.');
        });
    });
} else {
    test(`${__filename.split(/[\\/]/).pop()} skipped because it requires Minio on Docker`, () => {
        expect(true).toBe(true);
    });
}