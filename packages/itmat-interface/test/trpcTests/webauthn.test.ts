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
import { IUser, enumUserTypes } from '@itmat-broker/itmat-types';
import { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON, PublicKeyCredentialRequestOptionsJSON, AuthenticationResponseJSON } from '@simplewebauthn/types';

let app: Express;
let mongodb: MongoMemoryServer;
let admin: request.SuperTest<request.Test>;
let user: request.SuperTest<request.Test>;
let mongoConnection: MongoClient;
let __unusedMongoClient: Db;
let __unusedAdminProfile: IUser;
let userProfile: IUser;

beforeAll(async () => {
    /* Setup MongoDB */
    const dbName = uuid();
    mongodb = await MongoMemoryServer.create({ instance: { dbName } });
    const connectionString = mongodb.getUri();
    await setupDatabase(connectionString, dbName);

    /* Configure the app */
    config.objectStore.port = global.minioContainerPort;
    config.database.mongo_url = connectionString;
    config.database.database = dbName;
    await db.connect(config.database, MongoClient);
    await objStore.connect(config.objectStore);

    const router = new Router(config);
    await router.init();

    /* Connect to MongoDB */
    mongoConnection = await MongoClient.connect(connectionString);
    mongoClient = mongoConnection.db(dbName);

    /* Setup Express app */
    app = router.getApp();
    admin = request.agent(app);
    user = request.agent(app);
    await connectAdmin(admin);
    await connectUser(user);

    /* Get user profiles */
    const users = await db.collections.users_collection.find({}).toArray();
    adminProfile = users.find(el => el.type === enumUserTypes.ADMIN);
    userProfile = users.find(el => el.type === enumUserTypes.STANDARD);
});

afterAll(async () => {
    await db.closeConnection();
    await mongoConnection.close();
    await mongodb.stop();
    jest.clearAllMocks();
});

describe('tRPC WebAuthn APIs', () => {

    // Test: Get WebAuthn registration options
    test('Get WebAuthn registration options', async () => {
        const response = await user.post('/trpc/webauthn.webauthnRegister').send();

        expect(response.status).toBe(200);
        expect(response.body.result.data.options).toBeDefined();
        expect(response.body.result.data.webauthn_id).toBeDefined();

        const registrationOptions: PublicKeyCredentialCreationOptionsJSON = response.body.result.data.options;
        expect(registrationOptions).toHaveProperty('challenge');
        expect(registrationOptions).toHaveProperty('rp');
        expect(registrationOptions).toHaveProperty('user');
    });

    // Test: Verify WebAuthn registration
    test('Verify WebAuthn registration', async () => {
        const __unusedRegisterResponse = await user.post('/trpc/webauthn.webauthnRegister').send();

        const mockAttestationResponse: RegistrationResponseJSON = {
            id: 'mock_id',
            rawId: 'mock_rawId',
            response: {
                clientDataJSON: 'mock_clientDataJSON',
                attestationObject: 'mock_attestationObject'
            },
            type: 'public-key',
            clientExtensionResults: {}
        };

        const verifyResponse = await user.post('/trpc/webauthn.webauthnRegisterVerify')
            .send({ input: { attestationResponse: mockAttestationResponse } });

        expect(verifyResponse.status).toBe(200);
        expect(verifyResponse.body.result.data.successful).toBe(true);

        const webauthnRecord = await db.collections.webauthn_collection.findOne({ userId: userProfile.id });
        expect(webauthnRecord).toBeDefined();
        expect(webauthnRecord?.devices).toHaveLength(1);
        expect(webauthnRecord?.devices[0].credentialID).toBe(mockAttestationResponse.rawId);
    });

    // Test: Get WebAuthn authentication options
    test('Get WebAuthn authentication options', async () => {
        const response = await user.post('/trpc/webauthn.webauthnAuthenticate')
            .send({ input: { userId: userProfile.id } });

        expect(response.status).toBe(200);
        expect(response.body.result.data.challenge).toBeDefined();

        const authenticationOptions: PublicKeyCredentialRequestOptionsJSON = response.body.result.data;
        expect(authenticationOptions).toHaveProperty('challenge');
        expect(authenticationOptions).toHaveProperty('rpId');
        expect(authenticationOptions).toHaveProperty('allowCredentials');
    });

    // Test: Verify WebAuthn authentication
    test('Verify WebAuthn authentication', async () => {
        const __unusedAuthOptionsResponse = await user.post('/trpc/webauthn.webauthnAuthenticate')
            .send({ input: { userId: userProfile.id } });

        const mockAssertionResponse: AuthenticationResponseJSON = {
            id: 'mock_id',
            rawId: 'mock_rawId',
            response: {
                clientDataJSON: 'mock_clientDataJSON',
                authenticatorData: 'mock_authenticatorData',
                signature: 'mock_signature'
            },
            type: 'public-key',
            clientExtensionResults: {}
        };

        const verifyResponse = await user.post('/trpc/webauthn.webauthnAuthenticateVerify')
            .send({
                input: {
                    userId: userProfile.id,
                    assertionResponse: mockAssertionResponse
                }
            });

        expect(verifyResponse.status).toBe(200);
        expect(verifyResponse.body.result.data.successful).toBe(true);

        const webauthnRecord = await db.collections.webauthn_collection.findOne({ userId: userProfile.id });
        expect(webauthnRecord).toBeDefined();
        expect(webauthnRecord?.devices).toHaveLength(1);
        expect(webauthnRecord?.devices[0].counter).toBeGreaterThan(0);
    });

    // Test: Update WebAuthn device name
    test('Update WebAuthn device name', async () => {
        const newDeviceName = 'My New Device';
        const mockDeviceId = uuid();
        await db.collections.webauthn_collection.updateOne(
            { userId: userProfile.id },
            {
                $push: {
                    devices: {
                        id: mockDeviceId,
                        credentialID: 'mock_credential_id',
                        credentialPublicKey: new Uint8Array(),
                        counter: 0
                    }
                }
            }
        );

        const response = await user.post('/trpc/webauthn.updateWebauthnDeviceName')
            .send({
                input: {
                    deviceId: mockDeviceId,
                    name: newDeviceName
                }
            });

        expect(response.status).toBe(200);
        expect(response.body.result.data).toBeDefined();

        const webauthnRecord = await db.collections.webauthn_collection.findOne({ userId: userProfile.id });
        expect(webauthnRecord).toBeDefined();
        expect(webauthnRecord?.devices[0].name).toBe(newDeviceName);
    });

    // Test: Delete WebAuthn registered device
    test('Delete WebAuthn registered device', async () => {
        const mockDeviceId = uuid();
        await db.collections.webauthn_collection.updateOne(
            { userId: userProfile.id },
            {
                $push: {
                    devices: {
                        id: mockDeviceId,
                        credentialID: 'mock_credential_id',
                        credentialPublicKey: new Uint8Array(),
                        counter: 0
                    }
                }
            }
        );

        const response = await user.post('/trpc/webauthn.deleteWebauthnRegisteredDevices')
            .send({ input: { deviceId: mockDeviceId } });

        expect(response.status).toBe(200);
        expect(response.body.result.data).toBeDefined();

        const webauthnRecord = await db.collections.webauthn_collection.findOne({ userId: userProfile.id });
        expect(webauthnRecord).toBeDefined();
        expect(webauthnRecord?.devices).toHaveLength(0);
    });

    // Test: WebAuthn login
    test('WebAuthn login', async () => {
        const response = await user.post('/trpc/webauthn.webauthnLogin')
            .send({
                input: {
                    userId: userProfile.id,
                    requestExpiryDate: false
                }
            });

        expect(response.status).toBe(200);
        expect(response.body.result.data).toBeDefined();
    });
});
