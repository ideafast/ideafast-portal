import bcrypt from 'bcrypt';
import { db } from '../database/database';
import config from '../utils/configManager';
import { GraphQLError } from 'graphql';
import { IUser, enumUserTypes, IPubkey, defaultSettings, IGenericResponse, enumFileTypes, enumFileCategories, IResetPasswordRequest, enumGroupNodeTypes, IGroupNode, AccessToken} from '@itmat-broker/itmat-types';
import { makeGenericReponse } from '../graphql/responses';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../graphql/errors';
import { FileUpload } from 'graphql-upload-minimal';
import { fileCore } from './fileCore';
import * as mfa from '../utils/mfa';
import { TRPCError } from '@trpc/server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';
import { rsakeygen, rsaverifier, tokengen } from '../utils/pubkeycrypto';
import { mailer } from '../emailer/emailer';
import { decryptEmail, makeAESIv, makeAESKeySalt } from '../encryption/aes';
import * as fs from 'fs';

// System secret key pairs
const systemSecret = {
    publickey: fs.readFileSync(config.SystemKey.pubkeyFile, 'utf-8'),
    privatekey: fs.readFileSync(config.SystemKey.privkeyFile, 'utf-8')
};


export class UserCore {
    /**
     * Get a user. One of the parameters should not be null, we will find users by the following order: usreId, username, email.
     *
     * @param userId - The id of the user.
     * @param username - The username of the user.
     * @param email - The email of the user.
     *
     * @return Partial<IUser> - The object of IUser. Remove private information.
     */
    public async getUser(userId?: string, username?: string, email?: string): Promise<IUser[]> {
        // TODO: add permission to user metadata that can be accessed
        let user: any;
        if (userId) {
            user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
        } else if (username) {
            user = await db.collections!.users_collection.findOne({ 'username': username, 'life.deletedTime': null });
        } else if (email) {
            user = await db.collections!.users_collection.findOne({ 'email': email, 'life.deletedTime': null });
        } else {
            return [];
        }

        if (!user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'User does not exist.'
            });
        }

        return [user];
    }

    public async getUserProfile(userId: string): Promise<string | null> {
        /**
         * Get the url of the profile of the user.
         *
         * @param userId - The id of the user.
         *
         * @return string
         */

        const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
        if (!user) {
            throw new GraphQLError('User does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const profile = await db.collections!.files_collection.findOne({ 'studyId': null, 'userId': userId, 'fileCategory': enumFileCategories.USER_PROFILE_FILE, 'life.deletedTime': null }, { sort: { 'life.createdTime': -1 } });
        if (!profile) {
            return null; //throw new GraphQLError('No profile found.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }
        return profile.id;
    }

    /**
     * Get all users.
     *
     * @param requester - The id of the requester.
     * @param includeDeleted - Whether to include users that have been deleted.
     *
     * @return Partial<IUser> - The object of IUser. Remove private information.
     */
    public async getAllUsers(requester: string, includeDeleted: boolean): Promise<IUser[]> {
        return includeDeleted ? await db.collections!.users_collection.find({}).toArray() : await db.collections!.users_collection.find({ 'life.deletedTime': null }).toArray();
    }


    public async validateResetPassword(encryptedEmail: string, token: string): Promise<IGenericResponse> {
        /* decrypt email */
        const salt = makeAESKeySalt(token);
        const iv = makeAESIv(token);
        let email;
        try {
            email = await decryptEmail(encryptedEmail, salt, iv);
        } catch (e) {
            throw new GraphQLError('Token is not valid.');
        }

        /* check whether username and token is valid */
        /* not changing password too in one step (using findOneAndUpdate) because bcrypt is costly */
        const TIME_NOW = new Date().valueOf();
        const ONE_HOUR_IN_MILLISEC = 60 * 60 * 1000;
        const user: IUser | null = await db.collections!.users_collection.findOne({
            email,
            'resetPasswordRequests': {
                $elemMatch: {
                    id: token,
                    timeOfRequest: { $gt: TIME_NOW - ONE_HOUR_IN_MILLISEC },
                    used: false
                }
            },
            'life.deletedTime': null
        });
        if (!user) {
            throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
        }
        return makeGenericReponse();
    }

    /**
     * Create a user.
     *
     * @param username - The username of the user, should be unique.
     * @param email - The emailAddress of the user.
     * @param firstname - The first name of the user.
     * @param lastname - The last name of the user.
     * @param organisation - The id of the user's organisation. Should be one of the organisaiton in the database.
     * @param type - The user type of the user.
     * @param emailNotificationsActivated - Whether email notification service is activared.
     * @param password - The password of the user, should be hashed.
     * @param otpSecret - The otp secret of the user.
     * @param profile - The profile of the user.
     * @param description - The description of the user.
     * @param requester - The id of the requester.
     *
     * @return Partial<IUser> - The object of IUser. Remove private information.
     */
    public async createUser(username: string, email: string, firstname: string, lastname: string, organisation: string, type: enumUserTypes, emailNotificationsActivated: boolean, password: string, otpSecret: string, profile?: FileUpload, description?: string, requester?: string): Promise<Partial<IUser>> {
        const user = await db.collections!.users_collection.findOne({
            $or: [
                { username: username },
                { email: email }
            ]
        });
        if (user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Username or email already exists.'
            });
        }
        const org = await db.collections!.organisations_collection.findOne({ 'id': organisation, 'life.deletedTime': null });
        if (!org) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Organisation does not exist.'
            });
        }

        // fetch the config file
        const userConfig = defaultSettings.userConfig;

        const userId: string = uuid();
        const hashedPassword: string = await bcrypt.hash(password, config.bcrypt.saltround);
        const expiredAt = Date.now() + 86400 * 1000 /* millisec per day */ * (userConfig.defaultUserExpiredDays);
        let fileEntry: any = undefined;

        if (profile) {
            if (!Object.keys(enumFileTypes).includes((profile?.filename?.split('.').pop() || '').toUpperCase())) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'File type not supported.'
                });
            }
            fileEntry = await fileCore.uploadFile(userId, null, userId, profile, undefined, enumFileTypes[(profile.filename.split('.').pop() || '').toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.USER_PROFILE_FILE, []);
        }
        const entry: IUser = {
            id: userId,
            username: username,
            email: email,
            firstname: firstname,
            lastname: lastname,
            organisation: organisation,
            type: type,
            emailNotificationsActivated: emailNotificationsActivated,
            resetPasswordRequests: [],
            password: hashedPassword,
            otpSecret: otpSecret,
            profile: (profile && fileEntry) ? fileEntry?.id : null,
            description: description ?? '',
            expiredAt: expiredAt,
            life: {
                createdTime: Date.now(),
                createdUser: requester ?? userId,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };
        await db.collections!.users_collection.insertOne(entry);
        return entry;
    }

    /**
     * Edit an existing user. Note, this function will use all default values, so if you want to keep some fields the same, you need to first fetch the original values as the inputs.
     *
     * @param requester - The id of the requester.
     * @param userId - The id of the user.
     * @param username - The username of the user, should be unique.
     * @param email - Optional. The emailAddress of the user.
     * @param firstname - Optional. The first name of the user.
     * @param lastname - Optional. The last name of the user.
     * @param organisation - Optional. The id of the user's organisation. Should be one of the organisaiton in the database.
     * @param type - Optional. The user type of the user.
     * @param emailNotificationsActivated - Optional. Whether email notification service is activared.
     * @param password - Optional. The password of the user, should be hashed.
     * @param otpSecret - Optional. The otp secret of the user.
     * @param profile - Optional. The image of the profile of the user. Could be null.
     * @param description - Optional. The description of the user.
     * @param expiredAt - Optional. The expired timestamps of the user.
     *
     * @return Partial<IUser> - The object of IUser. Remove private information.
     */
    public async editUser(requester: string, userId: string, username?: string, email?: string, firstname?: string, lastname?: string, organisation?: string, type?: enumUserTypes, emailNotificationsActivated?: boolean, password?: string, otpSecret?: string, profile?: FileUpload, description?: string, expiredAt?: number): Promise<Partial<IUser>> {
        const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
        if (!user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'User does not exist.'
            });
        }
        const setObj: any = {};
        if (username && username !== user.username) {
            const existUsername = await db.collections!.users_collection.findOne({ 'username': username, 'life.deletedTime': null });
            if (existUsername) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Username already used.'
                });
            }
            setObj.username = username;
        }

        if (email && email !== user.email) {
            const existEmail = await db.collections!.users_collection.findOne({ 'email': email, 'life.deletedTime': null });
            if (existEmail) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Email already used.'
                });
            }
            setObj.email = email;
        }

        if (organisation) {
            const org = await db.collections!.organisations_collection.findOne({ 'id': organisation, 'life.deletedTime': null });
            if (!org) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Organisation does not exist.'
                });
            }
        }

        if (password) {
            const hashedPassword: string = await bcrypt.hash(password, config.bcrypt.saltround);
            if (await bcrypt.compare(password, user.password)) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'You need to select a new password.'
                });
            }
            setObj.password = hashedPassword;
        }

        if (otpSecret) {
            setObj.otpSecret = otpSecret;
        }

        let fileEntry;
        if (profile) {
            if (!Object.keys(enumFileTypes).includes((profile?.filename?.split('.').pop() || '').toUpperCase())) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'File type not supported.'
                });
            }
            fileEntry = await fileCore.uploadFile(requester, null, user.id, profile, undefined, enumFileTypes[(profile.filename.split('.').pop() || '').toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.USER_PROFILE_FILE, []);
            setObj.profile = fileEntry.id;
        }

        if (expiredAt) {
            setObj.expiredAt = expiredAt;
        }

        const result = await db.collections!.users_collection.findOneAndUpdate({ id: user.id }, {
            $set: setObj
        }, {
            returnDocument: 'after'
        }) as any;

        return result.value;
    }
    /**
     * Delete an user.
     *
     * @param requester - The id of the requester.
     * @param userId - The id of the user.
     *
     * @return IGenericResponse - General response.
     */
    public async deleteUser(requester: string, userId: string): Promise<IGenericResponse> {
        const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
        if (!user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'User does not exist.'
            });
        }

        const session = db.client!.startSession();
        session.startTransaction();
        try {
            /* delete the user */
            await db.collections!.users_collection.findOneAndUpdate({ 'id': userId, 'life.deletedTime': null }, { $set: { 'life.deletedTime': Date.now(), 'life.deletedUser': requester, 'password': 'DeletedUserDummyPassword', 'otpSecret': 'DeletedUserDummpOtpSecret' } }, { returnDocument: 'after' });

            /* delete all user records in roles related to the study */
            await db.collections!.roles_collection.updateMany({
                'life.deletedTime': null,
                'users': userId
            }, {
                $pull: { users: userId }
            });

            // /* delete all user records in the groups related to the study */
            // await db.collections!.studies_collection.updateMany({
            //     'life.deletedTime': null,
            //     'orgTree.paths.users': userId
            // }, {
            //     $pull: { 'orgTree.paths.users': userId }
            // });

            await session.commitTransaction();
            session.endSession();
            return makeGenericReponse(userId, true, undefined, `User ${user.username} has been deleted.`);
        } catch (error) {
            // If an error occurred, abort the whole transaction and
            // undo any changes that might have happened
            await session.abortTransaction();
            session.endSession();
            throw new GraphQLError(`${JSON.stringify(error)}`, { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    /**
     * Get keys of a user.
     *
     * @param requester - The id of the user.
     */
    public async getUserKeys(requester: string): Promise<Partial<IPubkey>[]> {
        return await db.collections!.pubkeys_collection.find({ 'associatedUserId': requester, 'life.deletedTime': null }).toArray();
    }
    /**
     * Register a pubkey to a user.
     *
     * @param requester - The id of the requester.
     * @param pubkey - The public key.
     * @param signature - The signature of the key.
     * @param associatedUserId - The user whom to attach the publick key to.
     *
     * @return IPubkey - The object of ther registered key.
     */
    public async registerPubkey(requester: string, pubkey: string, signature: string, associatedUserId: string): Promise<IPubkey> {
        // refine the public-key parameter from browser
        pubkey = pubkey.replace(/\\n/g, '\n');
        const alreadyExist = await db.collections!.pubkeys_collection.findOne({ pubkey, 'life.deletedTime': null });
        if (alreadyExist) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'This public-key has already been registered.'
            });
        }

        const user = await db.collections!.users_collection.findOne({ 'id': requester, 'life.deletedTime': null });
        if (!user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'User does not exist.'
            });
        }

        /* Validate the signature with the public key */
        try {
            const signature_verifier = await rsaverifier(pubkey, signature);
            if (!signature_verifier) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Signature vs Public-key mismatched.'
                });
            }
        } catch (error) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Error: Signature or Public-key is incorrect.'
            });
        }

        /* Generate a public key-pair for generating and authenticating JWT access token later */
        const keypair = rsakeygen();

        const entry: IPubkey = {
            id: uuid(),
            pubkey: pubkey,
            associatedUserId: associatedUserId,
            jwtPubkey: keypair.publicKey,
            jwtSeckey: keypair.privateKey,
            refreshCounter: 0,
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        await db.collections!.pubkeys_collection.insertOne(entry);

        await mailer.sendMail({
            from: `${config.appName} <${config.nodemailer.auth.user}>`,
            to: user.email,
            subject: `[${config.appName}] Public-key Registration!`,
            html: `
                <p>
                    Dear ${user.firstname},
                <p>
                <p>
                    You have successfully registered your public-key "${pubkey}" on ${config.appName}!<br/>
                    You will need to keep your private key secretly. <br/>
                    You will also need to sign a message (using your public-key) to authenticate the owner of the public key. <br/>
                </p>
                
                <br/>
                <p>
                    The ${config.appName} Team.
                </p>
            `
        });

        return entry;
    }

    public async deletePubkey(requester: string, userId: string, keyId: string): Promise<IGenericResponse> {
        const key = await db.collections!.pubkeys_collection.findOne({
            'id': keyId,
            'associatedUserId': userId,
            'life.deletedTime': null
        });
        if (!key) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Key does not exist.'
            });
        }
        await db.collections!.pubkeys_collection.findOneAndUpdate({ id: keyId }, {
            $set: {
                'life.deletedTime': Date.now(),
                'life.deletedUser': requester
            }
        });

        return makeGenericReponse(keyId, true, undefined, undefined);
    }

    public async addResetPasswordRequest(userId: string, resetPasswordRequest: IResetPasswordRequest): Promise<IGenericResponse> {
        /**
         * Insert a request of resetting password in IUser. Should tag all previous request as true before.
         *
         * @param resetPasswordRequest - The object of IResetPasswordRequest.
         *
         * @return IGenericResponse - The object of IGenericResponse.
         */

        const invalidateAllTokens = await db.collections!.users_collection.findOneAndUpdate(
            { id: userId },
            {
                $set: {
                    'resetPasswordRequests.$[].used': true
                }
            }
        );
        if (invalidateAllTokens.ok !== 1) {
            throw new GraphQLError(errorCodes.DATABASE_ERROR);
        }
        const updateResult = await db.collections!.users_collection.findOneAndUpdate(
            { id: userId },
            {
                $push: {
                    resetPasswordRequests: resetPasswordRequest
                }
            }
        );
        if (updateResult.ok !== 1) {
            throw new GraphQLError(errorCodes.DATABASE_ERROR);
        }

        return makeGenericReponse(resetPasswordRequest.id, true, undefined, undefined);
    }

    public async processResetPasswordRequest(token: string, email: string, password: string): Promise<Partial<IUser>> {
        /**
         * Process a request of resetting password.
         *
         * @param token - The id of the rquest of resetting passoword.
         * @param email - The email of the user.
         * @param password - The password of the user.
         *
         * @return Partial<IUser> - The object of Partial<IUser>
         */



        /* check whether username and token is valid */
        /* not changing password too in one step (using findOneAndUpdate) because bcrypt is costly */
        const TIME_NOW = new Date().valueOf();
        const ONE_HOUR_IN_MILLISEC = 60 * 60 * 1000;
        const user: any = await db.collections!.users_collection.findOne({
            email,
            resetPasswordRequests: {
                $elemMatch: {
                    id: token,
                    timeOfRequest: { $gt: TIME_NOW - ONE_HOUR_IN_MILLISEC },
                    used: false
                }
            },
            deleted: null
        });
        if (!user) {
            throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
        }

        /* randomly generate a secret for Time-based One Time Password*/
        const otpSecret = mfa.generateSecret();

        /* all ok; change the user's password */
        const hashedPw = await bcrypt.hash(password, config.bcrypt.saltround);
        const updateResult = await db.collections!.users_collection.findOneAndUpdate(
            {
                id: user.id,
                resetPasswordRequests: {
                    $elemMatch: {
                        id: token,
                        timeOfRequest: { $gt: TIME_NOW - ONE_HOUR_IN_MILLISEC },
                        used: false
                    }
                }
            },
            { $set: { 'password': hashedPw, 'otpSecret': otpSecret, 'resetPasswordRequests.$.used': true } });
        if (updateResult.ok !== 1) {
            throw new GraphQLError(errorCodes.DATABASE_ERROR);
        }

        return updateResult.value as Partial<IUser>;
    }

    public async createUserGroup(requester: string, studyId: string | null, reference: string, groupType: enumGroupNodeTypes, description: string | null, parentGroupId: string): Promise<IGroupNode> {
        /**
         * Create a study group.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param reference - Group name or user id.
         * @param groupType - The type of the group.
         * @param description - The description of the group.
         * @param parentGroupId - The id of the parent group.
         *
         * @return IGroupNode - The object of IGroupNode
         */

        if (studyId) {
            const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
            if (!study) {
                throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        }
        if (parentGroupId) {
            const parent = await db.collections?.groups_collection.findOne({ 'id': parentGroupId, 'life.deletedTime': null });
            if (!parent) {
                throw new GraphQLError('Parent node does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        }
        let user;
        if (groupType === enumGroupNodeTypes.USER) {
            user = await db.collections!.users_collection.findOne({ 'id': reference, 'life.deletedTime': null });
            if (!user) {
                throw new GraphQLError('User does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        }
        const groupEntry: IGroupNode = {
            id: uuid(),
            nameOrId: reference,
            managerId: requester,
            studyId: studyId,
            type: groupType,
            description: description,
            parentId: parentGroupId,
            children: [],
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        await db.collections!.groups_collection.insertOne(groupEntry);
        await db.collections!.groups_collection.findOneAndUpdate({ id: parentGroupId }, {
            $push: {
                children: groupEntry.id
            }
        });

        return groupEntry;
    }

    public async editUserGroup(managerId: string | null, groupId: string, reference: string | null, description: string | null, targetParentId: string | null, children: string[] | null): Promise<IGenericResponse> {
        /**
         * Edit a group.
         *
         * @param groupId - The id of the group.
         * @param reference - The name of the group.
         * @param description - The new description of the group.
         * @param targetParentId - The id of the target parent.
         * @param children - The ids of the children groups of the group.
         *
         * @return IGenericResponse - The object of IGenericRespnse
         */
        const group = await db.collections!.groups_collection.findOne({ 'id': groupId, 'life.deletedTime': null });
        if (!group) {
            throw new GraphQLError('Study or group does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        if (managerId) {
            const manager = await db.collections!.users_collection.findOne({ 'id': managerId, 'life.deletedTime': null });
            if (!manager) {
                throw new GraphQLError('Manger id does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        }

        if (reference) {
            if (group.type === enumGroupNodeTypes.USER) {
                const user = await db.collections!.users_collection.findOne({ 'id': reference, 'life.deletedTime': null });
                if (!user) {
                    throw new GraphQLError('User does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
                }
            }
        }

        if (targetParentId) {
            const targetParentGroup: IGroupNode | null = await db.collections!.groups_collection.findOne({ 'id': targetParentId, 'life.deletedTime': null });
            if (!targetParentGroup) {
                throw new GraphQLError('Target group does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        }

        if (children) {
            const groupNodeIds: string[] = (await db.collections!.groups_collection.find({ 'life.deletedTime': null }).toArray()).map(el => el.id);
            if (children.some(el => !groupNodeIds.includes(el))) {
                throw new GraphQLError('Children do not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        }

        await db.collections!.groups_collection.findOneAndUpdate({ id: groupId }, {
            $set: {
                managerId: managerId ?? group.managerId,
                description: description ?? group.description,
                nameOrId: reference ?? group.nameOrId,
                parentId: targetParentId ?? group.parentId,
                children: children ?? group.children
            }
        });

        return makeGenericReponse(groupId, true, undefined, `Group ${groupId}'s description has been edited.`);
    }

    public async deleteUserGroup(requester: string, groupId: string): Promise<IGenericResponse> {
        /**
         * Delete a group of a study.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param groupId - The id of the group.
         *
         * @return IGenericResponse - The object of IGenericResponse.
         */

        const group = await db.collections!.groups_collection.findOne({ id: groupId });
        if (!group) {
            throw new GraphQLError('Study or group does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        if (requester !== group.managerId) {
            throw new GraphQLError('Only group manager can delete a group.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
        }

        const groupIds: string[] = [];
        this.recursiveFindFiles(group, groupIds);

        await db.collections!.groups_collection.updateMany({ id: { $in: groupIds } }, {
            $set: {
                'life.deletedTime': Date.now(),
                'life.deletedUser': requester
            }
        });

        return makeGenericReponse(groupId, true, undefined, `Group ${groupId} has been deleted.`);
    }


    public async recursiveFindFiles(root: IGroupNode, groupIds: string[]) {
        /**
         * Recursive find the files and file nodes that are in the same tree.
         *
         * @param fileNodesList - The all file nodes of the tree.
         * @param root - The root from which to start.
         * @param filesList - The ids of the files that belongs to this root.
         * @param nodesList - The ids of the file nodes that belongs to this root.
         *
         * @return null
         */
        if (!root) {
            return;
        }
        groupIds.push(root.id);
        if (root.type === enumGroupNodeTypes.USER) {
            groupIds.push(root.id);
            return;
        }
        if (root.type === enumGroupNodeTypes.GROUP) {
            for (const child of root.children) {
                const thisGroup = await db.collections!.groups_collection.findOne({ id: child });
                if (!thisGroup) {
                    continue;
                } else {
                    this.recursiveFindFiles(thisGroup, groupIds);
                }
            }
        }
        return;
    }

    public async getUserGroups(userId: string): Promise<Partial<IGroupNode>[]> {
        /**
         * Get the list of groups of a user.
         *
         * @param userId - The id of the user.
         *
         * @return Partial<IGroupNode>[]
         */

        // const groups = await db.collections!.groups_collection.find({
        //     'life.deletedTime': null,
        //     '$or': [{
        //         managerId: userId
        //     }, {
        //         nameOrId: userId
        //     }]
        // }).toArray();
        const groups = await db.collections!.groups_collection.find({
            'life.deletedTime': null,
            'children': userId
        }).toArray();
        return groups;
    }

    public async getGroup(groupId: string): Promise<IGroupNode> {
        const group = await db.collections!.groups_collection.findOne({ id: groupId });
        if (!group) {
            throw new GraphQLError('Study or group does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }
        return group;
    }
    public async issueAccessToken(pubkey: string, signature: string, life?: number): Promise<AccessToken> {
        // refine the public-key parameter from browser
        pubkey = pubkey.replace(/\\n/g, '\n');

        /* Validate the signature with the public key */
        if (!await rsaverifier(pubkey, signature)) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Signature vs Public key mismatched.'
            });
        }

        const pubkeyrec = await db.collections!.pubkeys_collection.findOne({ pubkey, deleted: null });
        if (pubkeyrec === null || pubkeyrec === undefined) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'This public-key has not been registered yet.'
            });
        }

        // payload of the JWT for storing user information
        const payload = {
            publicKey: pubkeyrec.jwtPubkey,
            associatedUserId: pubkeyrec.associatedUserId,
            refreshCounter: pubkeyrec.refreshCounter,
            Issuer: 'IDEA-FAST DMP'
        };

        // update the counter
        const fieldsToUpdate = {
            refreshCounter: (pubkeyrec.refreshCounter + 1)
        };
        const updateResult = await db.collections!.pubkeys_collection.findOneAndUpdate({ pubkey, deleted: null }, { $set: fieldsToUpdate }, { returnDocument: 'after' });
        if (updateResult === null) {
            throw new GraphQLError('Server error; cannot fulfil the JWT request.');
        }
        // return the acccess tokenb
        const accessToken = {
            accessToken: tokengen(payload, pubkeyrec.jwtSeckey, undefined, undefined, life)
        };

        return accessToken;
    }


    public async issueSystemAccessToken(userId: string): Promise<AccessToken> {
        // payload of the JWT for storing user information
        const payload = {
            publicKey: systemSecret.publickey,
            userId: userId,  // encode the UserId into the token
            Issuer: 'IDEA-FAST DMP SYSTEM',
            timestamp: Date.now()
        };

        const accessToken = {
            // set the token not to be expired by transfer the life time to 1 year
            accessToken: tokengen(payload, systemSecret.privatekey, undefined,undefined, 365 * 24 * 60 * 60 * 1000)
        };

        return accessToken;
    }
}

export const userCore = Object.freeze(new UserCore());
