/**
 * @with Minio
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import request from 'supertest';
import { print } from 'graphql';
import { connectAdmin, connectUser, connectAgent } from './_loginHelper';
import { db } from '../../src/database/database';
import { objStore } from '../../src/objStore/objStore';
import { Router } from '../../src/server/router';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../../src/graphql/errors';
import { Db, MongoClient } from 'mongodb';
import { IStudy, IUser, IRole, IFile, IField, enumDataTypes, enumUserTypes } from '@itmat-broker/itmat-types';
import { UPLOAD_FILE, CREATE_STUDY, DELETE_FILE, ADD_NEW_ROLE } from '@itmat-broker/itmat-models';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setupDatabase } from '@itmat-broker/itmat-setup';
import config from '../../config/config.sample.json';

if (global.hasMinio) {
    let app: Express;
    let mongodb: MongoMemoryServer;
    let admin: request.SuperTest<request.Test>;
    let user: request.SuperTest<request.Test>;
    let mongoConnection: MongoClient;
    let mongoClient: Db;

    afterAll(async () => {
        await db.closeConnection();
        await mongoConnection?.close();
        await mongodb.stop();
    });

    beforeAll(async () => { // eslint-disable-line no-undef

        /* Creating a in-memory MongoDB instance for testing */
        const dbName = uuid();
        mongodb = await MongoMemoryServer.create({ instance: { dbName } });
        const connectionString = mongodb.getUri();
        await setupDatabase(connectionString, dbName);

        /* Wiring up the backend server */
        config.objectStore.port = global.minioContainerPort;
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
    }, 10000);

    describe('FILE API', () => {
        let adminId: any;
        let dataAuthorisedUser: request.SuperTest<request.Test>; // client
        let dataAuthorisedUserProfile: IUser;

        beforeAll(async () => {
            /* setup: first retrieve the generated user id */
            const result = await mongoClient.collection<IUser>(config.database.collections.users_collection).find({}, { projection: { id: 1, username: 1 } }).toArray();
            adminId = result.filter((e: { username: string; }) => e.username === 'admin')[0].id;
        });

        describe('UPLOAD AND DOWNLOAD FILE', () => {
            describe('UPLOAD FILE', () => {
                /* note: a new study is created and a special authorised user for study permissions */
                let createdStudy: { id: any; };
                beforeEach(async () => {
                    /* setup: create a study to upload file to */
                    const studyname = uuid();
                    const createStudyRes = await admin.post('/graphql').send({
                        query: print(CREATE_STUDY),
                        variables: { name: studyname, description: 'test description', type: 'SENSOR' }
                    });
                    expect(createStudyRes.status).toBe(200);
                    expect(createStudyRes.body.errors).toBeUndefined();

                    /* setup: getting the created study Id */
                    createdStudy = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOne({ name: studyname });
                    expect(createStudyRes.body.data.createStudy).toMatchObject({
                        id: createdStudy.id,
                        name: studyname,
                        description: 'test description'
                    });

                    // create field for both studies
                    await mongoClient.collection<IField>(config.database.collections.field_dictionary_collection).insertMany([{
                        id: '8e3fac1d-fa19-44fc-8250-7709d7af5524',
                        studyId: createdStudy.id,
                        fieldName: 'Device_McRoberts',
                        fieldId: 'Device_McRoberts',
                        description: null,
                        dataType: enumDataTypes.FILE,
                        categoricalOptions: null,
                        unit: null,
                        comments: 'Field for deviceid MMM',
                        dataVersion: null,
                        verifier: null,
                        properties: null,
                        life: {
                            createdTime: 0,
                            createdUser: adminId,
                            deletedTime: null,
                            deletedUser: null
                        },
                        metadata: {}
                    }, {
                        id: 'ff0c2e60-5086-4111-91ca-475168977ae6',
                        studyId: createdStudy.id,
                        fieldName: 'Device_Axivity',
                        fieldId: 'Device_Axivity',
                        description: null,
                        dataType: enumDataTypes.FILE,
                        categoricalOptions: null,
                        unit: null,
                        comments: 'Field for deviceid AX6',
                        dataVersion: null,
                        verifier: null,
                        properties: null,
                        life: {
                            createdTime: 0,
                            createdUser: adminId,
                            deletedTime: null,
                            deletedUser: null
                        },
                        metadata: {}
                    }]);
                    /* setup: creating a privileged user */
                    const dataAuthorisedUsername = uuid();
                    dataAuthorisedUserProfile = {
                        id: dataAuthorisedUsername,
                        username: dataAuthorisedUsername,
                        email: `${dataAuthorisedUsername}@user.io`,
                        firstname: `${dataAuthorisedUsername}_firstname`,
                        lastname: `${dataAuthorisedUsername}_lastname`,
                        organisation: 'organisation_system',
                        type: enumUserTypes.STANDARD,
                        emailNotificationsActivated: false,
                        resetPasswordRequests: [],
                        password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                        otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                        profile: null,
                        description: 'I am an authorised study user.',
                        expiredAt: 1991134065000,
                        life: {
                            createdTime: 1591134065000,
                            createdUser: adminId,
                            deletedTime: null,
                            deletedUser: null
                        },
                        metadata: {}
                    };
                    const roleName = uuid();
                    await admin.post('/graphql').send({
                        query: print(ADD_NEW_ROLE),
                        variables: {
                            roleName,
                            studyId: createdStudy.id,
                            projectId: null
                        }
                    });
                    await db.collections!.users_collection.insertOne(dataAuthorisedUserProfile);
                    const authorisedRole = await mongoClient.collection<IRole>(config.database.collections.roles_collection).findOne({ name: roleName });
                    await db.collections!.roles_collection.findOneAndUpdate({ id: authorisedRole.id }, {
                        $push: {
                            users: dataAuthorisedUserProfile.id,
                            dataPermissions: {
                                fields: [
                                    '^.*$'
                                ],
                                dataProperties: {
                                    'Participant ID': [
                                        '^.*$'
                                    ],
                                    'Visit ID': [
                                        '^.*$'
                                    ]
                                },
                                includeUnVersioned: true,
                                permission: 7
                            }
                        }
                    });
                    dataAuthorisedUser = request.agent(app);
                    await connectAgent(dataAuthorisedUser, dataAuthorisedUserProfile.username, 'admin', dataAuthorisedUserProfile.otpSecret);
                });

                afterEach(async () => {
                    await mongoClient.collection<IStudy>(config.database.collections.studies_collection).deleteMany({});
                    await mongoClient.collection<IField>(config.database.collections.field_dictionary_collection).deleteMany({});
                    await mongoClient.collection<IFile>(config.database.collections.files_collection).deleteMany({});
                });

                test('Upload file to SENSOR study (admin)', async () => {
                    /* test: upload file */
                    const res = await admin.post('/graphql')
                        .field('operations', JSON.stringify({
                            query: print(UPLOAD_FILE),
                            variables: {
                                studyId: createdStudy.id,
                                file: null,
                                description: JSON.stringify({ participantId: 'I7N3G6G', deviceId: 'MMM7N3G6G', startDate: 1593827200000, endDate: 1595296000000 }),
                                fileLength: 21,
                                hash: 'b0dc2ae76cdea04dcf4be7fcfbe36e2ce8d864fe70a1895c993ce695274ba7a0'
                            }
                        }))
                        .field('map', JSON.stringify({ 1: ['variables.file'] }))
                        .attach('1', path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt'));
                    /* setup: geting the created file Id */
                    const createdFile = await mongoClient.collection<IFile>(config.database.collections.files_collection).findOne({ fileName: 'I7N3G6G-MMM7N3G6G-20200704-20200721.txt', studyId: createdStudy.id });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toBeUndefined();
                    const { uploadTime, uri, ...uploadFile } = res.body.data.uploadFile;
                    expect(uri).toBeDefined();
                    expect(uploadTime).toBeDefined();
                    expect(uploadFile).toEqual({
                        id: createdFile.id,
                        fileName: 'I7N3G6G-MMM7N3G6G-20200704-20200721.txt',
                        studyId: createdStudy.id,
                        projectId: null,
                        fileSize: '21',
                        description: JSON.stringify({ participantId: 'I7N3G6G', deviceId: 'MMM7N3G6G', startDate: 1593827200000, endDate: 1595296000000 }),
                        uploadedBy: adminId,
                        hash: 'b0dc2ae76cdea04dcf4be7fcfbe36e2ce8d864fe70a1895c993ce695274ba7a0',
                        metadata: {
                            deviceId: 'MMM7N3G6G',
                            endDate: 1595296000000,
                            participantId: 'I7N3G6G',
                            startDate: 1593827200000
                        }
                    });
                });

                test('Upload file to study (user with no privilege) (should fail)', async () => {
                    /* test: upload file */
                    const res = await user.post('/graphql')
                        .field('operations', JSON.stringify({
                            query: print(UPLOAD_FILE),
                            variables: {
                                studyId: createdStudy.id,
                                file: null,
                                description: JSON.stringify({ participantId: 'I7N3G6G', deviceId: 'MMM7N3G6G', startDate: 1593827200000, endDate: 1595296000000 }),
                                fileLength: 21,
                                hash: 'b0dc2ae76cdea04dcf4be7fcfbe36e2ce8d864fe70a1895c993ce695274ba7a0'
                            }
                        }))
                        .field('map', JSON.stringify({ 1: ['variables.file'] }))
                        .attach('1', path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt'));

                    expect(res.status).toBe(200);
                    expect(res.body.errors).toHaveLength(1);
                    expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
                    expect(res.body.data.uploadFile).toEqual(null);
                });

                test('Upload file to study (user with privilege)', async () => {
                    /* test: upload file */
                    const res = await dataAuthorisedUser.post('/graphql')
                        .field('operations', JSON.stringify({
                            query: print(UPLOAD_FILE),
                            variables: {
                                studyId: createdStudy.id,
                                file: null,
                                description: JSON.stringify({ participantId: 'I7N3G6G', deviceId: 'MMM7N3G6G', startDate: 1593827200000, endDate: 1595296000000 }),
                                fileLength: 21,
                                hash: 'b0dc2ae76cdea04dcf4be7fcfbe36e2ce8d864fe70a1895c993ce695274ba7a0'
                            }
                        }))
                        .field('map', JSON.stringify({ 1: ['variables.file'] }))
                        .attach('1', path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt'));

                    /* setup: geting the created file Id */
                    const createdFile = await mongoClient.collection<IFile>(config.database.collections.files_collection).findOne({ fileName: 'I7N3G6G-MMM7N3G6G-20200704-20200721.txt', studyId: createdStudy.id });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toBeUndefined();
                    const { uploadTime, uri, ...uploadFile } = res.body.data.uploadFile;
                    expect(uri).toBeDefined();
                    expect(uploadTime).toBeDefined();
                    expect(uploadFile).toEqual({
                        id: createdFile.id,
                        fileName: 'I7N3G6G-MMM7N3G6G-20200704-20200721.txt',
                        studyId: createdStudy.id,
                        projectId: null,
                        fileSize: '21',
                        description: JSON.stringify({ participantId: 'I7N3G6G', deviceId: 'MMM7N3G6G', startDate: 1593827200000, endDate: 1595296000000 }),
                        uploadedBy: dataAuthorisedUserProfile.id,
                        hash: 'b0dc2ae76cdea04dcf4be7fcfbe36e2ce8d864fe70a1895c993ce695274ba7a0',
                        metadata: {
                            deviceId: 'MMM7N3G6G',
                            endDate: 1595296000000,
                            participantId: 'I7N3G6G',
                            startDate: 1593827200000
                        }
                    });
                });

                test('Upload a empty file (admin)', async () => {
                    /* test: upload file */
                    const res = await admin.post('/graphql')
                        .field('operations', JSON.stringify({
                            query: print(UPLOAD_FILE),
                            variables: {
                                studyId: createdStudy.id,
                                file: null,
                                description: JSON.stringify({ participantId: 'IR6R4AR', deviceId: 'AX6VJH6F6', startDate: 1590976000000, endDate: 1593740800000 }),
                                fileLength: 0,
                                hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                            }
                        }))
                        .field('map', JSON.stringify({ 1: ['variables.file'] }))
                        .attach('1', path.join(__dirname, '../filesForTests/IR6R4AR-AX6VJH6F6-20200601-20200703.txt'));

                    /* setup: geting the created file Id */
                    const createdFile = await mongoClient.collection<IFile>(config.database.collections.files_collection).findOne({ fileName: 'IR6R4AR-AX6VJH6F6-20200601-20200703.txt', studyId: createdStudy.id });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toBeUndefined();
                    const { uploadTime, uri, ...uploadFile } = res.body.data.uploadFile;
                    expect(uri).toBeDefined();
                    expect(uploadTime).toBeDefined();
                    expect(uploadFile).toEqual({
                        id: createdFile.id,
                        fileName: 'IR6R4AR-AX6VJH6F6-20200601-20200703.txt',
                        studyId: createdStudy.id,
                        projectId: null,
                        fileSize: '0',
                        description: JSON.stringify({ participantId: 'IR6R4AR', deviceId: 'AX6VJH6F6', startDate: 1590976000000, endDate: 1593740800000 }),
                        uploadedBy: adminId,
                        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                        metadata: {
                            deviceId: 'AX6VJH6F6',
                            endDate: 1593740800000,
                            participantId: 'IR6R4AR',
                            startDate: 1590976000000
                        }
                    });
                });
            });

            describe('DOWNLOAD FILES', () => {
                /* note: a new study is created and a non-empty text file is uploaded before each test */
                let createdStudy;
                let createdFile: { id: any; };
                let dataAuthorisedUser: request.SuperTest<request.Test>; // client
                let dataAuthorisedUserProfile: IUser;

                beforeEach(async () => {
                    /* setup: create studies to upload file to */
                    const studyname = uuid();
                    const createStudyRes = await admin.post('/graphql').send({
                        query: print(CREATE_STUDY),
                        variables: { name: studyname, description: 'test description', type: 'SENSOR' }
                    });
                    expect(createStudyRes.status).toBe(200);
                    expect(createStudyRes.body.errors).toBeUndefined();

                    /* setup: getting the created study Id */
                    createdStudy = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOne({ name: studyname });
                    expect(createStudyRes.body.data.createStudy).toMatchObject({
                        id: createdStudy.id,
                        name: studyname,
                        description: 'test description'
                    });
                    // create field for both studies
                    await mongoClient.collection<IField>(config.database.collections.field_dictionary_collection).insertMany([{
                        id: '8e3fac1d-fa19-44fc-8250-7709d7af5524',
                        studyId: createdStudy.id,
                        fieldName: 'Device_McRoberts',
                        fieldId: 'Device_McRoberts',
                        description: null,
                        dataType: enumDataTypes.FILE,
                        categoricalOptions: null,
                        unit: null,
                        comments: 'Field for deviceid MMM',
                        dataVersion: null,
                        verifier: null,
                        properties: null,
                        life: {
                            createdTime: 0,
                            createdUser: adminId,
                            deletedTime: null,
                            deletedUser: null
                        },
                        metadata: {}
                    }, {
                        id: 'ff0c2e60-5086-4111-91ca-475168977ae6',
                        studyId: createdStudy.id,
                        fieldName: 'Device_Axivity',
                        fieldId: 'Device_Axivity',
                        description: null,
                        dataType: enumDataTypes.FILE,
                        categoricalOptions: null,
                        unit: null,
                        comments: 'Field for deviceid AX6',
                        dataVersion: null,
                        verifier: null,
                        properties: null,
                        life: {
                            createdTime: 0,
                            createdUser: adminId,
                            deletedTime: null,
                            deletedUser: null
                        },
                        metadata: {}
                    }]);
                    /* setup: upload file (would be better to upload not via app api but will do for now) */
                    const res = await admin.post('/graphql')
                        .field('operations', JSON.stringify({
                            query: print(UPLOAD_FILE),
                            variables: {
                                studyId: createdStudy.id,
                                file: null,
                                description: JSON.stringify({ participantId: 'I7N3G6G', deviceId: 'MMM7N3G6G', startDate: 1593827200000, endDate: 1595296000000 }),
                                fileLength: 21,
                                hash: 'b0dc2ae76cdea04dcf4be7fcfbe36e2ce8d864fe70a1895c993ce695274ba7a0'
                            }
                        }))
                        .field('map', JSON.stringify({ 1: ['variables.file'] }))
                        .attach('1', path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt'));
                    /* setup: geting the created file Id */
                    createdFile = res.body.data.uploadFile;
                    if (!createdFile)
                        throw 'Test file could not be retreived.';

                    /* setup: creating a privileged user */

                    /* setup: creating a privileged user */
                    const dataAuthorisedUsername = uuid();
                    dataAuthorisedUserProfile = {
                        id: dataAuthorisedUsername,
                        username: dataAuthorisedUsername,
                        email: `${dataAuthorisedUsername}@user.io`,
                        firstname: `${dataAuthorisedUsername}_firstname`,
                        lastname: `${dataAuthorisedUsername}_lastname`,
                        organisation: 'organisation_system',
                        type: enumUserTypes.STANDARD,
                        emailNotificationsActivated: false,
                        resetPasswordRequests: [],
                        password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                        otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                        profile: null,
                        description: 'I am an authorised study user.',
                        expiredAt: 1991134065000,
                        life: {
                            createdTime: 1591134065000,
                            createdUser: adminId,
                            deletedTime: null,
                            deletedUser: null
                        },
                        metadata: {}
                    };
                    const roleName = uuid();
                    await admin.post('/graphql').send({
                        query: print(ADD_NEW_ROLE),
                        variables: {
                            roleName,
                            studyId: createdStudy.id,
                            projectId: null
                        }
                    });
                    await db.collections!.users_collection.insertOne(dataAuthorisedUserProfile);
                    const authorisedRole = await mongoClient.collection<IRole>(config.database.collections.roles_collection).findOne({ name: roleName });
                    await db.collections!.roles_collection.findOneAndUpdate({ id: authorisedRole.id }, {
                        $push: {
                            users: dataAuthorisedUserProfile.id,
                            dataPermissions: {
                                fields: [
                                    '^.*$'
                                ],
                                dataProperties: {
                                    'Participant ID': [
                                        '^.*$'
                                    ],
                                    'Visit ID': [
                                        '^.*$'
                                    ]
                                },
                                includeUnVersioned: true,
                                permission: 7
                            }
                        }
                    });
                    dataAuthorisedUser = request.agent(app);
                    await connectAgent(dataAuthorisedUser, dataAuthorisedUserProfile.username, 'admin', dataAuthorisedUserProfile.otpSecret);
                });

                afterEach(async () => {
                    await mongoClient.collection<IStudy>(config.database.collections.studies_collection).deleteMany({});
                    await mongoClient.collection<IField>(config.database.collections.field_dictionary_collection).deleteMany({});
                    await mongoClient.collection<IFile>(config.database.collections.files_collection).deleteMany({});
                });

                test('Download file from study (admin)', async () => {
                    const res = await admin.get(`/file/${createdFile.id}`);
                    expect(res.status).toBe(200);
                    expect(res.headers['content-type']).toBe('application/download');
                    expect(res.headers['content-disposition']).toBe('attachment; filename="I7N3G6G-MMM7N3G6G-20200704-20200721.txt"');
                    expect(res.text).toBe('just testing I7N3G6G.');
                });

                test('Download file from study (user with privilege)', async () => {
                    const res = await dataAuthorisedUser.get(`/file/${createdFile.id}`);
                    expect(res.status).toBe(200);
                    expect(res.headers['content-type']).toBe('application/download');
                    expect(res.headers['content-disposition']).toBe('attachment; filename="I7N3G6G-MMM7N3G6G-20200704-20200721.txt"');
                    expect(res.text).toBe('just testing I7N3G6G.');
                });

                test('Download file from study (not logged in)', async () => {
                    const loggedoutUser = request.agent(app);
                    const res = await loggedoutUser.get(`/file/${createdFile.id}`);
                    expect(res.status).toBe(403);
                    expect(res.body).toEqual({ error: 'Please log in.' });
                });

                test('Download file from study (user with no privilege) (should fail)', async () => {
                    const res = await user.get(`/file/${createdFile.id}`);
                    expect(res.status).toBe(200);
                    expect(res.body).toEqual({ error: errorCodes.NO_PERMISSION_ERROR });
                });

                test('Download an non-existent file from study (admin) (should fail)', async () => {
                    const res = await admin.get('/file/fakefileid');
                    expect(res.status).toBe(200);
                    expect(res.body).toEqual({ error: 'File not found or you do not have the necessary permission.' });
                });

                test('Download an non-existent file from study (not logged in)', async () => {
                    const loggedoutUser = request.agent(app);
                    const res = await loggedoutUser.get('/file/fakefileid');
                    expect(res.status).toBe(403);
                    expect(res.body).toEqual({ error: 'Please log in.' });
                });

                test('Download an non-existent file from study (user without privilege) (should fail)', async () => {
                    const res = await user.get('/file/fakefileid');
                    expect(res.status).toBe(200);
                    expect(res.body).toEqual({ error: 'File not found or you do not have the necessary permission.' });
                });

                test('Download an non-existent file from study (user with privilege) (should fail)', async () => {
                    const res = await admin.get('/file/fakefileid');
                    expect(res.status).toBe(200);
                    expect(res.body).toEqual({ error: 'File not found or you do not have the necessary permission.' });
                });
            });

            describe('DELETE FILES', () => {
                let createdStudy;
                let createdFile: { id: any; };
                let dataAuthorisedUser: request.SuperTest<request.Test>; // client
                let dataAuthorisedUserProfile: IUser;
                beforeEach(async () => {
                    /* Clear old values */
                    await db.collections!.roles_collection.deleteMany({});
                    /* setup: create a study to upload file to */
                    const studyname = uuid();
                    const createStudyRes = await admin.post('/graphql').send({
                        query: print(CREATE_STUDY),
                        variables: { name: studyname, description: 'test description', type: 'SENSOR' }
                    });
                    expect(createStudyRes.status).toBe(200);
                    expect(createStudyRes.body.errors).toBeUndefined();

                    /* setup: getting the created study Id */
                    createdStudy = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOne({ name: studyname });
                    expect(createStudyRes.body.data.createStudy).toMatchObject({
                        id: createdStudy.id,
                        name: studyname,
                        description: 'test description'
                    });
                    // create field for both studies
                    await mongoClient.collection<IField>(config.database.collections.field_dictionary_collection).insertMany([{
                        id: '8e3fac1d-fa19-44fc-8250-7709d7af5524',
                        studyId: createdStudy.id,
                        fieldName: 'Device_McRoberts',
                        fieldId: 'Device_McRoberts',
                        description: null,
                        dataType: enumDataTypes.FILE,
                        categoricalOptions: null,
                        unit: null,
                        comments: 'Field for deviceid MMM',
                        dataVersion: null,
                        verifier: null,
                        properties: null,
                        life: {
                            createdTime: 0,
                            createdUser: adminId,
                            deletedTime: null,
                            deletedUser: null
                        },
                        metadata: {}
                    }, {
                        id: 'ff0c2e60-5086-4111-91ca-475168977ae6',
                        studyId: createdStudy.id,
                        fieldName: 'Device_Axivity',
                        fieldId: 'Device_Axivity',
                        description: null,
                        dataType: enumDataTypes.FILE,
                        categoricalOptions: null,
                        unit: null,
                        comments: 'Field for deviceid AX6',
                        dataVersion: null,
                        verifier: null,
                        properties: null,
                        life: {
                            createdTime: 0,
                            createdUser: adminId,
                            deletedTime: null,
                            deletedUser: null
                        },
                        metadata: {}
                    }]);
                    /* setup: upload file (would be better to upload not via app api but will do for now) */
                    const res = await admin.post('/graphql')
                        .field('operations', JSON.stringify({
                            query: print(UPLOAD_FILE),
                            variables: {
                                studyId: createdStudy.id,
                                file: null,
                                description: JSON.stringify({ participantId: 'I7N3G6G', deviceId: 'MMM7N3G6G', startDate: 1593827200000, endDate: 1595296000000 }),
                                fileLength: 21,
                                hash: 'b0dc2ae76cdea04dcf4be7fcfbe36e2ce8d864fe70a1895c993ce695274ba7a0'
                            }
                        }))
                        .field('map', JSON.stringify({ 1: ['variables.file'] }))
                        .attach('1', path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt'));
                    /* setup: geting the created file Id */
                    createdFile = res.body.data.uploadFile;
                    if (!createdFile)
                        throw 'Test file could not be retreived.';

                    /* setup: creating a privileged user */

                    /* setup: creating a privileged user */
                    const dataAuthorisedUsername = uuid();
                    dataAuthorisedUserProfile = {
                        id: dataAuthorisedUsername,
                        username: dataAuthorisedUsername,
                        email: `${dataAuthorisedUsername}@user.io`,
                        firstname: `${dataAuthorisedUsername}_firstname`,
                        lastname: `${dataAuthorisedUsername}_lastname`,
                        organisation: 'organisation_system',
                        type: enumUserTypes.STANDARD,
                        emailNotificationsActivated: false,
                        resetPasswordRequests: [],
                        password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                        otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                        profile: null,
                        description: 'I am an authorised study user.',
                        expiredAt: 1991134065000,
                        life: {
                            createdTime: 1591134065000,
                            createdUser: adminId,
                            deletedTime: null,
                            deletedUser: null
                        },
                        metadata: {}
                    };
                    const roleName = uuid();
                    await admin.post('/graphql').send({
                        query: print(ADD_NEW_ROLE),
                        variables: {
                            roleName,
                            studyId: createdStudy.id,
                            projectId: null
                        }
                    });
                    await db.collections!.users_collection.insertOne(dataAuthorisedUserProfile);
                    const authorisedRole = await mongoClient.collection<IRole>(config.database.collections.roles_collection).findOne({ name: roleName });
                    await db.collections!.roles_collection.findOneAndUpdate({ id: authorisedRole.id }, {
                        $push: {
                            users: dataAuthorisedUserProfile.id,
                            dataPermissions: {
                                fields: [
                                    '^.*$'
                                ],
                                dataProperties: {
                                    'Participant ID': [
                                        '^.*$'
                                    ],
                                    'Visit ID': [
                                        '^.*$'
                                    ]
                                },
                                includeUnVersioned: true,
                                permission: 7
                            }
                        }
                    });
                    dataAuthorisedUser = request.agent(app);
                    await connectAgent(dataAuthorisedUser, dataAuthorisedUserProfile.username, 'admin', dataAuthorisedUserProfile.otpSecret);
                });

                afterEach(async () => {
                    await mongoClient.collection<IStudy>(config.database.collections.studies_collection).deleteMany({});
                    await mongoClient.collection<IField>(config.database.collections.field_dictionary_collection).deleteMany({});
                    await mongoClient.collection<IFile>(config.database.collections.files_collection).deleteMany({});
                });

                test('Delete file from study (admin)', async () => {
                    const res = await admin.post('/graphql').send({
                        query: print(DELETE_FILE),
                        variables: { fileId: createdFile.id }
                    });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toBeUndefined();
                    expect(res.body.data.deleteFile).toEqual({ successful: true });

                    // const downloadFileRes = await admin.get(`/file/${createdFile.id}`);
                    // expect(downloadFileRes.status).toBe(404);
                    // expect(downloadFileRes.body).toEqual({ error: 'File not found or you do not have the necessary permission.' });
                });

                test('Delete file from study (user with privilege)', async () => {
                    const res = await dataAuthorisedUser.post('/graphql').send({
                        query: print(DELETE_FILE),
                        variables: { fileId: createdFile.id }
                    });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toBeUndefined();
                    expect(res.body.data.deleteFile).toEqual({ successful: true });

                    // const downloadFileRes = await authorisedUser.get(`/file/${createdFile.id}`);
                    // expect(downloadFileRes.status).toBe(404);
                    // expect(downloadFileRes.body).toEqual({ error: 'File not found or you do not have the necessary permission.' });
                });

                test('Delete file from study (user with no privilege) (should fail)', async () => {
                    const res = await user.post('/graphql').send({
                        query: print(DELETE_FILE),
                        variables: { fileId: createdFile.id }
                    });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toHaveLength(1);
                    expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
                    expect(res.body.data.deleteFile).toBe(null);

                    const downloadFileRes = await admin.get(`/file/${createdFile.id}`);
                    expect(downloadFileRes.status).toBe(200);
                    expect(downloadFileRes.headers['content-type']).toBe('application/download');
                    expect(downloadFileRes.headers['content-disposition']).toBe('attachment; filename="I7N3G6G-MMM7N3G6G-20200704-20200721.txt"');
                    expect(downloadFileRes.text).toBe('just testing I7N3G6G.');
                });

                test('Delete an non-existent file from study (admin)', async () => {
                    const res = await admin.post('/graphql').send({
                        query: print(DELETE_FILE),
                        variables: { fileId: 'nosuchfile' }
                    });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toHaveLength(1);
                    expect(res.body.errors[0].message).toBe('File does not exist.');
                    expect(res.body.data.deleteFile).toBe(null);
                });

                test('Delete an non-existent file from study (user with privilege)', async () => {
                    const res = await dataAuthorisedUser.post('/graphql').send({
                        query: print(DELETE_FILE),
                        variables: { fileId: 'nosuchfile' }
                    });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toHaveLength(1);
                    expect(res.body.errors[0].message).toBe('File does not exist.');
                    expect(res.body.data.deleteFile).toBe(null);
                });

                test('Delete an non-existent file from study (user with no privilege)', async () => {
                    const res = await user.post('/graphql').send({
                        query: print(DELETE_FILE),
                        variables: { fileId: 'nosuchfile' }
                    });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toHaveLength(1);
                    expect(res.body.errors[0].message).toBe('File does not exist.');
                    expect(res.body.data.deleteFile).toBe(null);
                });
            });
        });

        // describe('FILE PERMISSION FOR PROJECTS', () => {
        // });
    });
} else
    test(`${__filename.split(/[\\/]/).pop()} skipped because it requires Minio on Docker`, () => {
        expect(true).toBe(true);
    });
