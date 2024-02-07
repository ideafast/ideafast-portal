/**
 * @with Minio
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import request from 'supertest';
import { print } from 'graphql';
import { connectAdmin, connectUser, connectAgent } from './_loginHelper';
import { db } from '../../src/database/database';
import { Router } from '../../src/server/router';
import { errorCodes } from '../../src/graphql/errors';
import { Db, MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setupDatabase } from '@itmat-broker/itmat-setup';
import config from '../../config/config.sample.json';
import { v4 as uuid } from 'uuid';
import {
    GET_STUDY_FIELDS,
    GET_STUDY,
    ADD_NEW_ROLE,
    CREATE_STUDY,
    DELETE_STUDY,
    SET_DATAVERSION_AS_CURRENT,
    EDIT_STUDY,
    UPLOAD_DATA_IN_ARRAY,
    // DELETE_DATA_RECORDS,
    GET_DATA_RECORDS,
    CREATE_NEW_DATA_VERSION,
    CREATE_NEW_FIELD,
    DELETE_FIELD
} from '@itmat-broker/itmat-models';
import {
    enumUserTypes,
    IData,
    IUser,
    IFile,
    IField,
    IStudyDataVersion,
    IStudy,
    IRole,
    enumFileTypes,
    enumFileCategories,
    enumStudyRoles,
    enumDataTypes,
    IConfig
} from '@itmat-broker/itmat-types';
import { Express } from 'express';
import { objStore } from '../../src/objStore/objStore';

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

        /* Mock Date for testing */
        jest.spyOn(Date, 'now').mockImplementation(() => 1591134065000);
    });

    describe('STUDY API', () => {
        let adminId: any;

        beforeAll(async () => {
            /* setup: first retrieve the generated user id */
            const result = await mongoClient.collection<IUser>(config.database.collections.users_collection).find({}, { projection: { id: 1, username: 1 } }).toArray();
            adminId = result.filter((e: { username: string; }) => e.username === 'admin')[0].id;
        });

        describe('MANIPULATING STUDIES EXISTENCE', () => {
            test('Create study (admin)', async () => {
                const studyName = uuid();
                const res = await admin.post('/graphql').send({
                    query: print(CREATE_STUDY),
                    variables: { name: studyName, description: 'test description', type: 'SENSOR' }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();

                const createdStudy = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOne({ name: studyName });
                expect(res.body.data.createStudy).toEqual({
                    id: createdStudy.id,
                    name: studyName,
                    description: 'test description',
                    type: null
                });
                /* cleanup: delete study */
                await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOneAndUpdate({ name: studyName, deleted: null }, { $set: { deleted: new Date().valueOf() } });
            });

            test('Edit study (admin)', async () => {
                const studyName = uuid();
                const res = await admin.post('/graphql').send({
                    query: print(CREATE_STUDY),
                    variables: { name: studyName, description: 'test description', type: 'SENSOR' }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();

                const createdStudy = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOne({ name: studyName });
                expect(res.body.data.createStudy).toEqual({
                    id: createdStudy.id,
                    name: studyName,
                    description: 'test description',
                    type: null
                });

                const editStudy = await admin.post('/graphql').send({
                    query: print(EDIT_STUDY),
                    variables: { studyId: createdStudy.id, description: 'edited description' }
                });
                expect(editStudy.body.data.editStudy).toEqual({
                    id: createdStudy.id,
                    name: studyName,
                    description: 'edited description',
                    type: null
                });

                /* cleanup: delete study */
                await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOneAndUpdate({ name: studyName, deleted: null }, { $set: { deleted: new Date().valueOf() } });
            });

            test('Create study that violate unique name constraint (admin)', async () => {
                const studyName = uuid();
                const newStudy = {
                    id: `id_${studyName}`,
                    name: studyName,
                    createdBy: 'admin',
                    lastModified: 200000002,
                    deleted: null,
                    currentDataVersion: -1,
                    dataVersions: []
                };
                await mongoClient.collection<IStudy>(config.database.collections.studies_collection).insertOne(newStudy);

                const res = await admin.post('/graphql').send({
                    query: print(CREATE_STUDY),
                    variables: { name: studyName, description: 'test description', type: 'SENSOR' }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe('Study name already used.');
                expect(res.body.data.createStudy).toBe(null);

                /* should be only one study in database */
                const study = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).find({ name: studyName }).toArray();
                expect(study).toEqual([newStudy]);

                /* cleanup: delete study */
                await db.collections!.studies_collection.deleteOne({ id: study.id });
            });

            test('Create study that violate unique name constraint (case insensitive) (admin)', async () => {
                const studyName = uuid();
                const newStudy = {
                    id: `id_${studyName}`,
                    name: studyName,
                    createdBy: 'admin',
                    lastModified: 200000002,
                    deleted: null,
                    currentDataVersion: -1,
                    dataVersions: []
                };
                await mongoClient.collection<IStudy>(config.database.collections.studies_collection).insertOne(newStudy);

                const res = await admin.post('/graphql').send({
                    query: print(CREATE_STUDY),
                    variables: { name: studyName.toUpperCase(), description: 'test description', type: 'SENSOR' }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe('Study name already used.');
                expect(res.body.data.createStudy).toBe(null);

                /* should be only one study in database */
                const study = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).find({ name: { $in: [studyName, studyName.toUpperCase()] } }).toArray();
                expect(study).toEqual([newStudy]);

                /* cleanup: delete study */
                await db.collections!.studies_collection.deleteOne({ id: study.id });
            });

            test('Create study (user) (should fail)', async () => {
                const studyName = uuid();
                const res = await user.post('/graphql').send({
                    query: print(CREATE_STUDY),
                    variables: { name: studyName, description: 'test description', type: 'SENSOR' }
                });
                expect(res.status).toBe(200);
                expect(res.body.data.createStudy).toBe(null);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);

                const createdStudy = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOne({ name: studyName });
                expect(createdStudy).toBe(null);
            });

            test('Edit study (user) (should fail)', async () => {
                const studyName = uuid();
                const res = await admin.post('/graphql').send({
                    query: print(CREATE_STUDY),
                    variables: { name: studyName, description: 'test description', type: 'SENSOR' }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();

                const createdStudy = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOne({ name: studyName });
                expect(res.body.data.createStudy).toEqual({
                    id: createdStudy.id,
                    name: studyName,
                    description: 'test description',
                    type: null
                });

                const editStudy = await user.post('/graphql').send({
                    query: print(EDIT_STUDY),
                    variables: { studyId: createdStudy.id, description: 'edited description' }
                });
                expect(editStudy.status).toBe(200);
                expect(editStudy.body.data.editStudy).toBe(null);
                expect(editStudy.body.errors).toHaveLength(1);
                expect(editStudy.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
            });

            test('Delete study (no projects) (admin)', async () => {
                /* setup: create a study to be deleted */
                const studyName = uuid();
                const newStudy = {
                    id: `id_${studyName}`,
                    name: studyName,
                    createdBy: 'admin',
                    lastModified: 200000002,
                    deleted: null,
                    currentDataVersion: -1,
                    dataVersions: [],
                    type: 'SENSOR'
                };
                await mongoClient.collection<IStudy>(config.database.collections.studies_collection).insertOne(newStudy);
                /* test */
                const res = await admin.post('/graphql').send({
                    query: print(DELETE_STUDY),
                    variables: { studyId: newStudy.id }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.deleteStudy).toEqual({
                    id: newStudy.id,
                    successful: true,
                    code: null,
                    description: null
                });

                const study = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOne({ id: newStudy.id });
                expect(typeof study?.life.deletedTime).toBe('number');
            });

            test('Delete study that has been deleted (no projects) (admin)', async () => {
                /* setup: create a study to be deleted */
                const studyName = uuid();
                const newStudy = {
                    id: `id_${studyName}`,
                    name: studyName,
                    createdBy: 'admin',
                    lastModified: 200000002,
                    deleted: new Date().valueOf(),
                    currentDataVersion: -1,
                    dataVersions: []
                };
                await mongoClient.collection<IStudy>(config.database.collections.studies_collection).insertOne(newStudy);

                /* test */
                const res = await admin.post('/graphql').send({
                    query: print(DELETE_STUDY),
                    variables: { studyId: newStudy.id }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
                expect(res.body.data.deleteStudy).toEqual(null);
            });

            test('Delete study that never existed (admin)', async () => {
                const res = await admin.post('/graphql').send({
                    query: print(DELETE_STUDY),
                    variables: { studyId: 'I_never_existed' }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
                expect(res.body.data.deleteStudy).toEqual(null);
            });

            test('Delete study (user) (should fail)', async () => {
                /* setup: create a study to be deleted */
                const studyName = uuid();
                const newStudy = {
                    id: `id_${studyName}`,
                    name: studyName,
                    createdBy: 'admin',
                    lastModified: 200000002,
                    deleted: null,
                    currentDataVersion: -1,
                    dataVersions: []
                };
                await mongoClient.collection<IStudy>(config.database.collections.studies_collection).insertOne(newStudy);

                const res = await user.post('/graphql').send({
                    query: print(DELETE_STUDY),
                    variables: { studyId: studyName }
                });
                expect(res.status).toBe(200);
                expect(res.body.data.deleteStudy).toBe(null);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);

                /* confirms that the created study is still alive */
                const createdStudy = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOne({ name: studyName });
                expect(createdStudy.deleted).toBe(null);

                /* cleanup: delete study */
                await db.collections!.studies_collection.deleteOne({ name: studyName });
            });
        });

        describe('MINI END-TO-END API TEST, NO UI, NO DATA', () => {
            let createdStudy: { id: any; name: any; };
            let managementAuthorisedUser: request.SuperTest<request.Test>; // client
            let dataAuthorisedUser: request.SuperTest<request.Test>; // client
            let unAuthorisedUser: request.SuperTest<request.Test>; // client
            let managementAuthorisedUserProfile: IUser;
            let dataAuthorisedUserProfile: IUser;
            let unAuthorisedUserProfile: IUser;
            let mockFields: IField[];
            let mockFiles: IFile[];
            let mockDataVersion: IStudyDataVersion;
            beforeAll(async () => {
                /*** setup: create a setup study ***/
                /* 1. create study */
                {
                    const studyName = uuid();
                    const res = await admin.post('/graphql').send({
                        query: print(CREATE_STUDY),
                        variables: { name: studyName, description: 'test description', type: 'SENSOR' }
                    });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toBeUndefined();
                    createdStudy = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOne({ name: studyName });
                    expect(res.body.data.createStudy).toEqual({
                        id: createdStudy.id,
                        name: studyName,
                        description: 'test description',
                        type: null
                    });
                    const studyConfig: IConfig = {
                        id: uuid(),
                        type: 'STUDYCONFIG',
                        key: createdStudy.id,
                        properties: {
                            id: uuid(),
                            life: {
                                createdTime: 0,
                                createdUser: adminId,
                                deletedTime: null,
                                deletedUser: null
                            },
                            metadata: {

                            },
                            defaultStudyProfile: null,
                            defaultMaximumFileSize: 8589934592,
                            defaultMaximumProfileSize: 10485760,
                            defaultRepresentationForMissingValue: '99999',
                            defaultFileColumns: [
                            ],
                            defaultFileColumnsPropertyColor: 'orange',
                            defaultFileDirectoryStructure: {
                            },
                            defaultVersioningKeys: [
                                'fieldId',
                                'properties.Participant ID',
                                'properties.Visit ID'
                            ]
                        }
                    };
                    await db.collections!.configs_collection.insertOne(studyConfig);
                }

                /* 2. mock - add data to the study */
                {
                    mockDataVersion = {
                        id: 'mockDataVersionId',
                        contentId: 'mockContentId',
                        version: '0.0.1',
                        updateDate: '5000000'
                    };
                    await db.collections!.studies_collection.findOneAndUpdate({ id: createdStudy.id }, {
                        $set: {
                            currentDataVersion: 0,
                            dataVersions: [mockDataVersion]
                        }
                    });
                    const mockData: IData[] = [
                        {
                            id: 'mockData1_1',
                            studyId: createdStudy.id,
                            fieldId: '31',
                            dataVersion: mockDataVersion.id,
                            value: 'male',
                            properties: {
                                'Participant ID': 'mock_patient1',
                                'Visit ID': 'mockvisitId'
                            },
                            life: {
                                createdTime: 0,
                                createdUser: adminId,
                                deletedTime: null,
                                deletedUser: null
                            },
                            metadata: {}
                        },
                        {
                            id: 'mockData1_2',
                            studyId: createdStudy.id,
                            fieldId: '32',
                            dataVersion: mockDataVersion.id,
                            value: 'England',
                            properties: {
                                'Participant ID': 'mock_patient1',
                                'Visit ID': 'mockvisitId'
                            },
                            life: {
                                createdTime: 0,
                                createdUser: adminId,
                                deletedTime: null,
                                deletedUser: null
                            },
                            metadata: {}
                        },
                        {
                            id: 'mockData2_1',
                            studyId: createdStudy.id,
                            fieldId: '31',
                            dataVersion: mockDataVersion.id,
                            value: 'female',
                            properties: {
                                'Participant ID': 'mock_patient2',
                                'Visit ID': 'mockvisitId'
                            },
                            life: {
                                createdTime: 0,
                                createdUser: adminId,
                                deletedTime: null,
                                deletedUser: null
                            },
                            metadata: {}
                        },
                        {
                            id: 'mockData2_2',
                            studyId: createdStudy.id,
                            fieldId: '32',
                            dataVersion: mockDataVersion.id,
                            value: 'France',
                            properties: {
                                'Participant ID': 'mock_patient2',
                                'Visit ID': 'mockvisitId'
                            },
                            life: {
                                createdTime: 0,
                                createdUser: adminId,
                                deletedTime: null,
                                deletedUser: null
                            }
                        }
                    ];
                    mockFields = [
                        {
                            id: 'mockfield1',
                            studyId: createdStudy.id,
                            fieldId: '31',
                            fieldName: 'Sex',
                            description: '',
                            dataType: enumDataTypes.STRING,
                            categoricalOptions: null,
                            unit: 'person',
                            comments: 'mockComments1',
                            dataVersion: 'mockDataVersionId',
                            life: {
                                createdTime: 0,
                                createdUser: adminId,
                                deletedTime: null,
                                deletedUser: null
                            },
                            metadata: {}
                        },
                        {
                            id: 'mockfield2',
                            studyId: createdStudy.id,
                            fieldId: '32',
                            fieldName: 'Race',
                            description: '',
                            dataType: enumDataTypes.STRING,
                            possibleValues: null,
                            unit: 'person',
                            comments: 'mockComments2',
                            dataVersion: 'mockDataVersionId',
                            life: {
                                createdTime: 0,
                                createdUser: adminId,
                                deletedTime: null,
                                deletedUser: null
                            },
                            metadata: {}
                        }
                    ];

                    mockFiles = [
                        {
                            id: 'mockfile1_id',
                            studyId: createdStudy.id,
                            userId: null,
                            fileName: 'I7N3G6G-MMM7N3G6G-20200704-20210429.txt',
                            fileSize: 1000,
                            description: 'Just a test file1',
                            properties: {},
                            uri: 'fakeuri',
                            path: [],
                            hash: 'b0dc2ae76cdea04dcf4be7fcfbe36e2ce8d864fe70a1895c993ce695274ba7a0',
                            fileType: enumFileTypes.TXT,
                            fileCategory: enumFileCategories.STUDY_DATA_FILE,
                            sharedUsers: null,
                            life: {
                                createdTime: 1599345644000,
                                createdUser: adminId,
                                deletedTime: null,
                                deletedUser: null
                            },
                            metadata: {}
                        },
                        {
                            id: 'mockfile2_id',
                            studyId: createdStudy.id,
                            userId: null,
                            fileName: 'GR6R4AR-MMMS3JSPP-20200601-20200703.json',
                            fileSize: 1000,
                            description: 'Just a test file2',
                            properties: {},
                            properties: {},
                            path: [],
                            hash: '4ae25be36354ee0aec8dc8deac3f279d2e9d6415361da996cf57eb6142cfb1a3',
                            fileType: enumFileTypes.TXT,
                            fileCategory: enumFileCategories.STUDY_DATA_FILE,
                            sharedUsers: null,
                            life: {
                                createdTime: 1599345644000,
                                createdUser: adminId,
                                deletedTime: null,
                                deletedUser: null
                            },
                            metadata: {}
                        }
                    ];
                    await db.collections!.data_collection.insertMany(mockData);
                    await db.collections!.field_dictionary_collection.insertMany(mockFields);
                    await db.collections!.files_collection.insertMany(mockFiles);
                }
                /* 3. create users for study */
                {
                    const managementAuthorisedUserName = uuid();
                    managementAuthorisedUserProfile = {
                        id: managementAuthorisedUserName,
                        username: managementAuthorisedUserName,
                        email: `${managementAuthorisedUserName}@user.io`,
                        firstname: `${managementAuthorisedUserName}_firstname`,
                        lastname: `${managementAuthorisedUserName}_lastname`,
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
                    const unAuthorisedUsername = uuid();
                    unAuthorisedUserProfile = {
                        id: unAuthorisedUsername,
                        username: unAuthorisedUsername,
                        email: `${unAuthorisedUsername}@user.io`,
                        firstname: `${unAuthorisedUserProfile}_firstname`,
                        lastname: `${unAuthorisedUserProfile}_lastname`,
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
                    await db.collections!.users_collection.insertOne(managementAuthorisedUserProfile);
                    await db.collections!.users_collection.insertOne(dataAuthorisedUserProfile);
                    await db.collections!.users_collection.insertOne(unAuthorisedUserProfile);
                }
                /* 4. create roles for data authorisation */
                {
                    const roleName = uuid();
                    await admin.post('/graphql').send({
                        query: print(ADD_NEW_ROLE),
                        variables: {
                            roleName,
                            studyId: createdStudy.id,
                            projectId: null
                        }
                    });
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
                }
                /* create another role for study management - equivalent to PI */
                {
                    const roleName = uuid();
                    await admin.post('/graphql').send({
                        query: print(ADD_NEW_ROLE),
                        variables: {
                            roleName,
                            studyId: createdStudy.id,
                            projectId: null
                        }
                    });
                    await db.collections!.roles_collection.updateOne({ name: roleName }, { $set: { studyRole: enumStudyRoles.STUDY_MANAGER } });
                    const createdRole_study_management = await mongoClient.collection<IRole>(config.database.collections.roles_collection).findOne({ name: roleName });
                    await db.collections!.roles_collection.findOneAndUpdate({ id: createdRole_study_management.id }, { $push: { users: managementAuthorisedUserProfile.id } });
                }
                /* connecting users */
                dataAuthorisedUser = request.agent(app);
                await connectAgent(dataAuthorisedUser, dataAuthorisedUserProfile.username, 'admin', dataAuthorisedUserProfile.otpSecret);
                managementAuthorisedUser = request.agent(app);
                await connectAgent(managementAuthorisedUser, managementAuthorisedUserProfile.username, 'admin', managementAuthorisedUserProfile.otpSecret);
                unAuthorisedUser = request.agent(app);
                await connectAgent(unAuthorisedUser, unAuthorisedUserProfile.username, 'admin', unAuthorisedUserProfile.otpSecret);
            });

            afterAll(async () => {
                /* delete values in db */
                await db.collections!.field_dictionary_collection.deleteMany({ studyId: createdStudy.id });
                await db.collections!.data_collection.deleteMany({ m_studyId: createdStudy.id });
                await db.collections!.files_collection.deleteMany({ studyId: createdStudy.id });
                /* admin can delete study */
                {
                    const res = await admin.post('/graphql').send({
                        query: print(DELETE_STUDY),
                        variables: { studyId: createdStudy.id }
                    });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toBeUndefined();
                    expect(res.body.data.deleteStudy).toEqual({
                        id: createdStudy.id,
                        successful: true,
                        code: null,
                        description: null
                    });
                }

                /* cannot get study from api anymore */
                {
                    const res = await admin.post('/graphql').send({
                        query: print(GET_STUDY),
                        variables: { studyId: createdStudy.id }
                    });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toHaveLength(1);
                    expect(res.body.errors[0].message).toBe('Study does not exist.');
                    expect(res.body.data.getStudy).toBe(null);
                }
            });

            test('Get a non-existent study (admin)', async () => {
                const res = await admin.post('/graphql').send({
                    query: print(GET_STUDY),
                    variables: { studyId: 'iamfake' }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe('Study does not exist.');
                expect(res.body.data.getStudy).toBe(null);
            });
            test('Get study (admin)', async () => {
                const res = await admin.post('/graphql').send({
                    query: print(GET_STUDY),
                    variables: { studyId: createdStudy.id }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.getStudy[0]).toEqual({
                    id: createdStudy.id,
                    name: createdStudy.name,
                    createdBy: adminId,
                    jobs: [],
                    description: 'test description',
                    type: null,
                    projects: [],
                    roles: [],
                    files: [],
                    numOfRecords: [],
                    subjects: [],
                    visits: [],
                    currentDataVersion: 0,
                    dataVersions: [{
                        id: 'mockDataVersionId',
                        contentId: 'mockContentId',
                        version: '0.0.1',
                        // fileSize: '10000',
                        updateDate: '5000000',
                        tag: null
                    }]
                });
            });

            test('Get study (user without privilege)', async () => {
                const res = await unAuthorisedUser.post('/graphql').send({
                    query: print(GET_STUDY),
                    variables: { studyId: createdStudy.id }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
                expect(res.body.data.getStudy).toBe(null);
            });

            test('Get study (user with privilege)', async () => {
                const res = await managementAuthorisedUser.post('/graphql').send({
                    query: print(GET_STUDY),
                    variables: { studyId: createdStudy.id }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.getStudy[0]).toEqual({
                    id: createdStudy.id,
                    name: createdStudy.name,
                    createdBy: adminId,
                    jobs: [],
                    description: 'test description',
                    type: null,
                    projects: [],
                    roles: [],
                    files: [],
                    numOfRecords: [],
                    subjects: [],
                    visits: [],
                    currentDataVersion: 0,
                    dataVersions: [{
                        id: 'mockDataVersionId',
                        contentId: 'mockContentId',
                        version: '0.0.1',
                        // fileSize: '10000',
                        updateDate: '5000000',
                        tag: null
                    }]
                });
            });

            test('Get study fields (admin)', async () => {
                const res = await admin.post('/graphql').send({
                    query: print(GET_STUDY_FIELDS),
                    variables: {
                        studyId: createdStudy.id
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.getStudyFields.sort((a: { id: string; }, b: { id: any; }) => a.id.localeCompare(b.id))).toEqual([ // as the api will sort the results, the order is changed
                    {
                        id: 'mockfield2',
                        studyId: createdStudy.id,
                        fieldId: '32',
                        fieldName: 'Race',
                        tableName: null,
                        dataType: 'str',
                        possibleValues: null,
                        unit: 'person',
                        comments: 'mockComments2',
                        dateAdded: '0',
                        dateDeleted: null,
                        dataVersion: 'mockDataVersionId',
                        metadata: {}
                    },
                    {
                        id: 'mockfield1',
                        studyId: createdStudy.id,
                        fieldId: '31',
                        fieldName: 'Sex',
                        tableName: null,
                        dataType: 'str',
                        possibleValues: null,
                        unit: 'person',
                        comments: 'mockComments1',
                        dateAdded: '0',
                        dateDeleted: null,
                        dataVersion: 'mockDataVersionId',
                        metadata: {}
                    }
                ].sort((a, b) => a.id.localeCompare(b.id)));
            });

            test('Get study fields (user project privilege)', async () => {
                const res = await dataAuthorisedUser.post('/graphql').send({
                    query: print(GET_STUDY_FIELDS),
                    variables: {
                        studyId: createdStudy.id,
                        projectId: null
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.getStudyFields.sort((a: { id: string; }, b: { id: any; }) => a.id.localeCompare(b.id))).toEqual([ // as the api will sort the results, the order is changed
                    {
                        id: 'mockfield1',
                        studyId: createdStudy.id,
                        fieldId: '31',
                        fieldName: 'Sex',
                        tableName: null,
                        dataType: 'str',
                        possibleValues: null,
                        unit: 'person',
                        comments: 'mockComments1',
                        dateAdded: '0',
                        dateDeleted: null,
                        dataVersion: 'mockDataVersionId',
                        metadata: {}
                    },
                    {
                        id: 'mockfield2',
                        studyId: createdStudy.id,
                        fieldId: '32',
                        fieldName: 'Race',
                        tableName: null,
                        dataType: 'str',
                        possibleValues: null,
                        unit: 'person',
                        comments: 'mockComments2',
                        dateAdded: '0',
                        dateDeleted: null,
                        dataVersion: 'mockDataVersionId',
                        metadata: {}
                    }
                ].sort((a, b) => a.id.localeCompare(b.id)));
            });

            test('Get study fields (user without project privilege nor study privilege) (should fail)', async () => {
                const res = await unAuthorisedUser.post('/graphql').send({
                    query: print(GET_STUDY_FIELDS),
                    variables: {
                        studyId: createdStudy.id,
                        projectId: null
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
                expect(res.body.data.getStudyFields).toBe(null);
            });

            test('Get study fields, with unversioned fields', async () => {
                // delete an exisiting field and add a new field
                await db.collections!.field_dictionary_collection.insertOne({
                    id: 'mockfield2_deleted',
                    studyId: createdStudy.id,
                    fieldId: '32',
                    fieldName: 'Race',
                    description: '',
                    dataType: enumDataTypes.STRING,
                    categoricalOptions: null,
                    unit: 'person',
                    comments: 'mockComments1',
                    dataVersion: null,
                    life: {
                        createdTime: 1,
                        createdUser: adminId,
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {}
                });

                await db.collections!.field_dictionary_collection.insertOne({
                    id: 'mockfield3',
                    studyId: createdStudy.id,
                    fieldId: '33',
                    fieldName: 'Weight',
                    description: '',
                    dataType: enumDataTypes.DECIMAL,
                    categoricalOptions: null,
                    unit: 'kg',
                    comments: 'mockComments3',
                    dataVersion: null,
                    life: {
                        createdTime: 1,
                        createdUser: adminId,
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {}
                });

                // user with study privilege can access all latest field, including unversioned
                const res = await dataAuthorisedUser.post('/graphql').send({
                    query: print(GET_STUDY_FIELDS),
                    variables: {
                        studyId: createdStudy.id,
                        projectId: null,
                        versionId: null
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.getStudyFields.map(el => el.id).sort()).toEqual(['mockfield1', 'mockfield2_deleted', 'mockfield3']);
                // user with project privilege can only access the latest fields that are versioned
                const res2 = await dataAuthorisedUser.post('/graphql').send({
                    query: print(GET_STUDY_FIELDS),
                    variables: {
                        studyId: createdStudy.id,
                        projectId: null
                    }
                });
                expect(res2.status).toBe(200);
                expect(res2.body.errors).toBeUndefined();
                expect(res2.body.data.getStudyFields.sort((a: { id: string; }, b: { id: any; }) => a.id.localeCompare(b.id))).toEqual([ // as the api will sort the results, the order is changed
                    {
                        id: 'mockfield2',
                        studyId: createdStudy.id,
                        fieldId: '32',
                        fieldName: 'Race',
                        tableName: null,
                        dataType: 'str',
                        possibleValues: null,
                        unit: 'person',
                        comments: 'mockComments2',
                        dateAdded: '0',
                        dateDeleted: null,
                        dataVersion: 'mockDataVersionId',
                        metadata: {}
                    },
                    {
                        id: 'mockfield1',
                        studyId: createdStudy.id,
                        fieldId: '31',
                        fieldName: 'Sex',
                        tableName: null,
                        dataType: 'str',
                        possibleValues: null,
                        unit: 'person',
                        comments: 'mockComments1',
                        dateAdded: '0',
                        dateDeleted: null,
                        dataVersion: 'mockDataVersionId',
                        metadata: {}
                    }
                ].sort((a, b) => a.id.localeCompare(b.id)));
                // clear database
                await db.collections!.field_dictionary_collection.deleteMany({ dataVersion: null });
            });

            test('Set a previous study dataversion as current (admin)', async () => {
                // /* setup: add an extra dataversion */
                const newMockDataVersion = {
                    id: 'mockDataVersionId2',
                    contentId: 'mockContentId2',
                    version: '0.0.2',
                    updateDate: '6000000',
                    tag: null
                };
                await db.collections!.studies_collection.updateOne({ id: createdStudy.id }, { $push: { dataVersions: newMockDataVersion }, $inc: { currentDataVersion: 1 } });
                const res = await admin.post('/graphql').send({
                    query: print(SET_DATAVERSION_AS_CURRENT),
                    variables: {
                        studyId: createdStudy.id,
                        dataVersionId: mockDataVersion.id
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                const study = await db.collections!.studies_collection.findOne<IStudy>({ id: createdStudy.id }, { projection: { dataVersions: 1 } });
                expect(study).toBeDefined();
                expect(res.body.data.setDataversionAsCurrent).toEqual({
                    id: createdStudy.id,
                    currentDataVersion: 0,
                    dataVersions: [
                        { ...mockDataVersion, tag: null },
                        { ...newMockDataVersion }
                    ]
                });

                /* cleanup: reverse setting dataversion */
                await mongoClient.collection<IStudy>(config.database.collections.studies_collection)
                    .updateOne({ id: createdStudy.id }, { $set: { dataVersions: [mockDataVersion], currentDataVersion: 0 } });
            });

            test('Set a previous study dataversion as current (authorised user)', async () => {
                // /* setup: add an extra dataversion */
                const newMockDataVersion = {
                    id: 'mockDataVersionId2',
                    contentId: 'mockContentId2',
                    version: '0.0.2',
                    updateDate: '6000000',
                    tag: null
                };
                await db.collections!.studies_collection.updateOne({ id: createdStudy.id }, { $push: { dataVersions: newMockDataVersion }, $inc: { currentDataVersion: 1 } });
                const res = await managementAuthorisedUser.post('/graphql').send({
                    query: print(SET_DATAVERSION_AS_CURRENT),
                    variables: {
                        studyId: createdStudy.id,
                        dataVersionId: mockDataVersion.id
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                const study = await db.collections!.studies_collection.findOne<IStudy>({ id: createdStudy.id }, { projection: { dataVersions: 1 } });
                expect(study).toBeDefined();
                expect(res.body.data.setDataversionAsCurrent).toEqual({
                    id: createdStudy.id,
                    currentDataVersion: 0,
                    dataVersions: [
                        { ...mockDataVersion, tag: null },
                        { ...newMockDataVersion }
                    ]
                });

                /* cleanup: reverse setting dataversion */
                await mongoClient.collection<IStudy>(config.database.collections.studies_collection)
                    .updateOne({ id: createdStudy.id }, { $set: { dataVersions: [mockDataVersion], currentDataVersion: 0 } });
            });

            test('Set a previous study dataversion as current (user without privilege) (should fail)', async () => {
                /* setup: add an extra dataversion */
                const newMockDataVersion = {
                    id: 'mockDataVersionId2',
                    contentId: 'mockContentId2',
                    version: '0.0.2',
                    updateDate: '6000000',
                    tag: null
                };
                await db.collections!.studies_collection.updateOne({ id: createdStudy.id }, { $push: { dataVersions: newMockDataVersion }, $inc: { currentDataVersion: 1 } });

                const res = await unAuthorisedUser.post('/graphql').send({
                    query: print(SET_DATAVERSION_AS_CURRENT),
                    variables: {
                        studyId: createdStudy.id,
                        dataVersionId: mockDataVersion.id
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.data.setDataversionAsCurrent).toEqual(null);

                /* cleanup: reverse setting dataversion */
                await mongoClient.collection<IStudy>(config.database.collections.studies_collection)
                    .updateOne({ id: createdStudy.id }, { $set: { dataVersions: [mockDataVersion], currentDataVersion: 0 } });
            });

            test('Create New fields (admin)', async () => {
                await db.collections!.field_dictionary_collection.deleteMany({ dataVersion: null });
                const res = await admin.post('/graphql').send({
                    query: print(CREATE_NEW_FIELD),
                    variables: {
                        studyId: createdStudy.id,
                        fieldInput: [
                            {
                                fieldId: '8',
                                fieldName: 'newField8',
                                tableName: 'test',
                                dataType: 'int',
                                comments: 'test',
                                possibleValues: [
                                    { code: '1', description: 'NOW' },
                                    { code: '2', description: 'OLD' }
                                ]
                            },
                            {
                                fieldId: '9',
                                fieldName: 'newField9',
                                tableName: 'test',
                                dataType: 'cat',
                                comments: 'test',
                                possibleValues: [
                                    { code: '1', description: 'TRUE' },
                                    { code: '2', description: 'FALSE' }
                                ]
                            }
                        ]
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                const fields = await db.collections!.field_dictionary_collection.find({ fieldId: { $in: ['8', '9'] } }).toArray();
                expect(res.body.data.createNewField).toEqual([
                    { successful: true, code: null, id: fields[0].id, description: 'Field 8-newField8 is created successfully.' },
                    { successful: true, code: null, id: fields[1].id, description: 'Field 9-newField9 is created successfully.' }
                ]);
                const fieldsInDb = await db.collections!.field_dictionary_collection.find({ studyId: createdStudy.id, dataVersion: null }).toArray();
                expect(fieldsInDb).toHaveLength(2);
            });


            test('Create New field with unsupported characters (admin)', async () => {
                const res = await admin.post('/graphql').send({
                    query: print(CREATE_NEW_FIELD),
                    variables: {
                        studyId: createdStudy.id,
                        fieldInput: [
                            {
                                fieldId: '8.2',
                                fieldName: 'newField8',
                                tableName: 'test',
                                dataType: 'int',
                                comments: 'test',
                                possibleValues: [
                                    { code: '1', description: 'NOW' },
                                    { code: '2', description: 'OLD' }
                                ]
                            }
                        ]
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.data.createNewField[0]).toEqual({
                    id: '8.2',
                    successful: false,
                    code: null,
                    description: 'Field 8.2-newField8: ["FieldId should contain letters, numbers and _ only."]'
                });
            });

            test('Create New fields (user, should fail)', async () => {
                const res = await unAuthorisedUser.post('/graphql').send({
                    query: print(CREATE_NEW_FIELD),
                    variables: {
                        studyId: createdStudy.id,
                        fieldInput: [
                            {
                                fieldId: '8',
                                fieldName: 'newField8',
                                tableName: 'test',
                                dataType: 'int',
                                comments: 'test',
                                possibleValues: [
                                    { code: '1', description: 'NOW' },
                                    { code: '2', description: 'OLD' }
                                ]
                            },
                            {
                                fieldId: '9',
                                fieldName: 'newField9',
                                tableName: 'test',
                                dataType: 'cat',
                                comments: 'test',
                                possibleValues: [
                                    { code: '1', description: 'TRUE' },
                                    { code: '2', description: 'FALSE' }
                                ]
                            }
                        ]
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.data.createNewField).toHaveLength(2);
                expect(res.body.data.createNewField[0].description).toBe(`Field 8-newField8: ${errorCodes.NO_PERMISSION_ERROR}`);
                expect(res.body.data.createNewField[1].description).toBe(`Field 9-newField9: ${errorCodes.NO_PERMISSION_ERROR}`);
            });

            test('Delete an unversioned field (authorised user)', async () => {
                await dataAuthorisedUser.post('/graphql').send({
                    query: print(CREATE_NEW_FIELD),
                    variables: {
                        studyId: createdStudy.id,
                        fieldInput: [
                            {
                                fieldId: '8',
                                fieldName: 'newField8',
                                tableName: 'test',
                                dataType: 'int',
                                comments: 'test',
                                possibleValues: [
                                    { code: '1', description: 'NOW' },
                                    { code: '2', description: 'OLD' }
                                ]
                            },
                            {
                                fieldId: '9',
                                fieldName: 'newField9',
                                tableName: 'test',
                                dataType: 'cat',
                                comments: 'test',
                                possibleValues: [
                                    { code: '1', description: 'TRUE' },
                                    { code: '2', description: 'FALSE' }
                                ]
                            }
                        ]
                    }
                });
                const res = await dataAuthorisedUser.post('/graphql').send({
                    query: print(DELETE_FIELD),
                    variables: {
                        studyId: createdStudy.id,
                        fieldId: '8'
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.deleteField.id).toBe('8');
                const fieldsInDb = await db.collections!.field_dictionary_collection.find({ 'studyId': createdStudy.id, 'life.deletedTime': { $ne: null } }).toArray();
                expect(fieldsInDb).toHaveLength(1);
                expect(fieldsInDb[0].fieldId).toBe('8');
                // clear database
                await db.collections!.field_dictionary_collection.deleteMany({ studyId: createdStudy.id, fieldId: { $in: ['8', '9'] } });
            });

            test('Delete a versioned field (authorised user)', async () => {
                await dataAuthorisedUser.post('/graphql').send({
                    query: print(CREATE_NEW_FIELD),
                    variables: {
                        studyId: createdStudy.id,
                        fieldInput: [
                            {
                                fieldId: '8',
                                fieldName: 'newField8',
                                tableName: 'test',
                                dataType: 'int',
                                comments: 'test',
                                possibleValues: [
                                    { code: '1', description: 'NOW' },
                                    { code: '2', description: 'OLD' }
                                ]
                            },
                            {
                                fieldId: '9',
                                fieldName: 'newField9',
                                tableName: 'test',
                                dataType: 'cat',
                                comments: 'test',
                                possibleValues: [
                                    { code: '1', description: 'TRUE' },
                                    { code: '2', description: 'FALSE' }
                                ]
                            }
                        ]
                    }
                });
                await dataAuthorisedUser.post('/graphql').send({
                    query: print(CREATE_NEW_DATA_VERSION),
                    variables: { studyId: createdStudy.id, dataVersion: '1', tag: 'testTag' }
                });
                const res = await dataAuthorisedUser.post('/graphql').send({
                    query: print(DELETE_FIELD),
                    variables: {
                        studyId: createdStudy.id,
                        fieldId: '8'
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.deleteField.id).toBe('8');
                const fieldsInDb = await db.collections!.field_dictionary_collection.find({ studyId: createdStudy.id, fieldId: '8' }).toArray();
                expect(fieldsInDb).toHaveLength(2);
                expect(fieldsInDb[0].fieldId).toBe('8');
                expect(fieldsInDb[1].fieldId).toBe('8');
                expect(fieldsInDb[1].dateDeleted).not.toBe(null);
                // clear database
                await db.collections!.field_dictionary_collection.deleteMany({ studyId: createdStudy.id, fieldId: { $in: ['8', '9'] } });
            });
        });

        describe('UPLOAD/DELETE DATA RECORDS DIRECTLY VIA API', () => {
            let createdStudy: { id: any; name: any; };
            let managementAuthorisedUser: request.SuperTest<request.Test>; // client
            let dataAuthorisedUser: request.SuperTest<request.Test>; // client
            let unAuthorisedUser: request.SuperTest<request.Test>; // client
            let managementAuthorisedUserProfile: IUser;
            let dataAuthorisedUserProfile: IUser;
            let unAuthorisedUserProfile: IUser;
            let mockFields: IField[];
            let mockDataVersion: IStudyDataVersion;
            const fieldTreeId = uuid();
            const oneRecord = [{
                fieldId: '31',
                value: '10',
                subjectId: 'I7N3G6G',
                visitId: '1'
            }];
            const multipleRecords = [
                {
                    fieldId: '31',
                    value: '10',
                    subjectId: 'I7N3G6G',
                    visitId: '1'
                },
                {
                    fieldId: '32',
                    value: 'AAA',
                    subjectId: 'I7N3G6G',
                    visitId: '1'
                },
                {
                    fieldId: '31',
                    value: '102',
                    subjectId: 'I7N3G6G',
                    visitId: '2'
                },
                {
                    fieldId: '32',
                    value: 'AAAA',
                    subjectId: 'I7N3G6G',
                    visitId: '2'
                },
                {
                    fieldId: '31',
                    value: '11',
                    subjectId: 'GR6R4AR',
                    visitId: '2'
                },
                {
                    fieldId: '32',
                    value: 'BBB',
                    subjectId: 'GR6R4AR',
                    visitId: '2'
                }
            ];

            beforeAll(async () => {
                /*** setup: create a setup study ***/
                /* 1. create study */
                {
                    const studyName = uuid();
                    const res = await admin.post('/graphql').send({
                        query: print(CREATE_STUDY),
                        variables: { name: studyName, description: 'test description', type: 'SENSOR' }
                    });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toBeUndefined();
                    createdStudy = await mongoClient.collection<IStudy>(config.database.collections.studies_collection).findOne({ name: studyName });
                    expect(res.body.data.createStudy).toEqual({
                        id: createdStudy.id,
                        name: studyName,
                        description: 'test description',
                        type: null
                    });
                    const studyConfig: IConfig = {
                        id: uuid(),
                        type: 'STUDYCONFIG',
                        key: createdStudy.id,
                        properties: {
                            id: uuid(),
                            life: {
                                createdTime: 0,
                                createdUser: adminId,
                                deletedTime: null,
                                deletedUser: null
                            },
                            metadata: {

                            },
                            defaultStudyProfile: null,
                            defaultMaximumFileSize: 8589934592,
                            defaultMaximumProfileSize: 10485760,
                            defaultRepresentationForMissingValue: '99999',
                            defaultFileColumns: [
                            ],
                            defaultFileColumnsPropertyColor: 'orange',
                            defaultFileDirectoryStructure: {
                            },
                            defaultVersioningKeys: [
                                'fieldId',
                                'properties.Participant ID',
                                'properties.Visit ID'
                            ]
                        }
                    };
                    await db.collections!.configs_collection.insertOne(studyConfig);
                }

                /* 2. mock - add data to the study */
                {
                    mockDataVersion = {
                        id: 'mockDataVersionId',
                        contentId: 'mockContentId',
                        version: '0.0.1',
                        updateDate: '5000000'
                    };
                    await db.collections!.studies_collection.findOneAndUpdate({ id: createdStudy.id }, {
                        $set: {
                            currentDataVersion: 0,
                            dataVersions: [mockDataVersion]
                        }
                    });

                    mockFields = [
                        {
                            id: 'mockfield1',
                            studyId: createdStudy.id,
                            fieldId: '31',
                            fieldName: 'Sex',
                            description: '',
                            dataType: enumDataTypes.INTEGER,
                            categoricalOptions: null,
                            unit: 'person',
                            comments: 'mockComments1',
                            dataVersion: 'mockDataVersionId',
                            life: {
                                createdTime: 0,
                                createdUser: adminId,
                                deletedTime: null,
                                deletedUser: null
                            },
                            metadata: {}
                        },
                        {
                            id: 'mockfield2',
                            studyId: createdStudy.id,
                            fieldId: '32',
                            fieldName: 'Race',
                            description: '',
                            dataType: enumDataTypes.STRING,
                            possibleValues: null,
                            unit: 'person',
                            comments: 'mockComments2',
                            dataVersion: 'mockDataVersionId',
                            life: {
                                createdTime: 0,
                                createdUser: adminId,
                                deletedTime: null,
                                deletedUser: null
                            },
                            metadata: {}
                        }
                    ];

                    // await db.collections!.data_collection.insertMany(mockData);
                    await db.collections!.field_dictionary_collection.insertMany(mockFields);
                    // await db.collections!.files_collection.insertMany(mockFiles);
                }
                /* 3. create users for study */
                {
                    const managementAuthorisedUserName = uuid();
                    managementAuthorisedUserProfile = {
                        id: managementAuthorisedUserName,
                        username: managementAuthorisedUserName,
                        email: `${managementAuthorisedUserName}@user.io`,
                        firstname: `${managementAuthorisedUserName}_firstname`,
                        lastname: `${managementAuthorisedUserName}_lastname`,
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
                    const unAuthorisedUsername = uuid();
                    unAuthorisedUserProfile = {
                        id: unAuthorisedUsername,
                        username: unAuthorisedUsername,
                        email: `${unAuthorisedUsername}@user.io`,
                        firstname: `${unAuthorisedUserProfile}_firstname`,
                        lastname: `${unAuthorisedUserProfile}_lastname`,
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
                    await db.collections!.users_collection.insertOne(managementAuthorisedUserProfile);
                    await db.collections!.users_collection.insertOne(dataAuthorisedUserProfile);
                    await db.collections!.users_collection.insertOne(unAuthorisedUserProfile);
                }
                /* 4. create roles for data authorisation */
                {
                    const roleName = uuid();
                    await admin.post('/graphql').send({
                        query: print(ADD_NEW_ROLE),
                        variables: {
                            roleName,
                            studyId: createdStudy.id,
                            projectId: null
                        }
                    });
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
                }
                /* create another role for study management - equivalent to PI */
                {
                    const roleName = uuid();
                    await admin.post('/graphql').send({
                        query: print(ADD_NEW_ROLE),
                        variables: {
                            roleName,
                            studyId: createdStudy.id,
                            projectId: null
                        }
                    });
                    await db.collections!.roles_collection.updateOne({ name: roleName }, { $set: { studyRole: enumStudyRoles.STUDY_MANAGER } });
                    const createdRole_study_management = await mongoClient.collection<IRole>(config.database.collections.roles_collection).findOne({ name: roleName });
                    await db.collections!.roles_collection.findOneAndUpdate({ id: createdRole_study_management.id }, { $push: { users: managementAuthorisedUserProfile.id } });
                }
                /* connecting users */
                dataAuthorisedUser = request.agent(app);
                await connectAgent(dataAuthorisedUser, dataAuthorisedUserProfile.username, 'admin', dataAuthorisedUserProfile.otpSecret);
                managementAuthorisedUser = request.agent(app);
                await connectAgent(managementAuthorisedUser, managementAuthorisedUserProfile.username, 'admin', managementAuthorisedUserProfile.otpSecret);
                unAuthorisedUser = request.agent(app);
                await connectAgent(unAuthorisedUser, unAuthorisedUserProfile.username, 'admin', unAuthorisedUserProfile.otpSecret);
            });

            afterAll(async () => {
                /* delete values in db */
                await db.collections!.field_dictionary_collection.deleteMany({ studyId: createdStudy.id });
                await db.collections!.data_collection.deleteMany({ m_studyId: createdStudy.id });
                await db.collections!.files_collection.deleteMany({ studyId: createdStudy.id });
                /* admin can delete study */
                {
                    const res = await admin.post('/graphql').send({
                        query: print(DELETE_STUDY),
                        variables: { studyId: createdStudy.id }
                    });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toBeUndefined();
                    expect(res.body.data.deleteStudy).toEqual({
                        id: createdStudy.id,
                        successful: true,
                        code: null,
                        description: null
                    });
                }

                /* cannot get study from api anymore */
                {
                    const res = await admin.post('/graphql').send({
                        query: print(GET_STUDY),
                        variables: { studyId: createdStudy.id }
                    });
                    expect(res.status).toBe(200);
                    expect(res.body.errors).toHaveLength(1);
                    expect(res.body.errors[0].message).toBe('Study does not exist.');
                    expect(res.body.data.getStudy).toBe(null);
                }
            });

            afterEach(async () => {
                await db.collections!.data_collection.deleteMany({});
                await db.collections!.studies_collection.findOneAndUpdate({ id: createdStudy.id }, {
                    $set: {
                        dataVersions: [{
                            id: 'mockDataVersionId',
                            contentId: 'mockContentId',
                            version: '0.0.1',
                            updateDate: '5000000'
                        }], currentDataVersion: 0
                    }
                });
                await db.collections!.field_dictionary_collection.deleteMany({ studyId: createdStudy.id, fieldId: { $nin: ['31', '32'] }, dataVersion: null });
            });

            test('Upload a data record to study (authorised user)', async () => {
                const recordList = [
                    {
                        fieldId: '31',
                        value: '10',
                        subjectId: 'I7N3G6G',
                        visitId: '1'
                    },
                    {
                        fieldId: '32',
                        value: 'FAKE1',
                        subjectId: 'I7N3G6G',
                        visitId: '1'
                    },
                    {
                        fieldId: '31',
                        value: '11',
                        subjectId: 'GR6R4AR',
                        visitId: '1'
                    },
                    // non-existing field
                    {
                        fieldId: '34',
                        value: '10',
                        subjectId: 'I7N3G6G',
                        visitId: '1'
                    },
                    // illegal value
                    {
                        fieldId: '31',
                        value: 'wrong',
                        subjectId: 'I7N3G6G',
                        visitId: '2'
                    },
                    // illegal subject id
                    {
                        fieldId: '31',
                        value: '10',
                        subjectId: 'I777770',
                        visitId: '1'
                    }
                ];
                const res = await dataAuthorisedUser.post('/graphql').send({
                    query: print(UPLOAD_DATA_IN_ARRAY),
                    variables: { studyId: createdStudy.id, data: recordList }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.uploadDataInArray).toEqual([
                    { code: null, description: 'Field 31 value 10 successfully uploaded.', id: '0', successful: true },
                    { code: null, description: 'Field 32 value FAKE1 successfully uploaded.', id: '1', successful: true },
                    { code: null, description: 'Field 31 value 11 successfully uploaded.', id: '2', successful: true },
                    { code: 'CLIENT_ACTION_ON_NON_EXISTENT_ENTRY', description: 'Field 34: Field not found', id: '3', successful: false },
                    { code: 'CLIENT_MALFORMED_INPUT', description: 'Field 31: Cannot parse as integer.', id: '4', successful: false },
                    { code: null, description: 'Subject ID I777770 is illegal.', id: '5', successful: false }
                ]);

                const dataInDb = await db.collections!.data_collection.find({ 'life.deletedTime': null }).toArray();
                expect(dataInDb).toHaveLength(3);
            });

            test('Upload a data record to study (unauthorised user)', async () => {
                const res = await unAuthorisedUser.post('/graphql').send({
                    query: print(UPLOAD_DATA_IN_ARRAY),
                    variables: { studyId: createdStudy.id, data: oneRecord }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
            });

            test('Upload a data record with incorrect studyId', async () => {
                const res = await dataAuthorisedUser.post('/graphql').send({
                    query: print(UPLOAD_DATA_IN_ARRAY),
                    variables: { studyId: 'fakeStudyId', fieldTreeId: fieldTreeId, data: oneRecord }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe('Study does not exist.');
            });

            test('Create New data version with data only (user with study privilege)', async () => {
                const res = await dataAuthorisedUser.post('/graphql').send({
                    query: print(UPLOAD_DATA_IN_ARRAY),
                    variables: { studyId: createdStudy.id, data: multipleRecords }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                const createRes = await managementAuthorisedUser.post('/graphql').send({
                    query: print(CREATE_NEW_DATA_VERSION),
                    variables: { studyId: createdStudy.id, dataVersion: '1', tag: 'testTag' }
                });
                expect(createRes.status).toBe(200);
                expect(createRes.body.errors).toBeUndefined();
                expect(createRes.body.data.createNewDataVersion.version).toBe('1');
                expect(createRes.body.data.createNewDataVersion.tag).toBe('testTag');
                const studyInDb = await db.collections!.studies_collection.findOne({ id: createdStudy.id });
                expect(studyInDb.dataVersions).toHaveLength(2);
                expect(studyInDb.dataVersions[1].version).toBe('1');
                expect(studyInDb.dataVersions[1].tag).toBe('testTag');
                const dataInDb = await db.collections!.data_collection.find({ studyId: createdStudy.id, dataVersion: createRes.body.data.createNewDataVersion.id }).toArray();
                expect(dataInDb).toHaveLength(6);
            });

            test('Create New data version with field only (user with study privilege)', async () => {
                const res = await dataAuthorisedUser.post('/graphql').send({
                    query: print(CREATE_NEW_FIELD),
                    variables: {
                        studyId: createdStudy.id, fieldInput: {
                            fieldId: '34',
                            fieldName: 'Height',
                            dataType: 'dec',
                            unit: 'cm'
                        }
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                const createRes = await managementAuthorisedUser.post('/graphql').send({
                    query: print(CREATE_NEW_DATA_VERSION),
                    variables: { studyId: createdStudy.id, dataVersion: '1', tag: 'testTag' }
                });
                expect(createRes.status).toBe(200);
                expect(createRes.body.errors).toBeUndefined();
                expect(createRes.body.data.createNewDataVersion.version).toBe('1');
                expect(createRes.body.data.createNewDataVersion.tag).toBe('testTag');
                const studyInDb = await db.collections!.studies_collection.findOne({ id: createdStudy.id });
                expect(studyInDb.dataVersions).toHaveLength(2);
                expect(studyInDb.dataVersions[1].version).toBe('1');
                expect(studyInDb.dataVersions[1].tag).toBe('testTag');
                const fieldIndb = await db.collections!.field_dictionary_collection.find({ studyId: createdStudy.id, dataVersion: { $in: [createRes.body.data.createNewDataVersion.id, 'mockDataVersionId'] } }).toArray();
                expect(fieldIndb).toHaveLength(3);
            });

            test('Create New data version with field and data (user with study privilege)', async () => {
                await dataAuthorisedUser.post('/graphql').send({
                    query: print(CREATE_NEW_FIELD),
                    variables: {
                        studyId: createdStudy.id, fieldInput: {
                            fieldId: '34',
                            fieldName: 'Height',
                            dataType: 'dec',
                            unit: 'cm'
                        }
                    }
                });
                await dataAuthorisedUser.post('/graphql').send({
                    query: print(UPLOAD_DATA_IN_ARRAY),
                    variables: {
                        studyId: createdStudy.id,
                        data: [{
                            fieldId: '34',
                            value: '163.4',
                            subjectId: 'I7N3G6G',
                            visitId: '1'
                        }, ...multipleRecords]
                    }
                });
                const createRes = await managementAuthorisedUser.post('/graphql').send({
                    query: print(CREATE_NEW_DATA_VERSION),
                    variables: { studyId: createdStudy.id, dataVersion: '1', tag: 'testTag' }
                });
                expect(createRes.status).toBe(200);
                expect(createRes.body.errors).toBeUndefined();
                expect(createRes.body.data.createNewDataVersion.version).toBe('1');
                expect(createRes.body.data.createNewDataVersion.tag).toBe('testTag');
                const studyInDb = await db.collections!.studies_collection.findOne({ id: createdStudy.id });
                expect(studyInDb.dataVersions).toHaveLength(2);
                expect(studyInDb.dataVersions[1].version).toBe('1');
                expect(studyInDb.dataVersions[1].tag).toBe('testTag');
                const dataInDb = await db.collections!.data_collection.find({ studyId: createdStudy.id, dataVersion: createRes.body.data.createNewDataVersion.id }).toArray();
                expect(dataInDb).toHaveLength(7);
                const fieldsInDb = await db.collections!.field_dictionary_collection.find({ studyId: createdStudy.id, dataVersion: { $in: [createRes.body.data.createNewDataVersion.id, 'mockDataVersionId'] } }).toArray();
                expect(fieldsInDb).toHaveLength(3);
            });

            test('Create New data version (authorised user) should fail', async () => {
                const res = await dataAuthorisedUser.post('/graphql').send({
                    query: print(UPLOAD_DATA_IN_ARRAY),
                    variables: { studyId: createdStudy.id, data: multipleRecords }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();

                const createRes = await dataAuthorisedUser.post('/graphql').send({
                    query: print(CREATE_NEW_DATA_VERSION),
                    variables: { studyId: createdStudy.id, dataVersion: '1', tag: 'testTag' }
                });
                expect(createRes.status).toBe(200);
                expect(createRes.body.errors).toHaveLength(1);
                expect(createRes.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
            });

            test('Get data records (user with study privilege)', async () => {
                await dataAuthorisedUser.post('/graphql').send({
                    query: print(UPLOAD_DATA_IN_ARRAY),
                    variables: { studyId: createdStudy.id, data: multipleRecords }
                });
                await managementAuthorisedUser.post('/graphql').send({
                    query: print(CREATE_NEW_DATA_VERSION),
                    variables: { studyId: createdStudy.id, dataVersion: '1', tag: 'testTag' }
                });
                await dataAuthorisedUser.post('/graphql').send({
                    query: print(UPLOAD_DATA_IN_ARRAY),
                    variables: {
                        studyId: createdStudy.id, data: [
                            {
                                fieldId: '31',
                                value: '10',
                                subjectId: 'I7N3G6G',
                                visitId: '3'
                            }
                        ]
                    }
                });
                const getRes = await dataAuthorisedUser.post('/graphql').send({
                    query: print(GET_DATA_RECORDS),
                    variables: {
                        studyId: createdStudy.id,
                        queryString: {
                            data_requested: ['31', '32'],
                            format: 'raw',
                            cohort: [[]],
                            new_fields: []
                        }
                    }
                });
                expect(getRes.status).toBe(200);
                expect(getRes.body.errors).toBeUndefined();
                expect(Object.keys(getRes.body.data.getDataRecords)).toHaveLength(2);
            });
        });
    });
} else
    test(`${__filename.split(/[\\/]/).pop()} skipped because it requires Minio on Docker`, () => {
        expect(true).toBe(true);
    });
