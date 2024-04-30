// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import 'nodemailer';
import request, { SuperAgentTest } from 'supertest';
import { print } from 'graphql';
import { connectAdmin, connectUser, connectAgent } from './_loginHelper';
import { db } from '../../src/database/database';
import { makeAESIv, makeAESKeySalt, encryptEmail } from '../../src/encryption/aes';
import { v4 as uuid } from 'uuid';
import { Router } from '../../src/server/router';
import { errorCodes } from '../../src/graphql/errors';
import { MongoClient, Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setupDatabase } from '@itmat-broker/itmat-setup';
import config from '../../config/config.sample.json';
import * as mfa from '../../src/utils/mfa';
import {
    WHO_AM_I,
    GET_USERS,
    CREATE_USER,
    EDIT_USER,
    DELETE_USER,
    REQUEST_USERNAME_OR_RESET_PASSWORD,
    RESET_PASSWORD,
    LOGIN
} from '@itmat-broker/itmat-models';
import { IResetPasswordRequest, IUser, enumUserTypes } from '@itmat-broker/itmat-types';
import type { Express } from 'express';
import { seedUsers } from 'packages/itmat-setup/src/databaseSetup/seed/users';

let app: Express;
let mongodb: MongoMemoryServer;
let admin: SuperAgentTest;
let user: SuperAgentTest;
let mongoConnection: MongoClient;
let mongoClient: Db;

const SEED_STANDARD_USER_USERNAME = 'standardUser';
const SEED_STANDARD_USER_EMAIL = 'standard@example.com';
const { TEST_SMTP_CRED, TEST_SMTP_USERNAME, TEST_RECEIVER_EMAIL_ADDR } = process.env;
const TEMP_USER_TEST_EMAIL = TEST_RECEIVER_EMAIL_ADDR || SEED_STANDARD_USER_EMAIL;

jest.mock('nodemailer', () => {
    const { TEST_SMTP_CRED, TEST_SMTP_USERNAME } = process.env;
    if (!TEST_SMTP_CRED || !TEST_SMTP_USERNAME || !config?.nodemailer?.auth?.pass || !config?.nodemailer?.auth?.user)
        return {
            createTransport: jest.fn().mockImplementation(() => ({
                sendMail: jest.fn()
            }))
        };
    return jest.requireActual('nodemailer');
});

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
    config.database.mongo_url = connectionString;
    config.database.database = dbName;
    await db.connect(config.database, MongoClient);
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

    /* Mock emailing interface */
    if (config.nodemailer.auth === undefined)
        config.nodemailer.auth = {
            auth: {}
        } as any;
    if (TEST_SMTP_CRED)
        config.nodemailer.auth.pass = TEST_SMTP_CRED;
    if (TEST_SMTP_USERNAME)
        config.nodemailer.auth.user = TEST_SMTP_USERNAME;
});

describe('USERS API', () => {
    describe('RESET PASSWORD FUNCTION', () => {
        let loggedoutUser;
        const presetToken = uuid();
        let encryptedEmailForStandardUser;


        beforeAll(async () => {
            loggedoutUser = request.agent(app);
            encryptedEmailForStandardUser =
                await encryptEmail(SEED_STANDARD_USER_EMAIL, makeAESKeySalt(presetToken), makeAESIv(presetToken));
        });

        afterEach(async () => {
            await db.collections!.users_collection.deleteMany({});
            await db.collections!.users_collection.insertMany(seedUsers);
        });

        test('Request reset password with non-existent user providing username', async () => {
            const res = await loggedoutUser
                .post('/graphql')
                .send({
                    query: print(REQUEST_USERNAME_OR_RESET_PASSWORD),
                    variables: {
                        forgotUsername: false,
                        forgotPassword: true,
                        username: 'Idontexist'
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.requestUsernameOrResetPassword).toEqual({ successful: false, code: null, id: null, description: 'User does not exist.' });
        }, 6050);

        test('Request reset password with non-existent user providing email', async () => {
            const res = await loggedoutUser
                .post('/graphql')
                .send({
                    query: print(REQUEST_USERNAME_OR_RESET_PASSWORD),
                    variables: {
                        forgotUsername: true,
                        forgotPassword: true,
                        email: 'email@email.io'
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.requestUsernameOrResetPassword).toEqual({ successful: false, code: null, id: null, description: 'User does not exist.' });
        }, 6050);

        test('Request reset password with non-existent user but provide email as well as username (should fail)', async () => {
            const res = await loggedoutUser
                .post('/graphql')
                .send({
                    query: print(REQUEST_USERNAME_OR_RESET_PASSWORD),
                    variables: {
                        forgotUsername: false,
                        forgotPassword: true,
                        username: 'fakeuser',
                        email: 'email@email.io'
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('Inputs are invalid.');
            expect(res.body.data.requestUsernameOrResetPassword).toBe(null);
        });

        test('Request reset password and username but do not provide any email nor username (should fail)', async () => {
            const res = await loggedoutUser
                .post('/graphql')
                .send({
                    query: print(REQUEST_USERNAME_OR_RESET_PASSWORD),
                    variables: {
                        forgotUsername: true,
                        forgotPassword: true
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('Inputs are invalid.');
        });

        test('Request reset password and username but provide username (should fail)', async () => {
            const res = await loggedoutUser
                .post('/graphql')
                .send({
                    query: print(REQUEST_USERNAME_OR_RESET_PASSWORD),
                    variables: {
                        forgotUsername: true,
                        forgotPassword: true,
                        username: 'Iamauser',
                        email: 'email@email.io'
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('Inputs are invalid.');
        });

        test('Request reset password with existing user providing email', async () => {
            /* setup: replacing the seed user's email with slurp test email */
            const updateResult = await db.collections!.users_collection.findOneAndUpdate({
                username: SEED_STANDARD_USER_USERNAME
            }, { $set: { email: TEMP_USER_TEST_EMAIL } });
            expect(updateResult.ok).toBe(1);

            /* test */
            const res = await loggedoutUser
                .post('/graphql')
                .send({
                    query: print(REQUEST_USERNAME_OR_RESET_PASSWORD),
                    variables: {
                        forgotUsername: true,
                        forgotPassword: true,
                        email: TEMP_USER_TEST_EMAIL
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.requestUsernameOrResetPassword).toMatchObject({ successful: true, code: null, description: 'Request of resetting password successfully sent.' });
            const modifiedUser = await db.collections!.users_collection.findOne({ username: SEED_STANDARD_USER_USERNAME });
            expect(modifiedUser).toBeDefined();
            expect(modifiedUser.resetPasswordRequests).toHaveLength(1);
            expect(typeof modifiedUser.resetPasswordRequests[0].id).toBe('string');
            expect(typeof modifiedUser.resetPasswordRequests[0].timeOfRequest).toBe('number');
            expect(modifiedUser.resetPasswordRequests[0].used).toBe(false);
            expect(new Date().valueOf() - modifiedUser.resetPasswordRequests[0].timeOfRequest).toBeLessThan(15000); // less then 5 seconds

            /* cleanup: changing the user's email back */
            const cleanupResult = await db.collections!.users_collection.findOneAndUpdate({ username: SEED_STANDARD_USER_USERNAME }, { $set: { email: SEED_STANDARD_USER_EMAIL, resetPasswordRequests: [] } }, { returnDocument: 'after' });
            expect(cleanupResult.ok).toBe(1);
            expect(cleanupResult.value.email).toBe(SEED_STANDARD_USER_EMAIL);
        }, 30000);

        test('Request reset password with existing user providing username', async () => {
            /* setup: replacing the seed user's email with test email */
            const updateResult = await db.collections!.users_collection.findOneAndUpdate({
                username: SEED_STANDARD_USER_USERNAME
            }, { $set: { email: TEMP_USER_TEST_EMAIL } });
            expect(updateResult.ok).toBe(1);

            /* test */
            const res = await loggedoutUser
                .post('/graphql')
                .send({
                    query: print(REQUEST_USERNAME_OR_RESET_PASSWORD),
                    variables: {
                        forgotUsername: false,
                        forgotPassword: true,
                        username: SEED_STANDARD_USER_USERNAME
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.requestUsernameOrResetPassword).toMatchObject({ successful: true, code: null, description: 'Request of resetting password successfully sent.' });
            const modifiedUser = await db.collections!.users_collection.findOne({ username: SEED_STANDARD_USER_USERNAME });
            expect(modifiedUser).toBeDefined();
            expect(modifiedUser.resetPasswordRequests).toHaveLength(1);
            expect(typeof modifiedUser.resetPasswordRequests[0].id).toBe('string');
            expect(typeof modifiedUser.resetPasswordRequests[0].timeOfRequest).toBe('number');
            expect(modifiedUser.resetPasswordRequests[0].used).toBe(false);
            expect(new Date().valueOf() - modifiedUser.resetPasswordRequests[0].timeOfRequest).toBeLessThan(15000); // less then 5 seconds

            /* cleanup: changing the user's email back */
            const cleanupResult = await db.collections!.users_collection.findOneAndUpdate({ username: SEED_STANDARD_USER_USERNAME }, { $set: { email: SEED_STANDARD_USER_EMAIL, resetPasswordRequests: [] } }, { returnDocument: 'after' });
            expect(cleanupResult.ok).toBe(1);
            expect(cleanupResult.value.email).toBe(SEED_STANDARD_USER_EMAIL);
        }, 30000);

        test('Reset password with password length < 8', async () => {
            const res = await loggedoutUser
                .post('/graphql')
                .send({
                    query: print(RESET_PASSWORD),
                    variables: {
                        encryptedEmail: encryptedEmailForStandardUser,
                        token: 'token',
                        newPassword: 'admin'
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('Password has to be at least 8 character long.');
            expect(res.body.data.resetPassword).toBe(null);
        });

        test('Reset password with incorrect token (should fail)', async () => {
            /* setup: add request entry to user */
            const resetPWrequest: IResetPasswordRequest = {
                id: presetToken,
                timeOfRequest: new Date().valueOf(),
                used: false
            };
            const updateResult = await db.collections!.users_collection.findOneAndUpdate(
                { username: SEED_STANDARD_USER_USERNAME },
                { $set: { resetPasswordRequests: [resetPWrequest] } }
            );
            expect(updateResult.ok).toBe(1);

            /* test */
            const res = await loggedoutUser
                .post('/graphql')
                .send({
                    query: print(RESET_PASSWORD),
                    variables: {
                        encryptedEmail: encryptedEmailForStandardUser,
                        token: 'wrongtoken_wrong_token_wrong_token',
                        newPassword: 'securepasswordrighthere'
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('Token is invalid.');
            expect(res.body.data.resetPassword).toBe(null);

            /* cleanup */
            const updateResult2 = await db.collections!.users_collection.findOneAndUpdate(
                { username: SEED_STANDARD_USER_USERNAME },
                { $set: { resetPasswordRequests: [] } }
            );
            expect(updateResult2.ok).toBe(1);
        });

        test('Reset password with incorrect token length < 16 (should fail)', async () => {
            /* NOTE: token length < 16 is a constraint needed because of the way makeAESIv() works; */
            /* NOTE: if makeAESIv() implementation changes, remove this */
            /* setup: add request entry to user */
            const resetPWrequest: IResetPasswordRequest = {
                id: presetToken,
                timeOfRequest: new Date().valueOf(),
                used: false
            };
            const updateResult = await db.collections!.users_collection.findOneAndUpdate(
                { username: SEED_STANDARD_USER_USERNAME },
                { $set: { resetPasswordRequests: [resetPWrequest] } }
            );
            expect(updateResult.ok).toBe(1);

            /* test */
            const res = await loggedoutUser
                .post('/graphql')
                .send({
                    query: print(RESET_PASSWORD),
                    variables: {
                        encryptedEmail: encryptedEmailForStandardUser,
                        token: 'shorttoken',
                        newPassword: 'securepasswordrighthere'
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('Token is invalid.');
            expect(res.body.data.resetPassword).toBe(null);

            /* cleanup */
            const updateResult2 = await db.collections!.users_collection.findOneAndUpdate(
                { username: SEED_STANDARD_USER_USERNAME },
                { $set: { resetPasswordRequests: [] } }
            );
            expect(updateResult2.ok).toBe(1);
        });

        test('Reset password with expired token (should fail)', async () => {
            /* setup: add request entry to user */
            const resetPWrequest: IResetPasswordRequest = {
                id: presetToken,
                timeOfRequest: new Date().valueOf() - 60 * 60 * 1000 /* (default expiry: 1hr) */ - 1,
                used: false
            };
            const updateResult = await db.collections!.users_collection.findOneAndUpdate(
                { username: SEED_STANDARD_USER_USERNAME },
                { $set: { resetPasswordRequests: [resetPWrequest] } }
            );
            expect(updateResult.ok).toBe(1);

            /* test */
            const res = await loggedoutUser
                .post('/graphql')
                .send({
                    query: print(RESET_PASSWORD),
                    variables: {
                        encryptedEmail: encryptedEmailForStandardUser,
                        token: presetToken,
                        newPassword: 'securepasswordrighthere'
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            expect(res.body.data.resetPassword).toBe(null);

            /* cleanup */
            const updateResult2 = await db.collections!.users_collection.findOneAndUpdate(
                { username: SEED_STANDARD_USER_USERNAME },
                { $set: { resetPasswordRequests: [] } }
            );
            expect(updateResult2.ok).toBe(1);
        });

        test('Reset password with expired token (making sure id and expiry date belong to the same token) (should fail)', async () => {
            /* test whether a existent token that is not expired will be selected even if providing a expired token id (mongo array selection is a bit weird) */
            /* setup: add request entry to user */
            const resetPWrequests: IResetPasswordRequest[] = [
                {
                    id: presetToken,
                    timeOfRequest: new Date().valueOf() - 60 * 60 * 1000 /* (default expiry: 1hr) */ - 1,
                    used: false
                },
                {
                    id: 'still_not_expired_token',
                    timeOfRequest: new Date().valueOf(),
                    used: false
                }
            ];
            const updateResult = await db.collections!.users_collection.findOneAndUpdate(
                { username: SEED_STANDARD_USER_USERNAME },
                { $set: { resetPasswordRequests: resetPWrequests } }
            );
            expect(updateResult.ok).toBe(1);

            /* test */
            const res = await loggedoutUser
                .post('/graphql')
                .send({
                    query: print(RESET_PASSWORD),
                    variables: {
                        encryptedEmail: encryptedEmailForStandardUser,
                        token: presetToken,
                        newPassword: 'securepasswordrighthere'
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            expect(res.body.data.resetPassword).toBe(null);

            /* cleanup */
            const updateResult2 = await db.collections!.users_collection.findOneAndUpdate(
                { username: SEED_STANDARD_USER_USERNAME },
                { $set: { resetPasswordRequests: [] } }
            );
            expect(updateResult2.ok).toBe(1);
        });

        test('Reset password with valid token', async () => {
            /* setup: add request entry to user */
            const resetPWrequest: IResetPasswordRequest = {
                id: presetToken,
                timeOfRequest: new Date().valueOf(),
                used: false
            };
            const updateResult = await db.collections!.users_collection.findOneAndUpdate(
                { username: SEED_STANDARD_USER_USERNAME },
                { $set: { resetPasswordRequests: [resetPWrequest] } }
            );
            expect(updateResult.ok).toBe(1);

            /* test */
            const newloggedoutuser = request.agent(app);
            const res = await newloggedoutuser
                .post('/graphql')
                .send({
                    query: print(RESET_PASSWORD),
                    variables: {
                        encryptedEmail: encryptedEmailForStandardUser,
                        token: presetToken,
                        newPassword: 'securepasswordrighthere'
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.resetPassword).toEqual({ successful: true });
            const checkedUser = await db.collections!.users_collection.findOne({ username: SEED_STANDARD_USER_USERNAME });
            await connectAgent(newloggedoutuser, SEED_STANDARD_USER_USERNAME, 'securepasswordrighthere', checkedUser.otpSecret);
            /* cleanup */
            const updateResult2 = await db.collections!.users_collection.findOneAndUpdate(
                { username: SEED_STANDARD_USER_USERNAME },
                { $set: { resetPasswordRequests: [], password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi' } }
            );
            expect(updateResult2.ok).toBe(1);
        });

        test('Reset password with used token (should fail)', async () => {
            /* setup: add request entry to user */
            const resetPWrequest: IResetPasswordRequest[] = [
                {
                    id: 'will-not-be-used-token',
                    timeOfRequest: new Date().valueOf(),
                    used: false
                },
                {
                    id: presetToken,
                    timeOfRequest: new Date().valueOf(),
                    used: false
                }
            ];
            const updateResult = await db.collections!.users_collection.findOneAndUpdate(
                { username: SEED_STANDARD_USER_USERNAME },
                { $set: { resetPasswordRequests: resetPWrequest } }
            );
            expect(updateResult.ok).toBe(1);
            const newloggedoutuser = request.agent(app);
            const res = await newloggedoutuser
                .post('/graphql')
                .send({
                    query: print(RESET_PASSWORD),
                    variables: {
                        encryptedEmail: encryptedEmailForStandardUser,
                        token: presetToken,
                        newPassword: 'securepasswordrighthere'
                    }
                });
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.resetPassword).toEqual({ successful: true });
            const checkedUser = await db.collections!.users_collection.findOne({ username: SEED_STANDARD_USER_USERNAME });
            await connectAgent(newloggedoutuser, SEED_STANDARD_USER_USERNAME, 'securepasswordrighthere', checkedUser.otpSecret);

            /* test */
            const resAgain = await newloggedoutuser
                .post('/graphql')
                .send({
                    query: print(RESET_PASSWORD),
                    variables: {
                        encryptedEmail: encryptedEmailForStandardUser,
                        token: presetToken,
                        newPassword: 'securepasswordrighthere'
                    }
                });
            expect(resAgain.status).toBe(200);
            expect(resAgain.body.errors).toHaveLength(1);
            expect(resAgain.body.errors[0].message).toBe(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            expect(resAgain.body.data.resetPassword).toEqual(null);

            /* cleanup */
            const updateResult2 = await db.collections!.users_collection.findOneAndUpdate(
                { username: SEED_STANDARD_USER_USERNAME },
                { $set: { resetPasswordRequests: [], password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi' } }
            );
            expect(updateResult2.ok).toBe(1);
        });
    });

    describe('END USERS API', () => {
        let adminId;
        let userId;

        beforeAll(async () => {
            /* setup: first retrieve the generated user id */
            const result = await mongoClient.collection<IUser>(config.database.collections.users_collection).find({}, { projection: { id: 1, username: 1 } }).toArray();
            adminId = result.filter(e => e.username === 'admin')[0].id;
            userId = result.filter(e => e.username === 'standardUser')[0].id;
        });

        test('If someone not logged in made a request', async () => {
            const client_not_logged_in = request.agent(app);
            const res = await client_not_logged_in.post('/graphql').send({ query: print(GET_USERS), variables: { fetchDetailsAdminOnly: false, fetchAccessPrivileges: false } });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe(errorCodes.NOT_LOGGED_IN);
            expect(res.body.data.getUsers).toBe(null);
        });

        test('who am I (not logged in)', async () => {
            const client_not_logged_in = request.agent(app);
            const res = await client_not_logged_in.post('/graphql').send({ query: print(WHO_AM_I) });
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.whoAmI).toBe(null);
        });

        test('Who am I (admin)', async () => {
            const res = await admin.post('/graphql').send({ query: print(WHO_AM_I) });
            expect(res.status).toBe(200);
            expect(res.body.data.whoAmI.id).toBeDefined();
            adminId = res.body.data.whoAmI.id;
            expect(res.body.data.whoAmI).toEqual({
                id: adminId,
                username: 'admin',
                email: 'admin@example.com',
                firstname: 'Fadmin',
                lastname: 'Ladmin',
                organisation: 'organisation_system',
                type: 'ADMIN',
                emailNotificationsActivated: true,
                password: null,
                otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                profile: null,
                description: 'I am an admin user.',
                expiredAt: 1991134065000,
                resetPasswordRequests: [],
                life: {
                    createdTime: 1591134065000,
                    createdUser: 'admin',
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            });
        });

        test('Who am I (user)', async () => {
            const res = await user.post('/graphql').send({ query: print(WHO_AM_I) });
            expect(res.status).toBe(200);
            expect(res.body.error).toBeUndefined();
            expect(res.body.data.whoAmI.id).toBeDefined();
            userId = res.body.data.whoAmI.id;
            expect(res.body.data.whoAmI).toEqual({
                id: userId,
                username: 'standardUser',
                email: 'standard@example.com',
                firstname: 'Tai Man',
                lastname: 'Chan',
                organisation: 'organisation_system',
                type: 'STANDARD',
                emailNotificationsActivated: true,
                password: null,
                otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                profile: null,
                description: 'I am a standard user.',
                expiredAt: 1991134065000,
                resetPasswordRequests: [],
                life: {
                    createdTime: 1591134065000,
                    createdUser: 'admin',
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            });
        });

        test('Expired standard user log in (should fail)', async () => {
            const userSecret = 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA';
            const newUser: IUser = {
                id: 'expiredId0',
                username: 'expired_user',
                email: 'expire@example.com',
                firstname: 'Fexpired user',
                lastname: 'Lexpired user',
                organisation: 'organisation_system',
                type: 'STANDARD',
                emailNotificationsActivated: false,
                password: '$2b$04$ps9ownz6PqJFD/LExsmgR.ZLk11zhtRdcpUwypWVfWJ4ZW6/Zzok2',
                otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                profile: null,
                description: 'I am an expired user.',
                expiredAt: 1501134065000,
                resetPasswordRequests: [],
                life: {
                    createdTime: 1591134065000,
                    createdUser: 'admin',
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            };
            await mongoClient.collection<IUser>(config.database.collections.users_collection).insertOne(newUser);
            const newloggedoutuser = request.agent(app);
            const otp = mfa.generateTOTP(userSecret).toString();
            const res = await newloggedoutuser.post('/graphql').set('Content-type', 'application/json').send({
                query: print(LOGIN),
                variables: {
                    username: 'expired_user',
                    password: 'admin',
                    totp: otp
                }
            });
            expect(res.status).toBe(200);
            expect(res.body.data.login).toBeNull();
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('Account Expired. Please request a new expiry date!');
            await admin.post('/graphql').send(
                {
                    query: print(DELETE_USER),
                    variables: {
                        userId: newUser.id
                    }
                }
            );
        });

        test('Expired admin user log in', async () => {
            const adminSecret = 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA';
            const newUser: IUser = {
                username: 'expired_admin',
                type: enumUserTypes.ADMIN,
                firstname: 'Fexpired admin',
                lastname: 'Lexpired admin',
                password: '$2b$04$ps9ownz6PqJFD/LExsmgR.ZLk11zhtRdcpUwypWVfWJ4ZW6/Zzok2',
                otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                organisation: 'organisation_system',
                email: 'admine@example.com',
                resetPasswordRequests: [],
                description: 'I am an expired admin.',
                emailNotificationsActivated: true,
                profile: null,
                expiredAt: 1501134065000,
                resetPasswordRequests: [],
                id: 'expiredId1',
                life: {
                    createdTime: 1591134065000,
                    createdUser: 'admin',
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            };
            await mongoClient.collection<IUser>(config.database.collections.users_collection).insertOne(newUser);
            const newloggedoutuser = request.agent(app);
            const otp = mfa.generateTOTP(adminSecret).toString();
            const res = await newloggedoutuser.post('/graphql').set('Content-type', 'application/json').send({
                query: print(LOGIN),
                variables: {
                    username: 'expired_admin',
                    password: 'admin',
                    totp: otp
                }
            });
            expect(res.status).toBe(200);
            expect(res.body.data.login).toEqual({
                id: 'expiredId1',
                username: 'expired_admin',
                email: 'admine@example.com',
                firstname: 'Fexpired admin',
                lastname: 'Lexpired admin',
                organisation: 'organisation_system',
                type: 'ADMIN',
                emailNotificationsActivated: true,
                password: null,
                otpSecret: null,
                profile: null,
                description: 'I am an expired admin.',
                expiredAt: 1501134065000,
                resetPasswordRequests: [],
                life: {
                    createdTime: 1591134065000,
                    createdUser: 'admin',
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}

            });
            expect(res.body.errors).toBeUndefined();
            await admin.post('/graphql').send(
                {
                    query: print(DELETE_USER),
                    variables: {
                        userId: newUser.id
                    }
                }
            );
        });
    });

    describe('APP USERS QUERY API', () => {
        let adminId;
        let userId;

        beforeAll(async () => {
            /* setup: first retrieve the generated user id */
            const result = await mongoClient.collection<IUser>(config.database.collections.users_collection).find({}, { projection: { id: 1, username: 1 } }).toArray();
            adminId = result.filter(e => e.username === 'admin')[0].id;
            userId = result.filter(e => e.username === 'standardUser')[0].id;
        });

        test('Get all users list with detail (no access info) (admin)', async () => {
            const res = await admin.post('/graphql').send({ query: print(GET_USERS), variables: { fetchDetailsAdminOnly: true, fetchAccessPrivileges: false } });
            expect(res.status).toBe(200);
            expect(res.body.data.getUsers).toEqual([
                {
                    id: adminId,
                    username: 'admin',
                    email: 'admin@example.com',
                    firstname: 'Fadmin',
                    lastname: 'Ladmin',
                    organisation: 'organisation_system',
                    type: 'ADMIN',
                    emailNotificationsActivated: true,
                    password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                    otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                    profile: null,
                    description: 'I am an admin user.',
                    expiredAt: 1991134065000,
                    resetPasswordRequests: [],
                    life: {
                        createdTime: 1591134065000,
                        createdUser: 'admin',
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {}
                },
                {
                    id: userId,
                    username: 'standardUser',
                    email: 'standard@example.com',
                    firstname: 'Tai Man',
                    lastname: 'Chan',
                    organisation: 'organisation_system',
                    type: 'STANDARD',
                    emailNotificationsActivated: true,
                    password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                    otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                    profile: null,
                    description: 'I am a standard user.',
                    expiredAt: 1991134065000,
                    resetPasswordRequests: [],
                    life: {
                        createdTime: 1591134065000,
                        createdUser: 'admin',
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {}
                }
            ]);
        });

        test('Get all users list with detail (w/ access info) (admin)', async () => {
            const res = await admin.post('/graphql').send({ query: print(GET_USERS), variables: { fetchDetailsAdminOnly: true, fetchAccessPrivileges: true } });
            expect(res.status).toBe(200);
            expect(res.body.data.getUsers).toEqual([
                {
                    id: adminId,
                    username: 'admin',
                    email: 'admin@example.com',
                    firstname: 'Fadmin',
                    lastname: 'Ladmin',
                    organisation: 'organisation_system',
                    type: 'ADMIN',
                    emailNotificationsActivated: true,
                    password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                    otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                    profile: null,
                    description: 'I am an admin user.',
                    expiredAt: 1991134065000,
                    resetPasswordRequests: [],
                    life: {
                        createdTime: 1591134065000,
                        createdUser: 'admin',
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {}
                },
                {
                    id: userId,
                    username: 'standardUser',
                    email: 'standard@example.com',
                    firstname: 'Tai Man',
                    lastname: 'Chan',
                    organisation: 'organisation_system',
                    type: 'STANDARD',
                    emailNotificationsActivated: true,
                    password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                    otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                    profile: null,
                    description: 'I am a standard user.',
                    expiredAt: 1991134065000,
                    resetPasswordRequests: [],
                    life: {
                        createdTime: 1591134065000,
                        createdUser: 'admin',
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {}
                }
            ]);
        });

        test('Get a specific user with details (admin)', async () => {
            const res = await admin.post('/graphql').send({ query: print(GET_USERS), variables: { userId, fetchDetailsAdminOnly: true, fetchAccessPrivileges: true } });
            expect(res.status).toBe(200);
            expect(res.body.data.getUsers instanceof Array).toBe(true);
            expect(res.body.data.getUsers).toEqual([
                {
                    username: 'standardUser',
                    type: 'STANDARD',
                    firstname: 'Tai Man',
                    lastname: 'Chan',
                    password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                    otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                    organisation: 'organisation_system',
                    email: 'standard@example.com',
                    resetPasswordRequests: [],
                    description: 'I am a standard user.',
                    emailNotificationsActivated: true,
                    profile: null,
                    expiredAt: 1991134065000,
                    resetPasswordRequests: [],
                    id: userId,
                    life: {
                        createdTime: 1591134065000,
                        createdUser: 'admin',
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {}
                }
            ]);
        });

        test('Get a specific self user with details (user)', async () => {
            const res = await user.post('/graphql').send({ query: print(GET_USERS), variables: { userId, fetchDetailsAdminOnly: true, fetchAccessPrivileges: true } });
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.getUsers).toEqual([
                {
                    username: 'standardUser',
                    type: 'STANDARD',
                    firstname: 'Tai Man',
                    lastname: 'Chan',
                    password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                    otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                    organisation: 'organisation_system',
                    email: 'standard@example.com',
                    resetPasswordRequests: [],
                    description: 'I am a standard user.',
                    emailNotificationsActivated: true,
                    profile: null,
                    expiredAt: 1991134065000,
                    resetPasswordRequests: [],
                    id: userId,
                    life: {
                        createdTime: 1591134065000,
                        createdUser: 'admin',
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {}
                }
            ]);
        });

        test('Get a specific self user without details (w/ access info) (user)', async () => {
            const res = await user.post('/graphql').send({ query: print(GET_USERS), variables: { userId, fetchDetailsAdminOnly: false, fetchAccessPrivileges: true } });
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.getUsers).toEqual([
                {
                    username: 'standardUser',
                    type: 'STANDARD',
                    firstname: 'Tai Man',
                    lastname: 'Chan',
                    password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                    otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                    organisation: 'organisation_system',
                    email: 'standard@example.com',
                    resetPasswordRequests: [],
                    description: 'I am a standard user.',
                    emailNotificationsActivated: true,
                    profile: null,
                    expiredAt: 1991134065000,
                    resetPasswordRequests: [],
                    id: userId,
                    life: {
                        createdTime: 1591134065000,
                        createdUser: 'admin',
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {}
                }
            ]);
        });
    });

    describe('APP USER MUTATION API', () => {

        beforeAll(async () => {
            await db.collections!.organisations_collection.insertOne({
                id: 'DSI-ICL',
                name: 'DSI',
                shortname: null,
                location: null,
                profile: null
            });
        });

        beforeEach(async () => {
            await db.collections!.users_collection.deleteMany({});
            await db.collections!.users_collection.insertMany(seedUsers);
        });

        test('log in with incorrect totp (user)', async () => {
            await admin.post('/graphql').send({
                query: print(CREATE_USER),
                variables: {
                    username: 'testuser0',
                    password: 'testpassword0',
                    firstname: 'FUser Testing',
                    lastname: 'LUser Testing',
                    description: 'I am fake!',
                    organisation: 'DSI-ICL',
                    emailNotificationsActivated: false,
                    email: 'user0email@email.io',
                    type: enumUserTypes.STANDARD
                }
            });
            /* getting the created user from mongo */
            const createdUser = await db.collections!.users_collection.findOne({ username: 'testuser0' });
            const incorrectTotp = mfa.generateTOTP(createdUser.otpSecret) + 1;
            const res_login = await admin.post('/graphql')
                .set('Content-type', 'application/json')
                .send({
                    query: print(LOGIN),
                    variables: { username: 'testuser0', password: 'testpassword0', totp: incorrectTotp.toString() }
                });

            expect(res_login.status).toBe(200);
            expect(res_login.body.errors).toHaveLength(1);
            expect(res_login.body.errors[0].message).toBe('Incorrect One-Time password.');
        }, 30000);

        test('create user', async () => {
            const res = await admin.post('/graphql').send({
                query: print(CREATE_USER),
                variables: {
                    username: 'testuser1',
                    password: 'testpassword',
                    firstname: 'FUser Testing',
                    lastname: 'LUser Testing',
                    description: 'I am fake!',
                    organisation: 'DSI-ICL',
                    emailNotificationsActivated: false,
                    email: 'fake@email.io',
                    type: enumUserTypes.STANDARD
                }
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.createUser).toStrictEqual(
                {
                    successful: true
                }
            );
        }, 30000);

        test('create user with wrong email format', async () => {
            const res = await admin.post('/graphql').send({
                query: print(CREATE_USER),
                variables: {
                    username: 'testuser2',
                    password: 'testpassword',
                    firstname: 'FUser Testing2',
                    lastname: 'LUser Testing2',
                    description: 'I am fake!',
                    organisation: 'DSI-ICL',
                    emailNotificationsActivated: false,
                    email: 'fak@e@semail.io',
                    type: enumUserTypes.STANDARD
                }
            });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('Email is not the right format.');
            expect(res.body.data.createUser).toBe(null);
        });

        test('create user with space in password and username', async () => {
            const res = await admin.post('/graphql').send({
                query: print(CREATE_USER),
                variables: {
                    username: 'test user1',
                    password: 'test password',
                    firstname: 'FUser Testing',
                    lastname: 'LUser Testing',
                    description: 'I am fake!',
                    organisation: 'DSI-ICL',
                    emailNotificationsActivated: false,
                    email: 'fake@email.io',
                    type: enumUserTypes.STANDARD
                }
            });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('Username or password cannot have spaces.');
            expect(res.body.data.createUser).toBe(null);
        });

        test('create user that already exists', async () => {
            /* assertions */
            const res = await admin.post('/graphql').send({
                query: print(CREATE_USER),
                variables: {
                    username: seedUsers[1].username,
                    password: 'testpassword',
                    firstname: 'FUser Testing',
                    lastname: 'LUser Testing',
                    description: 'I am fake!',
                    organisation: 'DSI-ICL',
                    emailNotificationsActivated: false,
                    email: 'fake@email.io',
                    type: enumUserTypes.STANDARD
                }
            });
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('Username or email already exists.');
            expect(res.body.data.createUser).toBe(null);
        });

        test('edit user password (admin) (should fail)', async () => {
            /* assertion */
            const res = await admin.post('/graphql').send(
                {
                    query: print(EDIT_USER),
                    variables: {

                        id: 'fakeid2',
                        password: 'ishouldfail'

                    }
                }
            );
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
            expect(res.body.data.editUser).toEqual(null);

        });


        test('edit user without password (admin)', async () => {
            /* assertion */
            const res = await admin.post('/graphql').send(
                {
                    query: print(EDIT_USER),
                    variables: {
                        id: seedUsers[1].id,
                        username: 'fakeusername',
                        type: enumUserTypes.STANDARD,
                        firstname: 'FMan',
                        lastname: 'LMan',
                        email: 'hey@uk.io',
                        description: 'DSI director',
                        organisation: 'DSI-ICL'
                    }
                }
            );
            expect(res.status).toBe(200);
            expect(res.body.data.editUser).toEqual(
                {
                    username: 'fakeusername',
                    type: 'STANDARD',
                    firstname: 'Tai Man',
                    lastname: 'Chan',
                    password: '$2b$04$j0aSK.Dyq7Q9N.r6d0uIaOGrOe7sI4rGUn0JNcaXcPCv.49Otjwpi',
                    otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                    organisation: 'organisation_system',
                    email: 'hey@uk.io',
                    resetPasswordRequests: [],
                    description: 'I am a standard user.',
                    emailNotificationsActivated: true,
                    profile: null,
                    expiredAt: 1991134065000,
                    id: seedUsers[1].id,
                    life: {
                        createdTime: 1591134065000,
                        createdUser: 'admin',
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {}
                }
            );
        });

        test('edit own password with length < 8 (user) (should fail)', async () => {
            /* assertion */
            const res = await user.post('/graphql').send(
                {
                    query: print(EDIT_USER),
                    variables: {
                        id: seedUsers[1].id,
                        password: 'admin',
                        email: 'new_email@ic.ac.uk'
                    }
                }
            );
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('Password has to be at least 8 character long.');
            expect(res.body.data.editUser).toEqual(null);
        });

        test('edit own password (user)', async () => {
            const res = await user.post('/graphql').send(
                {
                    query: print(EDIT_USER),
                    variables: {
                        id: seedUsers[1].id,
                        password: 'securepasswordhere',
                        email: 'new_email@ic.ac.uk'
                    }
                }
            );
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.editUser).toMatchObject({
                username: 'standardUser',
                type: 'STANDARD',
                firstname: 'Tai Man',
                lastname: 'Chan',
                otpSecret: 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA',
                organisation: 'organisation_system',
                email: 'new_email@ic.ac.uk',
                resetPasswordRequests: [],
                description: 'I am a standard user.',
                emailNotificationsActivated: true,
                profile: null,
                expiredAt: 1991134065000,
                id: seedUsers[1].id,
                life: {
                    createdTime: 1591134065000,
                    createdUser: 'admin',
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            });
            const modifieduser = await db.collections!.users_collection.findOne({ username: 'standardUser' });
            expect(modifieduser.password).toBe(res.body.data.editUser.password);
            expect(modifieduser.password).toHaveLength(60);
        });

        test('edit own non-password fields (user) (should fail)', async () => {
            const res = await user.post('/graphql').send(
                {
                    query: print(EDIT_USER),
                    variables: {
                        id: seedUsers[1].id,
                        username: 'new_username',
                        type: 'ADMIN',
                        firstname: 'FMing Man Chon',
                        lastname: 'LMing Man Chon',
                        description: 'I am a new user 5.'
                    }
                }
            );
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('User not updated: Non-admin users are only authorised to change their password, email or email notification.');
            expect(res.body.data.editUser).toEqual(null);
        });

        test('edit own email with malformed email (user) (should fail)', async () => {
            const res = await user.post('/graphql').send(
                {
                    query: print(EDIT_USER),
                    variables: {
                        id: seedUsers[1].id,
                        email: 'new_@email@ic.ac.uk'
                    }
                }
            );
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('User not updated: Email is not the right format.');
            expect(res.body.data.editUser).toBe(null);
        });

        test('edit other user (user)', async () => {
            const res = await user.post('/graphql').send(
                {
                    query: print(EDIT_USER),
                    variables: {
                        id: 'fakeid7',
                        password: 'email'
                    }
                }
            );
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
            expect(res.body.data.editUser).toEqual(null);
        });

        test('delete user (admin)', async () => {
            const res = await admin.post('/graphql').send(
                {
                    query: print(DELETE_USER),
                    variables: {
                        userId: seedUsers[1].id
                    }
                }
            );
            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.deleteUser).toEqual({
                code: null,
                description: `User ${seedUsers[1].id} has been deleted.`,
                id: seedUsers[1].id,
                successful: true

            });

            const getUserResAfter = await admin.post('/graphql').send({
                query: print(GET_USERS),
                variables: { userId: seedUsers[1].id, fetchDetailsAdminOnly: false, fetchAccessPrivileges: false }
            });

            expect(getUserResAfter.body.errors).toHaveLength(1);
            expect(getUserResAfter.body.errors[0].message).toBe('User does not exist.');
        });

        test('delete user that has been deleted (admin)', async () => {
            await db.collections!.users_collection.updateOne({ id: seedUsers[1].id }, {
                $set: {
                    'life.deletedTime': Date.now()
                }
            });
            const res = await admin.post('/graphql').send(
                {
                    query: print(DELETE_USER),
                    variables: {
                        userId: seedUsers[1].id
                    }
                }
            );
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('User does not exist.');
        });

        test('delete user that has never existed (admin)', async () => {
            const res = await admin.post('/graphql').send(
                {
                    query: print(DELETE_USER),
                    variables: {
                        userId: 'I never existed'
                    }
                }
            );
            expect(res.status).toBe(200);
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe('User does not exist.');
        });

        test('delete user (user should fail)', async () => {
            const new_user = { ...(seedUsers[1]) };
            delete new_user._id;

            await db.collections!.users_collection.insertOne({
                ...new_user,
                id: 'new_user',
                username: 'new_user',
                email: 'new_user@email.com'
            });
            const res = await user.post('/graphql').send(
                {
                    query: print(DELETE_USER),
                    variables: {
                        userId: 'new_user'
                    }
                }
            );
            expect(res.status).toBe(200);
            expect(res.body.errors).toHaveLength(1);
            expect(res.body.errors[0].message).toBe(errorCodes.NO_PERMISSION_ERROR);
            const getUserResAfter = await user.post('/graphql').send({
                query: print(GET_USERS),
                variables: { userId: 'new_user', fetchDetailsAdminOnly: false, fetchAccessPrivileges: false }
            });
            expect(getUserResAfter.body.data.getUsers[0]).toMatchObject({
                id: 'new_user'
            });
        });
    });
});
