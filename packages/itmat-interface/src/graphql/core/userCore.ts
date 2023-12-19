import bcrypt from 'bcrypt';
import { db } from '../../database/database';
import config from '../../utils/configManager';
import { GraphQLError } from 'graphql';
import { IUser, IUserWithoutToken, userTypes, IOrganisation, IPubkey, AuthenticatorDevice } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../errors';
import { MarkOptional } from 'ts-essentials';
import {generateSecret} from '../../utils/mfa';
import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse

} from '@simplewebauthn/server';
import type {
    // AuthenticatorDevice,
    RegistrationResponseJSON,
    PublicKeyCredentialRequestOptionsJSON,
    AuthenticationResponseJSON
    // WebAuthnCredentialsInput,
} from '@simplewebauthn/typescript-types';

import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers';

const rpName = 'DMP';
const origin = process.env['NX_WEBAUTHN_ORIGIN'] ?? 'http://localhost:4200';
const rpID = new URL(origin).hostname;


export class UserCore {
    public async getOneUser_throwErrorIfNotExists(username: string): Promise<IUser> {
        const user = await db.collections!.users_collection.findOne({ deleted: null, username });
        if (user === undefined || user === null) {
            throw new GraphQLError('User does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }
        return user;
    }

    public async createUser(user: { password: string, otpSecret: string, username: string, organisation: string, type: userTypes, description: string, firstname: string, lastname: string, email: string, emailNotificationsActivated: boolean, metadata: any }): Promise<IUserWithoutToken> {
        const { password, otpSecret, organisation, username, type, description, firstname, lastname, email, emailNotificationsActivated, metadata } = user;
        const hashedPassword: string = await bcrypt.hash(password, config.bcrypt.saltround);
        const createdAt = Date.now();
        const expiredAt = Date.now() + 86400 * 1000 /* millisec per day */ * 90;
        const entry: IUser = {
            id: uuid(),
            username,
            otpSecret,
            type,
            description,
            organisation,
            firstname,
            lastname,
            password: hashedPassword,
            email,
            emailNotificationsActivated,
            emailNotificationsStatus: { expiringNotification: false },
            createdAt,
            expiredAt,
            resetPasswordRequests: [],
            metadata,
            deleted: null
        };

        const result = await db.collections!.users_collection.insertOne(entry);
        if (result.acknowledged) {
            const cleared: MarkOptional<IUser, 'password' | 'otpSecret'> = { ...entry };
            delete cleared['password'];
            delete cleared['otpSecret'];
            return cleared;
        } else {
            throw new GraphQLError('Database error', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async deleteUser(userId: string): Promise<void> {
        const session = db.client!.startSession();
        session.startTransaction();
        try {
            /* delete the user */
            await db.collections!.users_collection.findOneAndUpdate({ id: userId, deleted: null }, { $set: { deleted: new Date().valueOf(), password: 'DeletedUserDummyPassword' } }, { returnDocument: 'after', projection: { deleted: 1 } });

            /* delete all user records in roles related to the study */
            await db.collections!.roles_collection.updateMany(
                {
                    deleted: null,
                    users: userId
                },
                {
                    $pull: { users: { _id: userId } }
                }
            );

            await session.commitTransaction();
            session.endSession();
        } catch (error) {
            // If an error occurred, abort the whole transaction and
            // undo any changes that might have happened
            await session.abortTransaction();
            session.endSession();
            throw new GraphQLError(`Database error: ${JSON.stringify(error)}`);
        }
    }

    public async createOrganisation(org: { name: string, shortname: string | null, containOrg: string | null, metadata: any }): Promise<IOrganisation> {
        const { name, shortname, containOrg, metadata } = org;
        const entry: IOrganisation = {
            id: uuid(),
            name,
            shortname,
            containOrg,
            deleted: null,
            metadata: metadata?.siteIDMarker ? {
                siteIDMarker: metadata.siteIDMarker
            } : {}
        };
        const result = await db.collections!.organisations_collection.findOneAndUpdate({ name: name, deleted: null }, {
            $set: entry
        }, {
            upsert: true
        });
        if (result.ok) {
            return entry;
        } else {
            throw new GraphQLError('Database error', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async registerPubkey(pubkeyobj: { pubkey: string, associatedUserId: string | null, jwtPubkey: string, jwtSeckey: string }): Promise<IPubkey> {
        const { pubkey, associatedUserId, jwtPubkey, jwtSeckey } = pubkeyobj;
        const entry: IPubkey = {
            id: uuid(),
            pubkey,
            associatedUserId,
            jwtPubkey,
            jwtSeckey,
            refreshCounter: 0,
            deleted: null
        };

        const result = await db.collections!.pubkeys_collection.insertOne(entry);
        if (result.acknowledged) {
            return entry;
        } else {
            throw new GraphQLError('Database error', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }
    private generate_challenge(): Uint8Array {

        const randomStringFromServer = generateSecret(20);
        const challenge: Uint8Array = new TextEncoder().encode(randomStringFromServer);
        return challenge;
    }

    public async getWebauthnDevices(user: IUser) {

        const webauthnCursor = await db.collections!.webauthn_collection.findOne({userId: user.id}, { projection: { _id: 0 } });

        return await webauthnCursor?.devices ?? [];
    }

    public async deleteWebauthnDevices(user: IUser, device_id: string) {
        const webAuthnData = await db.collections!.webauthn_collection.findOne({ userId: user.id });
        if (webAuthnData){
            const deviceIndex = webAuthnData.devices.findIndex(device => device.id === device_id);
            if (deviceIndex === -1) {
                throw new Error('Device not found for deletion');
            }
            webAuthnData.devices.splice(deviceIndex, 1);
            await db.collections!.webauthn_collection.updateOne({ userId: user.id }, { $set: { devices: webAuthnData.devices } });
        }

        return webAuthnData?.devices ?? [];
    }

    public async getWebauthnRegistrationOptions(user: IUser) {

        const challenge = this.generate_challenge();
        const webauthnStore = await db.collections?.webauthn_collection.findOne({
            userId: user.id
        });

        if (webauthnStore) {
            await db.collections?.webauthn_collection.updateOne({
                userId: user.id
            }, {
                $set: {
                    challenge,
                    challengeTimestamp: Date.now()
                }
            });
        } else {
            await db.collections?.webauthn_collection.insertOne({
                id: uuid(),
                userId: user.id,
                username: user.username,
                devices: [],
                challenge,
                challengeTimestamp: Date.now()
            });
        }

        const devices = webauthnStore?.devices ?? [];
        const options = await generateRegistrationOptions({
            rpName: rpName,
            rpID: rpID,
            userID: user.id,
            userName: user.username,
            timeout: 60000,
            attestationType: 'none',
            excludeCredentials: devices.map((authenticator:AuthenticatorDevice) => ({
                id: authenticator.credentialID.buffer as Uint8Array,
                type: 'public-key',
                transports: authenticator.transports
            })),
            challenge: challenge.buffer as Uint8Array,
            authenticatorSelection: {
                residentKey: 'discouraged'
            },
            supportedAlgorithmIDs: [-7, -257]

        });
        return options;
    }

    public async handleRegistrationVerify(user: IUser, attestationResponse: RegistrationResponseJSON) {

        console.log('webauthn verify backend');
        const webauthn = await db.collections?.webauthn_collection.findOne({
            userId: user.id
        });

        if (!webauthn)
            throw new GraphQLError('Webauthn not initialised', {
                extensions: { code: errorCodes.DATABASE_ERROR }
            });

        const { devices, challenge} = webauthn;

        const decodedString = isoBase64URL.fromBuffer(challenge.buffer as Uint8Array);

        try{
            const {verified, registrationInfo} = await verifyRegistrationResponse({
                response: attestationResponse,
                expectedChallenge: decodedString,
                expectedOrigin: origin,
                expectedRPID: rpID,
                requireUserVerification: true
            });

            if (verified && registrationInfo) {
                const { credentialPublicKey, credentialID, counter } = registrationInfo;

                const newDevice: AuthenticatorDevice = {
                    credentialPublicKey,
                    credentialID,
                    counter,
                    transports: attestationResponse.response.transports,
                    id: uuid()
                };
                devices.push(newDevice);

                const updateResult = await db.collections!.webauthn_collection.updateOne(
                    { id: webauthn.id },
                    {
                        $set: {
                            devices: devices
                        }
                    }
                );
                if (!updateResult.acknowledged) {
                    throw new GraphQLError('Failed to update devices list', {
                        extensions: { code: errorCodes.DATABASE_ERROR }
                    });
                }
                return { webauthnId: webauthn.id, verified: true };
            }
            return { webauthnId: undefined, verified: false };
        } catch (_error) {
            console.error(_error);
            return { webauthnId: undefined, verified: false };
        }
    }

    public async getWebauthnAuthenticationOptions(user:IUser): Promise<PublicKeyCredentialRequestOptionsJSON>{

        console.log('backend  webauthn authenticationOptions', user.id);

        const webauthn = await db.collections?.webauthn_collection.findOne({
            userId: user.id
        });

        if (!webauthn)
            throw new GraphQLError('Webauthn not initialised', {
                extensions: { code: errorCodes.DATABASE_ERROR }
            });

        const {devices, challenge} = webauthn;


        const options = await generateAuthenticationOptions({
            challenge: challenge.buffer as Uint8Array,
            timeout: 60000,
            allowCredentials: devices.map((authenticator) => ({
                id: authenticator.credentialID.buffer,
                type: 'public-key',
                transports: authenticator.transports
            })),
            userVerification: 'required',
            rpID
        });

        return options;
    }

    public async handleAuthenticationVerify(user:IUser, assertionResponse: AuthenticationResponseJSON): Promise<boolean> {

        console.log('backend  webauthn authentication Verify');
        const webauthn = await db.collections?.webauthn_collection.findOne({
            userId: user.id
        });

        if (!webauthn)
            throw new GraphQLError('Webauthn not initialised', {
                extensions: { code: errorCodes.DATABASE_ERROR }
            });

        const { devices, challenge} = webauthn;

        const decodedString = isoBase64URL.fromBuffer(challenge.buffer as Uint8Array);
        const bodyCredIDBuffer = isoBase64URL.toBuffer(assertionResponse.rawId);
        const deviceIndex = devices.findIndex(d =>isoUint8Array.areEqual(d.credentialID.buffer as Uint8Array, bodyCredIDBuffer));


        if (deviceIndex < 0) {
            console.log('Authenticator is not registered with this site');
            return false;
        }
        try {
            const verification = await verifyAuthenticationResponse({
                response: assertionResponse,
                expectedChallenge: decodedString,
                expectedOrigin: origin,
                expectedRPID: rpID,
                authenticator: {
                    credentialPublicKey: devices[deviceIndex].credentialPublicKey.buffer as Uint8Array,
                    credentialID: devices[deviceIndex].credentialID.buffer as Uint8Array,
                    counter: devices[deviceIndex].counter
                },
                requireUserVerification: true
            });

            const { verified } = verification;

            if (verified) {
                const { authenticationInfo } = verification;
                const { newCounter } = authenticationInfo;

                devices[deviceIndex].counter = newCounter;

                const updateResult = await db.collections!.webauthn_collection.updateOne(
                    { id: webauthn.id },
                    { $set: { devices } }
                );

                if (!updateResult.acknowledged) {
                    throw new GraphQLError('Failed to update authenticators', {
                        extensions: { code: errorCodes.DATABASE_ERROR }
                    });
                }
            }
            return true;
        } catch (_error) {
            console.error(_error);
            return false;
        }

        return false;
    }

}

export const userCore = Object.freeze(new UserCore());
