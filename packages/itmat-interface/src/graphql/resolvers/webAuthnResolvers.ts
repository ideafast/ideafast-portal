import { ApolloServerErrorCode } from '@apollo/server/errors';
import { GraphQLError } from 'graphql';
import { mailer } from '../../emailer/emailer';
import { userTypes } from '@itmat-broker/itmat-types';
import { userCore } from '../core/userCore';
import config from '../../utils/configManager';
import { Logger } from '@itmat-broker/itmat-commons';
import { makeGenericReponse, IGenericResponse } from '../responses';
import type {
    AuthenticationResponseJSON,
    RegistrationResponseJSON,
    PublicKeyCredentialRequestOptionsJSON,
    AuthenticatorDevice
} from '@simplewebauthn/typescript-types';
import { errorCodes } from '../errors';


import { db } from '../../database/database';
import { IUser, IWebAuthn } from '@itmat-broker/itmat-types';
import { isoBase64URL} from '@simplewebauthn/server/helpers';

function formatEmailRequestExpiryDatetoAdmin({ username, userEmail }: { username: string, userEmail: string }) {
    return ({
        from: `${config.appName} <${config.nodemailer.auth.user}>`,
        to: `${config.adminEmail}`,
        subject: `[${config.appName}] New expiry date has been requested from ${username} account!`,
        html: `
            <p>
                Dear ADMINs,
            <p>
            <p>
                A expiry date request from the <b>${username}</b> account (whose email address is <b>${userEmail}</b>) has been submitted.
                Please approve or deny the request ASAP.
            </p>
            <br/>
            <p>
                The ${config.appName} Team.
            </p>
        `
    });
}


function formatEmailRequestExpiryDatetoClient({ username, to }: { username: string, to: string }) {
    return ({
        from: `${config.appName} <${config.nodemailer.auth.user}>`,
        to,
        subject: `[${config.appName}] New expiry date has been requested!`,
        html: `
            <p>
                Dear user,
            <p>
            <p>
                New expiry date for your <b>${username}</b> account has been requested.
                You will get a notification email once the request is approved.                
            </p>
            <br/>
            <p>
                The ${config.appName} Team.
            </p>
        `
    });
}

export const webAuthnResolvers = {
    AuthenticatorDevice: {
        credentialPublicKey: (device: AuthenticatorDevice): string | null => {
            if (device.credentialPublicKey) {
                return isoBase64URL.fromBuffer(device.credentialPublicKey.buffer as Uint8Array);
            }
            return null;
        },

        credentialID: (device: AuthenticatorDevice): string | null => {
            if (device.credentialID) {
                return isoBase64URL.fromBuffer(device.credentialID.buffer as Uint8Array);
            }
            return null;
        }
    },
    Query:{
        getWebauthn: async (__unused__parent: Record<string, unknown>, args: any) => {
            //  get the webauthn based on the webauthn ids
            const { webauthn_ids } = args;

            if (webauthn_ids.length === 0) {
                return []; // Return an empty array if no webauthn_ids are provided
            }

            const queryObj = { deleted: null, id: { $in: webauthn_ids } };
            const cursor = db.collections!.webauthn_collection.find<IWebAuthn>(queryObj, { projection: { _id: 0 } });
            return cursor.toArray();
        },

        getWebauthnRegisteredDevices: async (__unused__parent: Record<string, unknown>, args:any, context: any) => {
            const user:IUser = context.req.user;
            try {
                return await userCore.getWebauthnDevices(user);
            } catch (error) {
                throw new GraphQLError('Error fetching or creating WebAuthn data', {
                    extensions: { code: errorCodes.DATABASE_ERROR }
                });
            }
        }
    },
    Mutation: {
        webauthnRegister: async (parent: Record<string, unknown>, args: any, context: any) => {

            if (!context.req.user)
                throw new GraphQLError('User is not logged in', {
                    extensions: { code: errorCodes.DATABASE_ERROR }
                });
            return await userCore.getWebauthnRegistrationOptions(context.req.user);

        },

        webauthnRegisterVerify: async (parent: Record<string, unknown>, args: any , context: any): Promise<IGenericResponse> => {
            // const user: IUser = context.req.user;
            const user: IUser = context.req.user;
            const attestationResponse: RegistrationResponseJSON = args.attestationResponse;
            const { webauthnId, verified } = await userCore.handleRegistrationVerify(user, attestationResponse);
            return makeGenericReponse(webauthnId, verified);
        },

        webauthnAuthenticate: async (parent: Record<string, unknown>, args: any): Promise<PublicKeyCredentialRequestOptionsJSON> => {
            const user: IUser | null =  await db.collections!.users_collection.findOne({ deleted: null, id: args.userId });
            if (!user)
                throw new GraphQLError('User is not found', {
                    extensions: { code: errorCodes.DATABASE_ERROR }
                });

            const webAuthnResultOption: PublicKeyCredentialRequestOptionsJSON = await userCore.getWebauthnAuthenticationOptions(user);

            return webAuthnResultOption;

        },

        webauthnAuthenticateVerify: async (parent: Record<string, unknown>, args: any): Promise<IGenericResponse> => {
            // const user: IUser = context.req.user;
            const user: IUser | null =  await db.collections!.users_collection.findOne({ deleted: null, id: args.userId });
            if (!user)
                throw new GraphQLError('User is not found', {
                    extensions: { code: errorCodes.DATABASE_ERROR }
                });

            const assertionResponse: AuthenticationResponseJSON = args.assertionResponse;

            const verify = await userCore.handleAuthenticationVerify(user, assertionResponse);
            return makeGenericReponse(undefined, verify);
        },

        webauthnLogin: async (parent: Record<string, unknown>, args: any, context: any): Promise<Record<string, unknown>> => {
            const { req }: { req: Express.Request } = context;
            const userId = args.userId;

            const result = await db.collections!.users_collection.findOne({ deleted: null, id: userId });
            if (!result) {
                throw new GraphQLError('User does not exist.', { extensions: { code: ApolloServerErrorCode.BAD_USER_INPUT } });
            }

            if (result.expiredAt < Date.now() && result.type === userTypes.STANDARD) {
                if (args.requestexpirydate) {
                    await mailer.sendMail(formatEmailRequestExpiryDatetoAdmin({
                        userEmail: result.email,
                        username: result.username
                    }));

                    await mailer.sendMail(formatEmailRequestExpiryDatetoClient({
                        to: result.email,
                        username: result.username
                    }));
                    throw new GraphQLError('New expiry date has been requested! Wait for ADMIN to approve.', { extensions: { code: ApolloServerErrorCode.BAD_USER_INPUT } });
                }

                throw new GraphQLError('Account Expired. Please request a new expiry date!', { extensions: { code: ApolloServerErrorCode.BAD_USER_INPUT } });
            }

            const filteredResult: Partial<IUser> = { ...result };
            delete filteredResult.password;
            delete filteredResult.deleted;

            return new Promise((resolve) => {
                req.login(filteredResult, (err: any) => {
                    if (err) {
                        Logger.error(err);
                        throw new GraphQLError('Cannot log in. Please try again later.');
                    }
                    resolve(filteredResult);
                });
            });

        },
        deleteWebauthnRegisteredDevices: async (parent: Record<string, unknown>, args: any, context: any) => {
            const user:IUser = context.req.user;
            const device_id = args.deviceId;

            try {
                return await userCore.deleteWebauthnDevices(user, device_id);
            } catch (error) {
                throw new GraphQLError('Error deleting WebAuthn device', {
                    extensions: { code: errorCodes.DATABASE_ERROR }
                });
            }

        }

    }
};