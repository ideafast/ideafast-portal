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
import { enumUserTypes, enumStudyRoles, enumDataTypes, enumASTNodeTypes, enumConditionOps, enumConfigType } from '@itmat-broker/itmat-types';
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
    // let adminProfile;
    let userProfile;
    let study;
    let fullPermissionRole;

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
        study = {
            id: uuid(),
            name: 'Test Study',
            currentDataVersion: -1, // index; dataVersions[currentDataVersion] gives current version; // -1 if no data
            dataVersions: [],
            description: null,
            profile: null,
            webLayout: [],
            life: {
                createdTime: 0,
                createdUser: enumUserTypes.SYSTEM,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };
        await db.collections!.configs_collection.insertOne({
            id: uuid(),
            type: enumConfigType.STUDYCONFIG,
            key: study.id,
            properties: {
                id: uuid(),
                life: {
                    createdTime: 1648060684215,
                    createdUser: '8a51bda7-64b8-46af-b087-43caad743a81',
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
                    {
                        title: 'Participant ID',
                        type: 'string'
                    },
                    {
                        title: 'Device ID',
                        type: 'string'
                    },
                    {
                        title: 'Device Type',
                        type: 'string'
                    },
                    {
                        title: 'Start Date',
                        type: 'UNIX timestamps'
                    },
                    {
                        title: 'End Date',
                        type: 'UNIX timestamps'
                    }
                ],
                defaultFileColumnsPropertyColor: 'orange',
                defaultFileDirectoryStructure: {
                    pathLabels: [
                        'SubjectId',
                        'VisitId'
                    ],
                    description: null
                },
                defaultVersioningKeys: ['fieldId', 'properties.SubjectId', 'properties.VisitId']
            }
        });
        await db.collections!.studies_collection.insertOne(study);
        fullPermissionRole = {
            id: 'full_permission_role_id',
            studyId: study.id,
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
    });

    afterEach(async () => {
        await db.collections!.studies_collection.deleteMany({});
        await db.collections!.field_dictionary_collection.deleteMany({});
        await db.collections!.data_collection.deleteMany({});
        await db.collections!.roles_collection.deleteMany({});
        await db.collections!.files_collection.deleteMany({});
        await db.collections!.cache_collection.deleteMany({});
        await db.collections!.configs_collection.deleteMany({});
    });

    describe('tRPC data APIs', () => {
        test('Create a field', async () => {
            const response = await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    verifier: [[{
                        formula: {
                            type: enumASTNodeTypes.SELF,
                            operator: null,
                            value: null,
                            parameters: {},
                            children: []
                        },
                        condition: enumConditionOps.NUMERICALGREATERTHAN,
                        value: 10,
                        parameters: {}
                    }, {
                        formula: {
                            type: enumASTNodeTypes.SELF,
                            operator: null,
                            value: null,
                            parameters: {},
                            children: []
                        },
                        condition: enumConditionOps.NUMERICALLESSTHAN,
                        value: 50,
                        parameters: {}
                    }]],
                    properties: [{
                        name: 'SubjectId',
                        verifier: [[{
                            formula: {
                                type: enumASTNodeTypes.SELF,
                                operator: null,
                                value: null,
                                parameters: {},
                                children: []
                            },
                            condition: enumConditionOps.STRINGREGEXMATCH,
                            value: '^I.*$',
                            parameters: {}
                        }]],
                        description: null,
                        required: true
                    }]
                });
            expect(response.status).toBe(200);
            expect(response.body.result.data.fieldId).toBe('1');
            const field = await db.collections!.field_dictionary_collection.findOne({ 'studyId': study.id, 'fieldId': '1', 'life.deletedTime': null });
            expect(field).toBeDefined();
            expect(field?.fieldId).toBe('1');
        });
        test('Create a field (study does not exist)', async () => {
            const response = await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: 'random',
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Study does not exist.');
            const field = await db.collections!.field_dictionary_collection.findOne({ 'studyId': study.id, 'fieldId': '1', 'life.deletedTime': null });
            expect(field).toBe(null);
        });
        test('Create a field (no permission)', async () => {
            const response = await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '2',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
            const field = await db.collections!.field_dictionary_collection.findOne({ 'studyId': study.id, 'fieldId': '1', 'life.deletedTime': null });
            expect(field).toBe(null);
        });
        test('Create a field (multiple times)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            const response = await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            expect(response.status).toBe(200);
            const field = await db.collections!.field_dictionary_collection.find({ 'studyId': study.id, 'fieldId': '1', 'life.deletedTime': null }).toArray();
            expect(field).toHaveLength(2);
        });
        test('Create a field (undefined categorical options for categorical field)', async () => {
            const response = await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.CATEGORICAL
                });
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('["1-Test Field 1: possible values can\'t be empty if data type is categorical."]');
            const field = await db.collections!.field_dictionary_collection.find({ 'studyId': study.id, 'fieldId': '1', 'life.deletedTime': null }).toArray();
            expect(field).toHaveLength(0);
        });
        test('Get fields (unversioned)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null
            };
            const response = await user.get('/trpc/data.getStudyFields?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(response.body.result.data).toHaveLength(1);
            expect(response.body.result.data[0].fieldId).toBe('1');
        });
        test('Get fields (versioned)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await db.collections!.roles_collection.updateMany({}, {
                $set: {
                    studyRole: enumStudyRoles.STUDY_MANAGER
                }
            });
            await user.post('/trpc/data.createStudyDataVersion')
                .send({
                    studyId: study.id,
                    version: '1.0.0',
                    tag: undefined
                });
            const paramteres: any = {
                studyId: study.id
            };
            const response = await user.get('/trpc/data.getStudyFields?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(response.body.result.data).toHaveLength(1);
            expect(response.body.result.data[0].fieldId).toBe('1');
        });
        test('Delete a field', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            const response = await user.post('/trpc/data.deleteStudyField')
                .send({
                    studyId: study.id,
                    fieldId: '1'
                });
            expect(response.status).toBe(200);
            expect(response.body.result.data.id).toBe('1');
            const field = await db.collections!.field_dictionary_collection.find({ studyId: study.id, fieldId: '1' }).toArray();
            expect(field).toHaveLength(2);
            const paramteres: any = {
                studyId: study.id,
                versionId: null
            };
            const response2 = await user.get('/trpc/data.getStudyFields?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response2.body.result.data).toHaveLength(0);
        });
        test('Delete a field (study does not exist)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            const response = await user.post('/trpc/data.deleteStudyField')
                .send({
                    studyId: 'random',
                    fieldId: '1'
                });
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Study does not exist.');
            const fields = await db.collections!.field_dictionary_collection.find({ fieldId: '1' }).toArray();
            expect(fields).toHaveLength(1);
        });
        test('Delete a field (field does not exist)', async () => {
            const response = await user.post('/trpc/data.deleteStudyField')
                .send({
                    studyId: study.id,
                    fieldId: '1'
                });
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Field does not exist.');
            const fields = await db.collections!.field_dictionary_collection.find({ fieldId: '1' }).toArray();
            expect(fields).toHaveLength(0);
        });
        test('Upload a data clip (integer)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '10'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(true);
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(1);
            expect(data[0].fieldId).toBe('1');
        });
        test('Upload a data clip (decimal)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.DECIMAL
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1.1'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(true);
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(1);
            expect(data[0].fieldId).toBe('1');
        });
        test('Upload a data clip (boolean)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.BOOLEAN
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: 'true'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(true);
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(1);
            expect(data[0].fieldId).toBe('1');
        });
        test('Upload a data clip (date)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.DATETIME
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '2023-12-06T17:28:32.397Z'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(true);
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(1);
            expect(data[0].fieldId).toBe('1');
        });
        test('Upload a data clip (categorical)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.CATEGORICAL,
                    categoricalOptions: [
                        { code: '1', description: '1' },
                        { code: '2', description: '2' }
                    ]
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(true);
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(1);
            expect(data[0].fieldId).toBe('1');
        });
        test('Upload a data clip (study does not exist)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: 'random',
                    data: [{
                        fieldId: '1',
                        value: '10'
                    }]
                });
            expect(respone.status).toBe(400);
            expect(respone.body.error.message).toBe('Study does not exist.');
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(0);
        });
        test('Upload a data clip (no permission)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '2',
                        value: '10'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(false);
            expect(respone.body.result.data[0].description).toBe(errorCodes.NO_PERMISSION_ERROR);
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(0);
        });
        test('Upload a data clip (field does not exist)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '11',
                        value: '10'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(false);
            expect(respone.body.result.data[0].description).toBe('Field 11: Field not found');
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(0);
        });
        test('Upload a data clip (value is invalid as integer)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: 'random'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(false);
            expect(respone.body.result.data[0].description).toBe('Field 1: Cannot parse as integer.');
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(0);
        });
        test('Upload a data clip (value is invalid as decimal)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.DECIMAL
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: 'random'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(false);
            expect(respone.body.result.data[0].description).toBe('Field 1: Cannot parse as decimal.');
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(0);
        });
        test('Upload a data clip (value is invalid as boolean)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.BOOLEAN
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: 'random'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(false);
            expect(respone.body.result.data[0].description).toBe('Field 1: Cannot parse as boolean.');
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(0);
        });
        test('Upload a data clip (value is invalid as date)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.DATETIME
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: 'random'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(false);
            expect(respone.body.result.data[0].description).toBe('Field 1: Cannot parse as date. Value for date type must be in ISO format.');
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(0);
        });
        test('Upload a data clip (value is invalid as categorical)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.CATEGORICAL,
                    categoricalOptions: [
                        { code: '1', description: '1' },
                        { code: '2', description: '2' }
                    ]
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: 'random'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(false);
            expect(respone.body.result.data[0].description).toBe('Field 1: Cannot parse as categorical, value not in value list.');
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(0);
        });
        test('Upload a data clip (duplicate data clips)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1'
                    }]
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(true);
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(2);
            expect(data[0].fieldId).toBe(data[1].fieldId);
        });
        test('Upload a data clip (pass the verifier)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    verifier: [[{
                        formula: {
                            type: enumASTNodeTypes.SELF,
                            operator: null,
                            value: null,
                            parameters: {},
                            children: []
                        },
                        condition: enumConditionOps.NUMERICALGREATERTHAN,
                        value: 10,
                        parameters: {}
                    }, {
                        formula: {
                            type: enumASTNodeTypes.SELF,
                            operator: null,
                            value: null,
                            parameters: {},
                            children: []
                        },
                        condition: enumConditionOps.NUMERICALLESSTHAN,
                        value: 50,
                        parameters: {}
                    }]]
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '25'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(true);
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(1);
        });
        test('Upload a data clip (failed the verifier)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    verifier: [[{
                        formula: {
                            type: enumASTNodeTypes.SELF,
                            operator: null,
                            value: null,
                            parameters: {},
                            children: []
                        },
                        condition: enumConditionOps.NUMERICALGREATERTHAN,
                        value: 10,
                        parameters: {}
                    }, {
                        formula: {
                            type: enumASTNodeTypes.SELF,
                            operator: null,
                            value: null,
                            parameters: {},
                            children: []
                        },
                        condition: enumConditionOps.NUMERICALLESSTHAN,
                        value: 50,
                        parameters: {}
                    }]]
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '5'
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(false);
            expect(respone.body.result.data[0].description).toBe('Field 1 value 5: Failed to pass the verifier.');
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(0);
        });
        test('Upload a data clip (pass the property verifier)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    verifier: [[{
                        formula: {
                            type: enumASTNodeTypes.SELF,
                            operator: null,
                            value: null,
                            parameters: {},
                            children: []
                        },
                        condition: enumConditionOps.NUMERICALGREATERTHAN,
                        value: 10,
                        parameters: {}
                    }, {
                        formula: {
                            type: enumASTNodeTypes.SELF,
                            operator: null,
                            value: null,
                            parameters: {},
                            children: []
                        },
                        condition: enumConditionOps.NUMERICALLESSTHAN,
                        value: 50,
                        parameters: {}
                    }]],
                    properties: [{
                        name: 'SubjectId',
                        verifier: [[{
                            formula: {
                                type: enumASTNodeTypes.SELF,
                                operator: null,
                                value: null,
                                parameters: {},
                                children: []
                            },
                            condition: enumConditionOps.STRINGREGEXMATCH,
                            value: '^I.*$',
                            parameters: {}
                        }]],
                        description: null,
                        required: true
                    }]
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '25',
                        properties: {
                            SubjectId: 'I7'
                        }
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(true);
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(1);
        });
        test('Upload a data clip (failed the property verifier, required not satisfy)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    verifier: [[{
                        formula: {
                            type: enumASTNodeTypes.SELF,
                            operator: null,
                            value: null,
                            parameters: {},
                            children: []
                        },
                        condition: enumConditionOps.NUMERICALGREATERTHAN,
                        value: 10,
                        parameters: {}
                    }, {
                        formula: {
                            type: enumASTNodeTypes.SELF,
                            operator: null,
                            value: null,
                            parameters: {},
                            children: []
                        },
                        condition: enumConditionOps.NUMERICALLESSTHAN,
                        value: 50,
                        parameters: {}
                    }]],
                    properties: [{
                        name: 'SubjectId',
                        verifier: [[{
                            formula: {
                                type: enumASTNodeTypes.SELF,
                                operator: null,
                                value: null,
                                parameters: {},
                                children: []
                            },
                            condition: enumConditionOps.STRINGREGEXMATCH,
                            value: '^I.*$',
                            parameters: {}
                        }]],
                        description: null,
                        required: true
                    }]
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '25'
                    }],
                    properties: {
                        random: 'random'
                    }
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(false);
            expect(respone.body.result.data[0].description).toBe('Field 1: Property SubjectId is required.');
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(0);
            //Field 1 value 25: Property SubjectId failed to pass the verifier.
        });
        test('Upload a data clip (failed the property verifier, value not satisfy)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    verifier: [[{
                        formula: {
                            type: enumASTNodeTypes.SELF,
                            operator: null,
                            value: null,
                            parameters: {},
                            children: []
                        },
                        condition: enumConditionOps.NUMERICALGREATERTHAN,
                        value: 10,
                        parameters: {}
                    }, {
                        formula: {
                            type: enumASTNodeTypes.SELF,
                            operator: null,
                            value: null,
                            parameters: {},
                            children: []
                        },
                        condition: enumConditionOps.NUMERICALLESSTHAN,
                        value: 50,
                        parameters: {}
                    }]],
                    properties: [{
                        name: 'SubjectId',
                        verifier: [[{
                            formula: {
                                type: enumASTNodeTypes.SELF,
                                operator: null,
                                value: null,
                                parameters: {},
                                children: []
                            },
                            condition: enumConditionOps.STRINGREGEXMATCH,
                            value: '^I.*$',
                            parameters: {}
                        }]],
                        description: null,
                        required: true
                    }]
                });
            const respone = await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '25',
                        properties: {
                            SubjectId: 'K7'
                        }
                    }]
                });
            expect(respone.status).toBe(200);
            expect(respone.body.result.data[0].successful).toBe(false);
            expect(respone.body.result.data[0].description).toBe('Field 1 value 25: Property SubjectId failed to pass the verifier.');
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(0);
        });
        test('Delete a data clip', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '10'
                    }]
                });
            const data1 = await db.collections!.data_collection.findOne({});
            const response2 = await user.post('/trpc/data.deleteStudyData')
                .send({
                    studyId: study.id,
                    documentId: data1.id
                });
            expect(response2.status).toBe(200);
            expect(response2.body.result.data.successful).toBe(true);
            const data = await db.collections!.data_collection.find({ studyId: study.id }).toArray();
            expect(data).toHaveLength(2);
            expect(data[0].life.deletedTime).toBeNull();
            expect(data[1].life.deletedTime).not.toBeNull();
        });
        test('Delete a data clip (study does not exist)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '10'
                    }]
                });
            const data1 = await db.collections!.data_collection.findOne({});
            const response2 = await user.post('/trpc/data.deleteStudyData')
                .send({
                    studyId: 'random',
                    documentId: data1.id
                });
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe('Study does not exist.');
        });
        test('Delete a data clip (delete twice)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '10'
                    }]
                });
            const data1 = (await db.collections!.data_collection.find({}).toArray())[0];
            await user.post('/trpc/data.deleteStudyData')
                .send({
                    studyId: study.id,
                    documentId: data1.id
                });
            const data2 = (await db.collections!.data_collection.find({}).toArray())[1];
            const response2 = await user.post('/trpc/data.deleteStudyData')
                .send({
                    studyId: study.id,
                    documentId: data2.id
                });
            expect(response2.status).toBe(400);
            expect(response2.body.error.message).toBe('Document does not exist or has been deleted.');
        });
        test('Upload a file data', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.FILE
                });
            const filePath = path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt');
            const request = user.post('/trpc/data.uploadStudyFileData');
            request.attach('file', filePath);
            request.field('studyId', study.id);
            request.field('fieldId', '1');
            request.field('properties', JSON.stringify({
                SubjectId: '1A',
                VisitId: '1'
            }));
            const response = await request;
            expect(response.status).toBe(200);
            const fileObj = await db.collections!.files_collection.findOne({});
            const dataObj = await db.collections!.data_collection.findOne({});
            expect(response.body.result.data.id).toBe(dataObj.id);
            expect(dataObj?.value).toBe(fileObj.id);

        });
        test('Upload a file data (study does not exist)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.FILE
                });
            const filePath = path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt');
            const request = user.post('/trpc/data.uploadStudyFileData');
            request.attach('file', filePath);
            request.field('studyId', 'random');
            request.field('fieldId', '1');
            const response = await request;
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Study does not exist.');
        });
        test('Upload a file data (field does not exist)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.FILE
                });
            const filePath = path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt');
            const request = user.post('/trpc/data.uploadStudyFileData');
            request.attach('file', filePath);
            request.field('studyId', study.id);
            request.field('fieldId', 'random');
            const response = await request;
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Field does not exist.');
        });
        test('Upload a file data (file format not supported)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.FILE
                });
            const filePath = path.join(__dirname, '../filesForTests/RandomFile.random');
            const request = user.post('/trpc/data.uploadStudyFileData');
            request.attach('file', filePath);
            request.field('studyId', study.id);
            request.field('fieldId', '1');
            const response = await request;
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('File type not supported.');
        });
        test('Upload a file data (with properties)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.FILE,
                    properties: [{
                        name: 'SubjectId',
                        verifier: [[{
                            formula: {
                                type: enumASTNodeTypes.SELF,
                                operator: null,
                                value: null,
                                parameters: {},
                                children: []
                            },
                            condition: enumConditionOps.STRINGREGEXMATCH,
                            value: '^I.*$',
                            parameters: {}
                        }]],
                        description: null,
                        required: true
                    }]
                });
            const filePath = path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt');
            const request = user.post('/trpc/data.uploadStudyFileData');
            request.attach('file', filePath);
            request.field('studyId', study.id);
            request.field('fieldId', '1');
            request.field('properties', JSON.stringify({
                SubjectId: 'I7'
            }));
            const response = await request;
            expect(response.status).toBe(200);
            const fileObj = await db.collections!.files_collection.findOne({});
            const dataObj = await db.collections!.data_collection.findOne({});
            expect(response.body.result.data.id).toBe(dataObj.id);
            expect(dataObj?.value).toBe(fileObj.id);
        });
        test('Upload a file data (missing properties)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.FILE,
                    properties: [{
                        name: 'SubjectId',
                        verifier: [[{
                            formula: {
                                type: enumASTNodeTypes.SELF,
                                operator: null,
                                value: null,
                                parameters: {},
                                children: []
                            },
                            condition: enumConditionOps.STRINGREGEXMATCH,
                            value: '^I.*$',
                            parameters: {}
                        }]],
                        description: null,
                        required: true
                    }]
                });
            const filePath = path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt');
            const request = user.post('/trpc/data.uploadStudyFileData');
            request.attach('file', filePath);
            request.field('studyId', study.id);
            request.field('fieldId', '1');
            const response = await request;
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Property SubjectId is required.');
        });
        test('Upload a file data (incorrect properties)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.FILE,
                    properties: [{
                        name: 'SubjectId',
                        verifier: [[{
                            formula: {
                                type: enumASTNodeTypes.SELF,
                                operator: null,
                                value: null,
                                parameters: {},
                                children: []
                            },
                            condition: enumConditionOps.STRINGREGEXMATCH,
                            value: '^I.*$',
                            parameters: {}
                        }]],
                        description: null,
                        required: true
                    }]
                });
            const filePath = path.join(__dirname, '../filesForTests/I7N3G6G-MMM7N3G6G-20200704-20200721.txt');
            const request = user.post('/trpc/data.uploadStudyFileData');
            request.attach('file', filePath);
            request.field('studyId', study.id);
            request.field('fieldId', '1');
            request.field('properties', JSON.stringify({
                SubjectId: 'K7'
            }));
            const response = await request;
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Property SubjectId check failed. Failed value "K7".');
        });
        test('Get data', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '10',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: undefined,
                fieldIds: undefined,
                useCache: undefined,
                forceUpdate: undefined
            };
            const response2 = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response2.status).toBe(200);
            expect(response2.body.result.data).toHaveLength(1);
            expect(response2.body.result.data[0].fieldId).toBe('1');
        });
        test('Get data (aggregation with group)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 11',
                    fieldId: '11',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '2',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '1',
                        value: '11',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '22',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: {
                    clinical: [{
                        operationName: 'Group',
                        params: {
                            keys: [
                                'properties.SubjectId'
                            ],
                            skipUnmatch: false
                        }
                    }]
                },
                fieldIds: undefined,
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(response.body.result.data.clinical).toHaveLength(2);
            expect(response.body.result.data.clinical[0]).toHaveLength(2);
            expect(response.body.result.data.clinical[1]).toHaveLength(2);
            expect(response.body.result.data.clinical[0][0].properties.SubjectId).toBe(response.body.result.data.clinical[0][1].properties.SubjectId);
            expect(response.body.result.data.clinical[1][0].properties.SubjectId).toBe(response.body.result.data.clinical[1][1].properties.SubjectId);
        });
        test('Get data (aggregation with affine)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 11',
                    fieldId: '11',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '2',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '1',
                        value: '11',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '22',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: {
                    clinical: [{
                        operationName: 'Affine',
                        params: {
                            removedKeys: [
                                '_id',
                                'id',
                                'studyId',
                                'dataVersion',
                                'life',
                                'metadata'
                            ],
                            addedKeyRules: [{
                                key: {
                                    type: enumASTNodeTypes.VALUE,
                                    operator: null,
                                    value: 'randomKey',
                                    parameters: {},
                                    children: null
                                },
                                value: {
                                    type: enumASTNodeTypes.VALUE,
                                    operator: null,
                                    value: 'randomValue',
                                    parameters: {},
                                    children: null
                                }
                            }],
                            rules: {}
                        }
                    }]
                },
                fieldIds: undefined,
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(Object.keys(response.body.result.data.clinical[0])).toHaveLength(4);
            expect(Object.keys(response.body.result.data.clinical[1])).toHaveLength(4);
            expect(Object.keys(response.body.result.data.clinical[2])).toHaveLength(4);
            expect(Object.keys(response.body.result.data.clinical[3])).toHaveLength(4);
            expect(response.body.result.data.clinical[0].randomKey).toBe('randomValue');
            expect(response.body.result.data.clinical[1].randomKey).toBe('randomValue');
            expect(response.body.result.data.clinical[2].randomKey).toBe('randomValue');
            expect(response.body.result.data.clinical[3].randomKey).toBe('randomValue');
        });
        test('Get data (aggregation with leaveOne)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 11',
                    fieldId: '11',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '2',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '1',
                        value: '11',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '22',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: {
                    clinical: [{
                        operationName: 'Group',
                        params: {
                            keys: [
                                'properties.SubjectId'
                            ],
                            skipUnmatch: false
                        }
                    }, {
                        operationName: 'LeaveOne',
                        params: {
                            scoreFormula: {
                                operator: null,
                                type: 'VARIABLE',
                                value: 'life.createdTime',
                                children: null,
                                parameters: {}
                            },
                            isDescend: true
                        }
                    }]
                },
                fieldIds: undefined,
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(response.body.result.data.clinical).toHaveLength(2);
        });
        test('Get data (aggregation with concat)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 11',
                    fieldId: '11',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '2',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '1',
                        value: '11',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '22',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: {
                    clinical: [{
                        operationName: 'Group',
                        params: {
                            keys: [
                                'properties.SubjectId'
                            ],
                            skipUnmatch: false
                        }
                    }, {
                        operationName: 'Concat',
                        params: {
                            concatKeys: ['value']
                        }
                    }]
                },
                fieldIds: undefined,
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(response.body.result.data.clinical).toHaveLength(2);
            expect(response.body.result.data.clinical[0].value).toHaveLength(2);
            expect(response.body.result.data.clinical[0].value).toHaveLength(2);
        });
        test('Get data (aggregation with deconcat)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.JSON,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: JSON.stringify(['1', '2', '3']),
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: {
                    clinical: [{
                        operationName: 'Deconcat',
                        params: {
                            deconcatKeys: [
                                'value'
                            ],
                            matchMode: 'combinations'
                        }
                    }]
                },
                fieldIds: undefined,
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(response.body.result.data.clinical).toHaveLength(1);
            expect(response.body.result.data.clinical[0]).toHaveLength(3);
            expect(response.body.result.data.clinical[0][0].value).toBe('1');
            expect(response.body.result.data.clinical[0][1].value).toBe('2');
            expect(response.body.result.data.clinical[0][2].value).toBe('3');
        });
        test('Get data (aggregation with join)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 11',
                    fieldId: '11',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '2',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '1',
                        value: '11',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '22',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: {
                    clinical: [{
                        operationName: 'Affine',
                        params: {
                            removedKeys: [
                                '_id',
                                'id',
                                'studyId',
                                'dataVersion',
                                'life',
                                'metadata',
                                'properties',
                                'fieldId',
                                'value'
                            ],
                            addedKeyRules: [{
                                key: {
                                    type: enumASTNodeTypes.VALUE,
                                    operator: null,
                                    value: 'SubjectId',
                                    parameters: {},
                                    children: null
                                },
                                value: {
                                    type: enumASTNodeTypes.VARIABLE,
                                    operator: null,
                                    value: 'properties.SubjectId',
                                    parameters: {},
                                    children: null
                                }
                            }, {
                                key: {
                                    type: enumASTNodeTypes.VARIABLE,
                                    operator: null,
                                    value: 'fieldId',
                                    parameters: {},
                                    children: null
                                },
                                value: {
                                    type: enumASTNodeTypes.VARIABLE,
                                    operator: null,
                                    value: 'value',
                                    parameters: {},
                                    children: null
                                }
                            }],
                            rules: {}
                        }
                    }, {
                        operationName: 'Group',
                        params: {
                            keys: [
                                'SubjectId'
                            ],
                            skipUnmatch: false
                        }
                    }, {
                        operationName: 'Join',
                        params: {
                            reservedKeys: [
                                'SubjectId'
                            ]
                        }
                    }]
                },
                fieldIds: undefined,
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(response.body.result.data.clinical).toHaveLength(2);
            expect(response.body.result.data.clinical[0]).toMatchObject({
                SubjectId: '1A',
                1: 1,
                11: 2
            });
            expect(response.body.result.data.clinical[1]).toMatchObject({
                SubjectId: '2B',
                1: 11,
                11: 22
            });
        });
        test('Get data (aggregation with degroup)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 11',
                    fieldId: '11',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '2',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '1',
                        value: '11',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '22',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: {
                    clinical: [{
                        operationName: 'Affine',
                        params: {
                            removedKeys: [
                                '_id',
                                'id',
                                'studyId',
                                'dataVersion',
                                'life',
                                'metadata',
                                'properties',
                                'fieldId',
                                'value'
                            ],
                            addedKeyRules: [{
                                key: {
                                    type: enumASTNodeTypes.VALUE,
                                    operator: null,
                                    value: 'SubjectId',
                                    parameters: {},
                                    children: null
                                },
                                value: {
                                    type: enumASTNodeTypes.VARIABLE,
                                    operator: null,
                                    value: 'properties.SubjectId',
                                    parameters: {},
                                    children: null
                                }
                            }, {
                                key: {
                                    type: enumASTNodeTypes.VARIABLE,
                                    operator: null,
                                    value: 'fieldId',
                                    parameters: {},
                                    children: null
                                },
                                value: {
                                    type: enumASTNodeTypes.VARIABLE,
                                    operator: null,
                                    value: 'value',
                                    parameters: {},
                                    children: null
                                }
                            }],
                            rules: {}
                        }
                    }, {
                        operationName: 'Group',
                        params: {
                            keys: [
                                'SubjectId'
                            ],
                            skipUnmatch: false
                        }
                    }, {
                        operationName: 'Join',
                        params: {
                            reservedKeys: [
                                'SubjectId'
                            ]
                        }
                    }, {
                        operationName: 'Degroup',
                        params: {
                            sharedKeys: ['SubjectId'],
                            targetKeyGroups: [['1'], ['11']]
                        }
                    }]
                },
                fieldIds: undefined,
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(response.body.result.data.clinical).toHaveLength(2);
            expect(response.body.result.data.clinical[0]).toHaveLength(2);
            expect(response.body.result.data.clinical[1]).toHaveLength(2);
            expect(response.body.result.data.clinical[0][0]).toMatchObject({
                1: 1,
                SubjectId: '1A'
            });
            expect(response.body.result.data.clinical[0][1]).toMatchObject({
                11: 2,
                SubjectId: '1A'
            });
            expect(response.body.result.data.clinical[1][0]).toMatchObject({
                1: 11,
                SubjectId: '2B'
            });
            expect(response.body.result.data.clinical[1][1]).toMatchObject({
                11: 22,
                SubjectId: '2B'
            });
        });
        test('Get data (aggregation with filter)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 11',
                    fieldId: '11',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '2',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '1',
                        value: '11',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '22',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: {
                    clinical: [{
                        operationName: 'Filter',
                        params: {
                            filters: {
                                tag: [{
                                    formula: {
                                        value: 'fieldId',
                                        operation: null,
                                        type: 'VARIABLE',
                                        parameter: {},
                                        children: null
                                    },
                                    value: '11',
                                    condition: enumConditionOps.STRINGEQUAL,
                                    parameters: {}
                                }]
                            }
                        }
                    }]
                },
                fieldIds: undefined,
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(response.body.result.data.clinical).toHaveLength(2);
            expect(response.body.result.data.clinical[0].fieldId).toBe('11');
            expect(response.body.result.data.clinical[1].fieldId).toBe('11');
        });
        test('Get data (aggregation with flatten)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 11',
                    fieldId: '11',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '2',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '1',
                        value: '11',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '22',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: {
                    clinical: [{
                        operationName: 'Flatten',
                        params: {
                            keepFlattened: true,
                            flattenedKey: 'properties',
                            keepFlattenedKey: false
                        }
                    }]
                },
                fieldIds: undefined,
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(response.body.result.data.clinical).toHaveLength(4);
            expect(response.body.result.data.clinical[0].SubjectId).toBeDefined();
            expect(response.body.result.data.clinical[1].SubjectId).toBeDefined();
            expect(response.body.result.data.clinical[2].SubjectId).toBeDefined();
            expect(response.body.result.data.clinical[3].SubjectId).toBeDefined();
        });
        test('Get data (aggregation with count)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 11',
                    fieldId: '11',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '2',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '1',
                        value: '11',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '22',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: {
                    clinical: [{
                        operationName: 'Group',
                        params: {
                            keys: [
                                'properties.SubjectId'
                            ],
                            skipUnmatch: false
                        }
                    }, {
                        operationName: 'Count',
                        params: {

                        }
                    }]
                },
                fieldIds: undefined,
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(response.body.result.data.clinical).toHaveLength(2);
            expect(response.body.result.data.clinical[0].count).toBe(2);
            expect(response.body.result.data.clinical[1].count).toBe(2);
        });
        test('Get data (with fieldIds)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 11',
                    fieldId: '11',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '2',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '1',
                        value: '11',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }, {
                        fieldId: '11',
                        value: '22',
                        properties: {
                            SubjectId: '2B',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: undefined,
                fieldIds: ['1'],
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(200);
            expect(response.body.result.data).toHaveLength(2);
            expect(response.body.result.data[0].fieldId).toBe('1');
            expect(response.body.result.data[1].fieldId).toBe('1');
        });
        test('Get data (cache initialized)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: undefined,
                fieldIds: undefined,
                useCache: true,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            const cache = await db.collections!.cache_collection.findOne({});
            const file = await db.collections!.files_collection.findOne({});
            expect(response.status).toBe(200);
            expect(response.body.result.data.uri).toBe(cache?.uri);
            expect(cache?.uri).toBe(file?.uri);
        });
        test('Get data (cache existing)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: undefined,
                fieldIds: undefined,
                useCache: true,
                forceUpdate: undefined
            };
            await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});

            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            const cache = await db.collections!.cache_collection.find({}).toArray();
            const file = await db.collections!.files_collection.find({}).toArray();
            expect(cache).toHaveLength(1);
            expect(file).toHaveLength(1);
            expect(response.status).toBe(200);
            expect(response.body.result.data.uri).toBe(cache[0]?.uri);
            expect(cache[0]?.uri).toBe(file[0]?.uri);
        });
        test('Get data (cache existing but force update)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: undefined,
                fieldIds: undefined,
                useCache: true,
                forceUpdate: undefined
            };
            await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            paramteres.forceUpdate = true;
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            const cache = await db.collections!.cache_collection.find({}).toArray();
            const file = await db.collections!.files_collection.find({}).toArray();
            expect(cache).toHaveLength(2);
            expect(file).toHaveLength(2);
            expect(response.status).toBe(200);
            expect(response.body.result.data.uri).toBe(cache[1]?.uri);
            expect(cache[0]?.uri).not.toBe(cache[1]?.uri);
        });
        test('Get data (study does not exist)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: 'random',
                versionId: null,
                aggregation: undefined,
                fieldIds: undefined,
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe('Study does not exist.');
        });
        test('Get data (no permission)', async () => {
            await user.post('/trpc/data.createStudyField')
                .send({
                    studyId: study.id,
                    fieldName: 'Test Field 1',
                    fieldId: '1',
                    description: '',
                    dataType: enumDataTypes.INTEGER,
                    properties: [{
                        name: 'SubjectId',
                        description: null,
                        required: true
                    }, {
                        name: 'VisitId',
                        description: null,
                        required: true
                    }]
                });
            await user.post('/trpc/data.uploadStudyData')
                .send({
                    studyId: study.id,
                    data: [{
                        fieldId: '1',
                        value: '1',
                        properties: {
                            SubjectId: '1A',
                            VisitId: '1'
                        }
                    }]
                });
            const paramteres: any = {
                studyId: study.id,
                versionId: null,
                aggregation: undefined,
                fieldIds: ['2'],
                useCache: undefined,
                forceUpdate: undefined
            };
            const response = await user.get('/trpc/data.getData?input=' + encodeQueryParams(paramteres))
                .query({});
            expect(response.status).toBe(400);
            expect(response.body.error.message).toBe(errorCodes.NO_PERMISSION_ERROR);
        });
    });
} else {
    test(`${__filename.split(/[\\/]/).pop()} skipped because it requires Minio on Docker`, () => {
        expect(true).toBe(true);
    });
}