// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import request from 'supertest';
import { print } from 'graphql';
import { connectAdmin, connectUser, connectAgent } from './_loginHelperV1';
import { db } from '../../src/database/database';
import { Router } from '../../src/server/router';
import { errorCodes } from '../../src/graphql/errors';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setupDatabase } from 'itmat-setup';
import config from '../../config/config.sample.json';
import { v4 as uuid } from 'uuid';
import {
    GET_STUDY,
    GET_PROJECT,
    GET_USERS,
    EDIT_ROLE,
    ADD_NEW_ROLE,
    WHO_AM_I,
    CREATE_PROJECT,
    CREATE_STUDY,
    DELETE_STUDY,
    userTypes,
    permissions,
    IDataEntry,
    IUser,
    IFile,
    IFieldEntry,
    IStudyDataVersion,
    enumValueType,
    studyType
} from 'itmat-commons';


let app;
let mongodb;
let admin;
let user;
let mongoConnection;
let mongoClient;

afterAll(async () => {
    await db.closeConnection();
    await mongoConnection?.close();
    await mongodb.stop();

    /* claer all mocks */
    jest.clearAllMocks();
});

beforeAll(async () => { // eslint-disable-line no-undef
    /* Creating a in-memory MongoDB instance for testing */
    mongodb = await MongoMemoryServer.create();
    const connectionString = mongodb.getUri();
    const database = mongodb.instanceInfo.dbName;
    await setupDatabase(connectionString, database);

    /* Wiring up the backend server */
    config.database.mongo_url = connectionString;
    config.database.database = database;
    await db.connect(config.database, MongoClient.connect as any);
    const router = new Router(config);

    /* Connect mongo client (for test setup later / retrieve info later) */
    mongoConnection = await MongoClient.connect(connectionString);
    mongoClient = mongoConnection.db(database);

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
    let adminId;

    beforeAll(async () => {
        /* setup: first retrieve the generated user id */
        const result = await mongoClient.collection(config.database.collections.users_collection).find({}, { projection: { id: 1, username: 1 } }).toArray();
        adminId = result.filter(e => e.username === 'admin')[0].id;
    });

    describe('MINI END-TO-END API TEST, NO UI, NO DATA', () => {
        let createdProject;
        let createdStudy;
        let createdRole_study;
        let createdRole_study_manageProject;
        let createdRole_project;
        let createdUserAuthorised;  // profile
        let createdUserAuthorisedStudy;  // profile
        let createdUserAuthorisedStudyManageProjects;  // profile
        let authorisedUser; // client
        let authorisedUserStudy; // client
        let authorisedUserStudyManageProject; // client
        let mockFields: IFieldEntry[];
        let mockFiles: IFile[];
        let mockDataVersion: IStudyDataVersion;
        // const newMockDataVersion: IStudyDataVersion = { // this is not added right away; but multiple tests uses this
        //     id: 'mockDataVersionId2',
        //     contentId: 'mockContentId2',
        //     version: '0.0.2',
        //     updateDate: '5000000',
        //     tag: 'hey',
        // };

        beforeAll(async () => {
            /*** setup: create a setup study ***/
            /* 1. create study */
            {
                const studyName = uuid();
                const res = await admin.post('/v1').send({
                    query: print(CREATE_STUDY),
                    variables: { name: studyName, description: 'test description', type: studyType.SENSOR }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                createdStudy = await mongoClient.collection(config.database.collections.studies_collection).findOne({ name: studyName });
                expect(res.body.data.createStudy).toEqual({
                    id: createdStudy.id,
                    name: studyName,
                    description: 'test description',
                    type: studyType.SENSOR
                });
            }

            /* x. mock - add data to the study */
            {
                mockDataVersion = {
                    id: 'mockDataVersionId',
                    contentId: 'mockContentId',
                    version: '0.0.1',
                    updateDate: '5000000'
                };
                const mockData: IDataEntry[] = [
                    {
                        id: 'mockData1',
                        m_subjectId: 'mock_patient1',
                        m_visitId: 'mockvisitId',
                        m_studyId: createdStudy.id,
                        m_versionId: mockDataVersion.id,
                        31: 'male',
                        49: 'England',
                        deleted: null
                    },
                    {
                        id: 'mockData2',
                        m_subjectId: 'mock_patient2',
                        m_visitId: 'mockvisitId',
                        m_studyId: createdStudy.id,
                        m_versionId: mockDataVersion.id,
                        31: 'female',
                        49: 'France',
                        deleted: null
                    }
                ];
                mockFields = [
                    {
                        id: 'mockfield1',
                        studyId: createdStudy.id,
                        fieldId: '31',
                        fieldName: 'Sex',
                        dataType: enumValueType.STRING,
                        possibleValues: [],
                        unit: 'person',
                        comments: 'mockComments1',
                        dateAdded: '2021-05-16T16:32:10.226Z',
                        dateDeleted: null,
                        dataVersion: 'mockDataVersionId'
                    },
                    {
                        id: 'mockfield2',
                        studyId: createdStudy.id,
                        fieldId: '32',
                        fieldName: 'Sex',
                        dataType: enumValueType.STRING,
                        possibleValues: [],
                        unit: 'person',
                        comments: 'mockComments2',
                        dateAdded: '2022-06-18T17:35:15.226Z',
                        dateDeleted: null,
                        dataVersion: 'mockDataVersionId'
                    }
                ];

                mockFiles = [
                    {
                        id: 'mockfile1_id',
                        fileName: 'mockfile1_name',
                        studyId: createdStudy.id,
                        fileSize: '1000',
                        description: 'Just a test file1',
                        uploadTime: '1599345644000',
                        uploadedBy: adminId,
                        uri: 'fakeuri',
                        deleted: null,
                        hash: '4ae25be36354ee0aec8dc8deac3f279d2e9d6415361da996cf57eb6142cfb1a2'
                    },
                    {
                        id: 'mockfile2_id',
                        fileName: 'mockfile2_name',
                        studyId: createdStudy.id,
                        fileSize: '1000',
                        description: 'Just a test file2',
                        uploadTime: '1599345644000',
                        uploadedBy: adminId,
                        uri: 'fakeuri2',
                        deleted: null,
                        hash: '4ae25be36354ee0aec8dc8deac3f279d2e9d6415361da996cf57eb6142cfb1a3'
                    }
                ];
                await db.collections!.studies_collection.updateOne({ id: createdStudy.id }, { $push: { dataVersions: mockDataVersion }, $inc: { currentDataVersion: 1 } });
                await db.collections!.data_collection.insertMany(mockData);
                await db.collections!.field_dictionary_collection.insertMany(mockFields);
                await db.collections!.files_collection.insertMany(mockFiles);
            }

            /* 2. create projects for the study */
            {
                const projectName = uuid();
                const res = await admin.post('/v1').send({
                    query: print(CREATE_PROJECT),
                    variables: {
                        studyId: createdStudy.id,
                        projectName: projectName,
                        dataVersion: mockDataVersion.id
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                createdProject = await mongoClient.collection(config.database.collections.projects_collection).findOne({ name: projectName });
                expect(res.body.data.createProject).toEqual({
                    id: createdProject.id,
                    studyId: createdStudy.id,
                    name: projectName,
                    approvedFields: []
                });
            }

            /* 3. create roles for study */
            {
                const roleName = uuid();
                const res = await admin.post('/v1').send({
                    query: print(ADD_NEW_ROLE),
                    variables: {
                        roleName,
                        studyId: createdStudy.id,
                        projectId: null
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();

                createdRole_study = await mongoClient.collection(config.database.collections.roles_collection).findOne({ name: roleName });
                expect(createdRole_study).toEqual({
                    _id: createdRole_study._id,
                    id: createdRole_study.id,
                    projectId: null,
                    studyId: createdStudy.id,
                    name: roleName,
                    permissions: [],
                    createdBy: adminId,
                    users: [],
                    deleted: null
                });
                expect(res.body.data.addRoleToStudyOrProject).toEqual({
                    id: createdRole_study.id,
                    name: roleName,
                    permissions: [],
                    studyId: createdStudy.id,
                    projectId: null,
                    users: []
                });
            }
            /* create another role for study (this time it will have "manage project" privilege - equivalent to PI */
            {
                const roleName = uuid();
                const res = await admin.post('/v1').send({
                    query: print(ADD_NEW_ROLE),
                    variables: {
                        roleName,
                        studyId: createdStudy.id,
                        projectId: null
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();

                createdRole_study_manageProject = await mongoClient.collection(config.database.collections.roles_collection).findOne({ name: roleName });
                expect(createdRole_study_manageProject).toEqual({
                    _id: createdRole_study_manageProject._id,
                    id: createdRole_study_manageProject.id,
                    projectId: null,
                    studyId: createdStudy.id,
                    name: roleName,
                    permissions: [],
                    createdBy: adminId,
                    users: [],
                    deleted: null
                });
                expect(res.body.data.addRoleToStudyOrProject).toEqual({
                    id: createdRole_study_manageProject.id,
                    name: roleName,
                    permissions: [],
                    studyId: createdStudy.id,
                    projectId: null,
                    users: []
                });
            }

            /* 4. create roles for project */
            {
                const roleName = uuid();
                const res = await admin.post('/v1').send({
                    query: print(ADD_NEW_ROLE),
                    variables: {
                        roleName,
                        studyId: createdStudy.id,
                        projectId: createdProject.id
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                createdRole_project = await mongoClient.collection(config.database.collections.roles_collection).findOne({ name: roleName });
                expect(createdRole_project).toEqual({
                    _id: createdRole_project._id,
                    id: createdRole_project.id,
                    projectId: createdProject.id,
                    studyId: createdStudy.id,
                    name: roleName,
                    permissions: [],
                    createdBy: adminId,
                    users: [],
                    deleted: null
                });
                expect(res.body.data.addRoleToStudyOrProject).toEqual({
                    id: createdRole_project.id,
                    name: roleName,
                    permissions: [],
                    studyId: createdStudy.id,
                    projectId: createdProject.id,
                    users: []
                });
            }

            /* 5. create an authorised project user (no role yet) */
            {
                const username = uuid();
                const newUser: IUser = {
                    username: username,
                    type: userTypes.STANDARD,
                    firstname: `${username}_firstname`,
                    lastname: `${username}_lastname`,
                    password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                    otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                    email: `${username}@user.io`,
                    resetPasswordRequests: [],
                    description: 'I am an authorised project user.',
                    emailNotificationsActivated: true,
                    organisation: 'organisation_system',
                    deleted: null,
                    id: `AuthorisedProjectUser_${username}`,
                    createdAt: 1591134065000,
                    expiredAt: 1991134065000
                };
                await mongoClient.collection(config.database.collections.users_collection).insertOne(newUser);
                createdUserAuthorised = await mongoClient.collection(config.database.collections.users_collection).findOne({ username });
            }

            /* 6. add authorised user to role */
            {
                const res = await admin.post('/v1').send({
                    query: print(EDIT_ROLE),
                    variables: {
                        roleId: createdRole_project.id,
                        userChanges: {
                            add: [createdUserAuthorised.id],
                            remove: []
                        },
                        permissionChanges: {
                            add: [permissions.specific_project.specific_project_readonly_access],
                            remove: []
                        }
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.editRole).toEqual({
                    id: createdRole_project.id,
                    name: createdRole_project.name,
                    studyId: createdStudy.id,
                    projectId: createdProject.id,
                    permissions: [permissions.specific_project.specific_project_readonly_access],
                    users: [{
                        id: createdUserAuthorised.id,
                        organisation: 'organisation_system',
                        firstname: createdUserAuthorised.firstname,
                        lastname: createdUserAuthorised.lastname
                    }]
                });
                const resUser = await admin.post('/v1').send({
                    query: print(GET_USERS),
                    variables: {
                        fetchDetailsAdminOnly: false,
                        userId: createdUserAuthorised.id,
                        fetchAccessPrivileges: true
                    }
                });
                expect(resUser.status).toBe(200);
                expect(resUser.body.errors).toBeUndefined();
                expect(resUser.body.data.getUsers).toHaveLength(1);
                expect(resUser.body.data.getUsers[0]).toEqual({
                    id: createdUserAuthorised.id,
                    type: userTypes.STANDARD,
                    firstname: `${createdUserAuthorised.username}_firstname`,
                    lastname: `${createdUserAuthorised.username}_lastname`,
                    organisation: 'organisation_system',
                    access: {
                        id: `user_access_obj_user_id_${createdUserAuthorised.id}`,
                        projects: [{
                            id: createdProject.id,
                            name: createdProject.name,
                            studyId: createdStudy.id
                        }],
                        studies: []
                    }
                });
            }

            /* 5. create an authorised study user (no role yet) */
            {
                const username = uuid();
                const newUser: IUser = {
                    username: username,
                    type: userTypes.STANDARD,
                    firstname: `${username}_firstname`,
                    lastname: `${username}_lastname`,
                    password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                    otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                    email: `${username}@user.io`,
                    resetPasswordRequests: [],
                    description: 'I am an authorised study user.',
                    emailNotificationsActivated: true,
                    organisation: 'organisation_system',
                    deleted: null,
                    id: `AuthorisedStudyUser_${username}`,
                    createdAt: 1591134065000,
                    expiredAt: 1991134065000
                };
                await mongoClient.collection(config.database.collections.users_collection).insertOne(newUser);
                createdUserAuthorisedStudy = await mongoClient.collection(config.database.collections.users_collection).findOne({ username });
            }

            /* 6. add authorised user to role */
            {
                const res = await admin.post('/v1').send({
                    query: print(EDIT_ROLE),
                    variables: {
                        roleId: createdRole_study.id,
                        userChanges: {
                            add: [createdUserAuthorisedStudy.id],
                            remove: []
                        },
                        permissionChanges: {
                            add: [permissions.specific_study.specific_study_readonly_access],
                            remove: []
                        }
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.editRole).toEqual({
                    id: createdRole_study.id,
                    name: createdRole_study.name,
                    studyId: createdStudy.id,
                    projectId: null,
                    permissions: [permissions.specific_study.specific_study_readonly_access],
                    users: [{
                        id: createdUserAuthorisedStudy.id,
                        organisation: 'organisation_system',
                        firstname: createdUserAuthorisedStudy.firstname,
                        lastname: createdUserAuthorisedStudy.lastname
                    }]
                });
                const resUser = await admin.post('/v1').send({
                    query: print(GET_USERS),
                    variables: {
                        fetchDetailsAdminOnly: false,
                        userId: createdUserAuthorisedStudy.id,
                        fetchAccessPrivileges: true
                    }
                });
                expect(resUser.status).toBe(200);
                expect(resUser.body.errors).toBeUndefined();
                expect(resUser.body.data.getUsers).toHaveLength(1);
                expect(resUser.body.data.getUsers[0]).toEqual({
                    id: createdUserAuthorisedStudy.id,
                    type: userTypes.STANDARD,
                    firstname: `${createdUserAuthorisedStudy.username}_firstname`,
                    lastname: `${createdUserAuthorisedStudy.username}_lastname`,
                    organisation: 'organisation_system',
                    access: {
                        id: `user_access_obj_user_id_${createdUserAuthorisedStudy.id}`,
                        projects: [{
                            id: createdProject.id,
                            name: createdProject.name,
                            studyId: createdStudy.id
                        }],
                        studies: [{
                            id: createdStudy.id,
                            name: createdStudy.name
                        }]
                    }
                });
            }

            /* 5. create an authorised study user that can manage projects (no role yet) */
            {
                const username = uuid();
                const newUser: IUser = {
                    username: username,
                    type: userTypes.STANDARD,
                    firstname: `${username}_firstname`,
                    lastname: `${username}_lastname`,
                    password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                    otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                    email: `${username}'@user.io'`,
                    resetPasswordRequests: [],
                    description: 'I am an authorised study user managing project.',
                    emailNotificationsActivated: true,
                    organisation: 'organisation_system',
                    deleted: null,
                    id: `AuthorisedStudyUserManageProject_${username}`,
                    createdAt: 1591134065000,
                    expiredAt: 1991134065000
                };

                await mongoClient.collection(config.database.collections.users_collection).insertOne(newUser);
                createdUserAuthorisedStudyManageProjects = await mongoClient.collection(config.database.collections.users_collection).findOne({ username });
            }

            /* 6. add authorised user to role */
            {
                const res = await admin.post('/v1').send({
                    query: print(EDIT_ROLE),
                    variables: {
                        roleId: createdRole_study_manageProject.id,
                        userChanges: {
                            add: [createdUserAuthorisedStudyManageProjects.id],
                            remove: []
                        },
                        permissionChanges: {
                            add: [permissions.specific_study.specific_study_projects_management],
                            remove: []
                        }
                    }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.editRole).toEqual({
                    id: createdRole_study_manageProject.id,
                    name: createdRole_study_manageProject.name,
                    studyId: createdStudy.id,
                    projectId: null,
                    permissions: [permissions.specific_study.specific_study_projects_management],
                    users: [{
                        id: createdUserAuthorisedStudyManageProjects.id,
                        organisation: 'organisation_system',
                        firstname: createdUserAuthorisedStudyManageProjects.firstname,
                        lastname: createdUserAuthorisedStudyManageProjects.lastname
                    }]
                });
                const resUser = await admin.post('/v1').send({
                    query: print(GET_USERS),
                    variables: {
                        fetchDetailsAdminOnly: false,
                        userId: createdUserAuthorisedStudyManageProjects.id,
                        fetchAccessPrivileges: true
                    }
                });
                expect(resUser.status).toBe(200);
                expect(resUser.body.errors).toBeUndefined();
                expect(resUser.body.data.getUsers).toHaveLength(1);
                expect(resUser.body.data.getUsers[0]).toEqual({
                    id: createdUserAuthorisedStudyManageProjects.id,
                    type: userTypes.STANDARD,
                    firstname: `${createdUserAuthorisedStudyManageProjects.username}_firstname`,
                    lastname: `${createdUserAuthorisedStudyManageProjects.username}_lastname`,
                    organisation: 'organisation_system',
                    access: {
                        id: `user_access_obj_user_id_${createdUserAuthorisedStudyManageProjects.id}`,
                        projects: [{
                            id: createdProject.id,
                            name: createdProject.name,
                            studyId: createdStudy.id
                        }],
                        studies: [{
                            id: createdStudy.id,
                            name: createdStudy.name
                        }]
                    }
                });
            }
            /* fsdafs: admin who am i */
            {
                const res = await admin.post('/v1').send({ query: print(WHO_AM_I) });
                expect(res.body.data.whoAmI).toStrictEqual({
                    username: 'admin',
                    type: userTypes.ADMIN,
                    firstname: 'Fadmin',
                    lastname: 'Ladmin',
                    organisation: 'organisation_system',
                    email: 'admin@example.com',
                    description: 'I am an admin user.',
                    id: adminId,
                    access: {
                        id: `user_access_obj_user_id_${adminId}`,
                        projects: [{
                            id: createdProject.id,
                            name: createdProject.name,
                            studyId: createdStudy.id
                        }],
                        studies: [{
                            id: createdStudy.id,
                            name: createdStudy.name,
                            type: studyType.SENSOR
                        }]
                    },
                    createdAt: 1591134065000,
                    expiredAt: 1991134065000
                });
            }
            /* connecting users */
            authorisedUser = request.agent(app);
            await connectAgent(authorisedUser, createdUserAuthorised.username, 'admin', createdUserAuthorised.otpSecret);
            authorisedUserStudy = request.agent(app);
            await connectAgent(authorisedUserStudy, createdUserAuthorisedStudy.username, 'admin', createdUserAuthorisedStudy.otpSecret);
            authorisedUserStudyManageProject = request.agent(app);
            await connectAgent(authorisedUserStudyManageProject, createdUserAuthorisedStudyManageProjects.username, 'admin', createdUserAuthorisedStudyManageProjects.otpSecret);
        });

        afterAll(async () => {
            /* project user cannot delete study */
            {
                const res = await authorisedUser.post('/v1').send({
                    query: print(DELETE_STUDY),
                    variables: { studyId: createdStudy.id }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
                expect(res.body.data.deleteStudy).toBe(null);
            }

            /* delete values in db */
            await db.collections!.field_dictionary_collection.deleteMany({ studyId: createdStudy.id });
            await db.collections!.data_collection.deleteMany({ m_studyId: createdStudy.id });
            await db.collections!.files_collection.deleteMany({ studyId: createdStudy.id });

            /* study user cannot delete study */
            {
                const res = await authorisedUserStudy.post('/v1').send({
                    query: print(DELETE_STUDY),
                    variables: { studyId: createdStudy.id }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
                expect(res.body.data.deleteStudy).toBe(null);
            }

            /* admin can delete study */
            {
                const res = await admin.post('/v1').send({
                    query: print(DELETE_STUDY),
                    variables: { studyId: createdStudy.id }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.deleteStudy).toEqual({
                    id: createdStudy.id,
                    successful: true
                });
            }

            /* check projects and roles are also deleted */
            {
                const res = await admin.post('/v1').send({ query: print(WHO_AM_I) });
                expect(res.body.data.whoAmI).toEqual({
                    username: 'admin',
                    type: userTypes.ADMIN,
                    firstname: 'Fadmin',
                    lastname: 'Ladmin',
                    organisation: 'organisation_system',
                    email: 'admin@example.com',
                    description: 'I am an admin user.',
                    id: adminId,
                    access: {
                        id: `user_access_obj_user_id_${adminId}`,
                        projects: [],
                        studies: []
                    },
                    createdAt: 1591134065000,
                    expiredAt: 1991134065000
                });

                // study data is NOT deleted for audit purposes - unless explicitly requested separately
                const roles = await db.collections!.roles_collection.find({ studyId: createdStudy.id, deleted: null }).toArray();
                const projects = await db.collections!.projects_collection.find({ studyId: createdStudy.id, deleted: null }).toArray();
                const study = await db.collections!.studies_collection.findOne({ id: createdStudy.id, deleted: null });
                expect(roles).toEqual([]);
                expect(projects).toEqual([]);
                expect(study).toBe(null);
            }

            /* cannot get study from api anymore */
            {
                const res = await admin.post('/v1').send({
                    query: print(GET_STUDY),
                    variables: { studyId: createdStudy.id }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toHaveLength(1);
                expect(res.body.errors[0].message).toBe(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
                expect(res.body.data.getStudy).toBe(null);
            }
        });

        test('Get a non-existent study (admin)', async () => {
            const res = await admin.post('/v1').send({
                query: print(GET_STUDY),
                variables: { studyId: 'iamfake' }
            });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            expect(res.body.data.getStudy).toBe(null);
        });

        test('Get a non-existent project (admin)', async () => {
            const res = await admin.post('/v1').send({
                query: print(GET_PROJECT),
                variables: { projectId: 'iamfake', admin: true }
            });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            expect(res.body.data.getProject).toBe(null);
        });

        test('Get list of files with different endpoints (user)', async () => {
            await db.collections!.files_collection.insertMany([{
                id: 'fakeid1',
                fileName: 'I7N3G6G-MMM7N3G6G-20200704-20200721.txt',
                studyId: createdStudy.id,
                fileSize: 13,
                description: JSON.stringify({ participantId: 'I7N3G6G', deviceId: 'MMM7N3G6G', startDate: 1593817200000, endDate: 1595286000000 }),
                uploadTime: '1991134065000',
                uploadedBy: createdUserAuthorised.id,
                uri: 'fakeuri1',
                deleted: null,
                hash: '4ae25be36354ee0aec8dc8deac3f279d2e9d6415361da996cf57eb6142cfb1a2'
            }, {
                id: 'fakeid2',
                fileName: 'I7N3G6G-MMM7N3G6G-20200704-20200721.txt',
                studyId: createdStudy.id,
                fileSize: 15,
                description: JSON.stringify({ participantId: 'I7N3G6G', deviceId: 'MMM7N3G6G', startDate: 1593817200000, endDate: 1595286000000 }),
                uploadTime: '1991134065000',
                uploadedBy: createdUserAuthorised.id,
                uri: 'fakeuri2',
                deleted: null,
                hash: '4ae25be36354ee0aec8dc8deac3f279d2e9d6415361da996cf57eb6142cfb1a2'
            }]);

            // console.log(JSON.stringify(res.body.data.getStudy.roles));
            const resGraphql = await authorisedUserStudy.post('/graphql').send({
                query: print(GET_STUDY),
                variables: { studyId: createdStudy.id }
            });
            expect(resGraphql.status).toBe(200);
            expect(resGraphql.body.data.getStudy.files).toHaveLength(4); // two original files, two just uploaded
            const resV1 = await authorisedUserStudy.post('/v1').send({
                query: print(GET_STUDY),
                variables: { studyId: createdStudy.id }
            });
            expect(resV1.status).toBe(200);
            expect(resV1.body.data.getStudy.files).toHaveLength(3); // one duplicate is ignored

            // clear files
            await db.collections!.files_collection.deleteMany({ studyId: createdStudy.id, fileName: 'I7N3G6G-MMM7N3G6G-20200704-20200721.txt' });
        });

        test('Get study (admin)', async () => {
            {
                const res = await admin.post('/v1').send({
                    query: print(GET_STUDY),
                    variables: { studyId: createdStudy.id }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.getStudy).toEqual({
                    id: createdStudy.id,
                    name: createdStudy.name,
                    createdBy: adminId,
                    jobs: [],
                    description: 'test description',
                    type: studyType.SENSOR,
                    ontologyTree: null,
                    projects: [
                        {
                            id: createdProject.id,
                            studyId: createdStudy.id,
                            name: createdProject.name
                        }
                    ],
                    roles: [
                        {
                            id: createdRole_study.id,
                            name: createdRole_study.name,
                            permissions: [permissions.specific_study.specific_study_readonly_access],
                            projectId: null,
                            studyId: createdStudy.id,
                            users: [{
                                id: createdUserAuthorisedStudy.id,
                                organisation: 'organisation_system',
                                firstname: createdUserAuthorisedStudy.firstname,
                                lastname: createdUserAuthorisedStudy.lastname,
                                username: createdUserAuthorisedStudy.username
                            }]
                        },
                        {
                            id: createdRole_study_manageProject.id,
                            name: createdRole_study_manageProject.name,
                            permissions: [permissions.specific_study.specific_study_projects_management],
                            projectId: null,
                            studyId: createdStudy.id,
                            users: [{
                                id: createdUserAuthorisedStudyManageProjects.id,
                                organisation: 'organisation_system',
                                firstname: createdUserAuthorisedStudyManageProjects.firstname,
                                lastname: createdUserAuthorisedStudyManageProjects.lastname,
                                username: createdUserAuthorisedStudyManageProjects.username
                            }]
                        }
                    ],
                    files: [
                        {
                            id: 'mockfile1_id',
                            fileName: 'mockfile1_name',
                            studyId: createdStudy.id,
                            projectId: null,
                            fileSize: '1000',
                            description: 'Just a test file1',
                            uploadTime: '1599345644000',
                            uploadedBy: adminId,
                            hash: '4ae25be36354ee0aec8dc8deac3f279d2e9d6415361da996cf57eb6142cfb1a2'
                        },
                        {
                            id: 'mockfile2_id',
                            fileName: 'mockfile2_name',
                            studyId: createdStudy.id,
                            projectId: null,
                            fileSize: '1000',
                            description: 'Just a test file2',
                            uploadTime: '1599345644000',
                            uploadedBy: adminId,
                            hash: '4ae25be36354ee0aec8dc8deac3f279d2e9d6415361da996cf57eb6142cfb1a3'
                        }
                    ],
                    numOfRecords: 2,
                    subjects: ['mock_patient1', 'mock_patient2'],
                    visits: ['mockvisitId'],
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
            }
            {
                const res = await admin.post('/v1').send({
                    query: print(GET_PROJECT),
                    variables: { projectId: createdProject.id, admin: true }
                });
                expect(res.status).toBe(200);
                expect(res.body.errors).toBeUndefined();
                expect(res.body.data.getProject).toEqual({
                    id: createdProject.id,
                    studyId: createdStudy.id,
                    name: createdProject.name,
                    approvedFields: [],
                    approvedFiles: [],
                    jobs: [],
                    roles: [
                        {
                            id: createdRole_project.id,
                            name: createdRole_project.name,
                            permissions: [permissions.specific_project.specific_project_readonly_access],
                            projectId: createdProject.id,
                            studyId: createdStudy.id,
                            users: [{
                                id: createdUserAuthorised.id,
                                organisation: 'organisation_system',
                                firstname: createdUserAuthorised.firstname,
                                lastname: createdUserAuthorised.lastname,
                                username: createdUserAuthorised.username
                            }]
                        }
                    ],
                    iCanEdit: true,
                    fields: [],
                    files: []
                });
            }
        });
    });
});
