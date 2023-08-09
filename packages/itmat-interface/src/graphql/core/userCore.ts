import bcrypt from 'bcrypt';
import { db } from '../../database/database';
import config from '../../utils/configManager';
import { GraphQLError } from 'graphql';
import { IUser, enumUserTypes, IOrganisation, IPubkey, defaultSettings, IGenericResponse, enumFileNodeTypes, IFile, IFileNode, enumFileTypes, enumFileCategories, IResetPasswordRequest, enumConfigType } from '@itmat-broker/itmat-types';
import { makeGenericReponse } from '../responses';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../errors';
import { FileUpload } from 'graphql-upload-minimal';
import { fileCore } from './fileCore';
import * as mfa from '../../utils/mfa';
import { MarkOptional } from 'ts-essentials';

export class UserCore {
    public async getUser(userId: string | null, username: string | null, email: string | null): Promise<IUser[]> {
        /**
         * Get a user. One of the parameters should not be null, we will find users by the following order: usreId, username, email.
         *
         * @param userId - The id of the user.
         * @param username - The username of the user.
         * @param email - The email of the user.
         *
         * @return Partial<IUser> - The object of IUser. Remove private information.
         */

        let user: any;
        if (userId) {
            user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
        } else if (username) {
            user = await db.collections!.users_collection.findOne({ 'username': username, 'life.deletedTime': null });
        } else if (email) {
            user = await db.collections!.users_collection.findOne({ 'email': email, 'life.deletedTime': null });
        } else {
            return [];
            // throw new GraphQLError('At lease one of the userId, username, email shoule be provided.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        if (!user) {
            return [];
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

        const profile = await db.collections!.files_collection.findOne({studyId: null, userId: userId, fileCategory: enumFileCategories.USER_PROFILE_FILE, 'life.deletedTime': null});
        if (!profile) {
            return null; //throw new GraphQLError('No profile found.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }
        return profile.id;
    }

    public async getAllUsers(includeDeleted: boolean): Promise<IUser[]> {
        /**
         * Get all users.
         * @param includeDeleted - Whether to include users that have been deleted.
         *
         * @return Partial<IUser> - The object of IUser. Remove private information.
         */
        const users = await db.collections!.users_collection.find({}).toArray();
        const clearedUsers = [];
        for (const user of users) {
            if (!includeDeleted && user.life.deletedTime !== null) {
                continue;
            }

            clearedUsers.push(user);
        }
        return clearedUsers;
    }

    public async createUser(requester: string | null, username: string, email: string, firstname: string, lastname: string, organisation: string, type: enumUserTypes, emailNotificationsActivated: boolean, password: string, otpSecret: string, profile: FileUpload | null, description: string | null): Promise<Partial<IUser>> {
        /**
         * Create a user.
         *
         * @param requester - The id of the requester.
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
         *
         * @return Partial<IUser> - The object of IUser. Remove private information.
         */

        const user = await db.collections!.users_collection.findOne({ 'username': username, 'life.deletedTime': null });
        if (user) {
            throw new GraphQLError('User already exists.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }
        const org = await db.collections!.organisations_collection.findOne({ 'id': organisation, 'life.deletedTime': null });
        if (!org) {
            throw new GraphQLError('Organisation does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        // fetch the config file
        const userConfig = defaultSettings.userConfig;

        const userId: string = uuid();
        const hashedPassword: string = await bcrypt.hash(password, config.bcrypt.saltround);
        const expiredAt = Date.now() + 86400 * 1000 /* millisec per day */ * (userConfig.defaultUserExpiredDays);
        let fileEntry;
        if (profile) {
            if (!Object.keys(enumFileTypes).includes(profile?.filename?.split('.')[1].toUpperCase())) {
                throw new GraphQLError('Profile file does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
            fileEntry = await fileCore.uploadFile(userId, null, userId, profile, null, enumFileTypes[profile.filename.split('.')[1].toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.USER_PROFILE_FILE, []);
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
            profile: (profile && fileEntry) ? fileEntry.id: null,
            description: description,
            expiredAt: expiredAt,
            fileRepo: [{
                id: uuid(),
                name: 'My Files',
                fileId: null,
                type: enumFileNodeTypes.FOLDER,
                children: [],
                parent: null,
                sharedUsers: [],
                life: {
                    createdTime: Date.now(),
                    createdUser: requester ?? userId,
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            }],
            life: {
                createdTime: Date.now(),
                createdUser: requester ?? userId,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        const result = await db.collections!.users_collection.insertOne(entry);
        if (result.acknowledged) {
            const cleared: Partial<IUser> = {
                id: entry.id,
                username: entry.username,
                email: entry.email,
                firstname: entry.firstname,
                lastname: entry.lastname,
                organisation: entry.organisation,
                type: entry.type,
                emailNotificationsActivated: entry.emailNotificationsActivated,
                profile: entry.profile,
                description: entry.description,
                expiredAt: entry.expiredAt,
                fileRepo: entry.fileRepo
            };
            return cleared;
        } else {
            throw new GraphQLError('Database error', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async editUser(requester: string, userId: string, username: string | null, email: string | null, firstname: string | null, lastname: string | null, organisation: string | null, type: enumUserTypes | null, emailNotificationsActivated: boolean | null, password: string | null, otpSecret: string | null, profile: FileUpload | null, description: string | null, expiredAt: number | null): Promise<Partial<IUser>> {
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

        const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
        if (!user) {
            throw new GraphQLError('User does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }
        if (username && username !== user.username) {
            const existUsername = await db.collections!.users_collection.findOne({ 'username': username, 'life.deletedTime': null });
            if (existUsername) {
                throw new GraphQLError('User already exists.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        }
        if (organisation) {
            const org = await db.collections!.organisations_collection.findOne({ 'id': organisation, 'life.deletedTime': null });
            if (!org) {
                throw new GraphQLError('Organisation does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        }
        let fileEntry;
        if (profile) {
            if (!Object.keys(enumFileTypes).includes(profile?.filename?.split('.')[1].toUpperCase())) {
                throw new GraphQLError('Profile file does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
            fileEntry = await fileCore.uploadFile(requester, null, user.id, profile, null, enumFileTypes[profile.filename.split('.')[1].toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.USER_PROFILE_FILE, []);
        }
        const hashedPassword: string | null = password ? await bcrypt.hash(password, config.bcrypt.saltround) : null;

        const result = await db.collections!.users_collection.findOneAndUpdate({ id: user.id }, {
            $set: {
                username: username ?? user.username,
                email: email ?? user.email,
                firstname: firstname ?? user.firstname,
                lastname: lastname ?? user.lastname,
                organisation: organisation ?? user.organisation,
                type: type ?? user.type,
                emailNotificationsActivated: emailNotificationsActivated ?? user.emailNotificationsActivated,
                password: hashedPassword ?? user.password,
                otpSecret: otpSecret ?? user.otpSecret,
                profile: (profile && fileEntry) ? fileEntry.id : null,
                description: description,
                expiredAt: expiredAt ?? user.expiredAt
            }
        }, {
            returnDocument: 'after'
        }) as any;
        const cleared: Partial<IUser> = {
            id: result.value.id,
            username: result.value.username,
            email: result.value.email,
            firstname: result.value.firstname,
            lastname: result.value.lastname,
            organisation: result.value.organisation,
            type: result.value.type,
            emailNotificationsActivated: result.value.emailNotificationsActivated,
            profile: result.value.profile,
            description: result.value.description,
            expiredAt: result.value.expiredAt,
            fileRepo: result.value.fileRepo
        };
        return cleared;
    }

    public async deleteUser(requester: string, userId: string): Promise<IGenericResponse> {
        /**
         * Delete an user.
         *
         * @param requester - The id of the requester.
         * @param userId - The id of the user.
         *
         * @return IGenericResponse - General response.
         */

        const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
        if (!user) {
            throw new GraphQLError('User does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const session = db.client!.startSession();
        session.startTransaction();
        try {
            /* delete the user */
            await db.collections!.users_collection.findOneAndUpdate({ 'id': userId, 'life.deletedTime': null }, { $set: { 'life.deletedUser': requester, 'password': 'DeletedUserDummyPassword', 'otpSecret': 'DeletedUserDummpOtpSecret' } }, { returnDocument: 'after' });

            /* delete all user records in roles related to the study */
            await db.collections!.roles_collection.updateMany({
                'life.deletedTime': null,
                'users': userId
            }, {
                $pull: { users: userId }
            });

            /* delete all user records in the groups related to the study */
            await db.collections!.studies_collection.updateMany({
                'life.deletedTime': null,
                'orgTree.paths.users': userId
            }, {
                $pull: { 'orgTree.paths.users': userId }
            });

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

    public async getFileNodes(userId: string): Promise<IFileNode[]> {
        /**
         * Get the list of file nodes of a user.
         *
         * @param userId - The id of the user.
         *
         * @return IFileNode[]
         */
        const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
        if (!user) {
            throw new GraphQLError('User does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        return user.fileRepo;
    }

    public async addFileNodeToUserRepo(requester: string, userId: string, parentNodeId: string, description: string | null, fileType: enumFileTypes | null, file: FileUpload | null, folderName: string | null): Promise<IFileNode> {
        /**
         * Add/Upload a file to the user file repo.
         *
         * @param requester - The id of the requester.
         * @param userId - The id of the user of the file repo. Usually should be the same as The id of the requester.
         * @param parentNodeId - The id of the file Node.
         * @param file - The file to upload.
         * @param folderName - The name of the folder. Should be numm if file is not null.
         *
         * @return IGenericResponse - The object of the IGenericResponse.
         */
        const user = await db.collections!.users_collection.findOne({id: userId, 'fileRepo.id': parentNodeId, 'life.deletedTime': null});
        if (!user) {
            throw new GraphQLError('User or parent node does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }
        const session = db.client!.startSession();
        session.startTransaction();
        try {
            let fileEntry: IFile | null = null;
            if (file && fileType) {
                fileEntry = await fileCore.uploadFile(requester, null, userId, file, description, fileType, enumFileCategories.USER_REPO_FILE, []);
            }
            const fileNodeId: string = uuid();
            const fileNodeEntry: IFileNode = {
                id: fileNodeId,
                name: fileEntry ? fileEntry.fileName : folderName ?? '',
                fileId: fileEntry ? fileEntry.id : null,
                type: fileEntry ? enumFileNodeTypes.FILE : enumFileNodeTypes.FOLDER,
                parent: parentNodeId,
                children: [],
                sharedUsers: [],
                life: {
                    createdTime: Date.now(),
                    createdUser: requester,
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            };

            await db.collections!.users_collection.findOneAndUpdate({ 'id': userId, 'life.deletedTime': null }, {
                $push: { fileRepo: fileNodeEntry }
            });

            await db.collections!.users_collection.findOneAndUpdate({ 'id': userId, 'life.deletedTime': null, 'fileRepo.id': parentNodeId }, {
                $push: { 'fileRepo.$.children': fileNodeId }
            });
            await session.commitTransaction();
            session.endSession();
            return fileNodeEntry;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw new GraphQLError(`${JSON.stringify(error)}`, { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async moveFileNodeFromUserRepo(userId: string, fileNodeId: string, toParentId: string): Promise<IGenericResponse> {
        /**
         * Move a file node to another parent.
         *
         * @param userId - The id of the user.
         * @param fileNodeId - The id of the file node.
         * @param toParentId - The id of the new parent.
         *
         * @return IGenericResponse - The object of IGenericResponse
         */

        const parentNode = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null, 'fileRepo.id': toParentId });
        if (!parentNode) {
            throw new GraphQLError('Parent node does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const thisNode = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null, 'fileRepo.id': fileNodeId });
        if (!thisNode) {
            throw new GraphQLError('Node does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const session = db.client!.startSession();
        session.startTransaction();
        try {
            await db.collections!.users_collection.findOneAndUpdate({ 'id': userId, 'life.deletedTime': null, 'fileRepo.children': fileNodeId }, {
                $pull: { 'fileRepo.$.children': fileNodeId }
            });

            await db.collections!.users_collection.findOneAndUpdate({ 'id': userId, 'life.deletedTime': null, 'fileRepo.id': fileNodeId }, {
                $set: { 'fileRepo.$.parent': toParentId }
            });
            await session.commitTransaction();
            session.endSession();
            return makeGenericReponse(fileNodeId, true, undefined);
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw new GraphQLError(`${JSON.stringify(error)}`, { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async deleteFileNodeFromUserRepo(requester: string, userId: string, fileNodeId: string): Promise<IGenericResponse> {
        /**
         * Delete a file node.
         *
         * @param requester - The id of the requester.
         * @param userId - The id of the user.
         * @param fileNodeId - The id of the file node.
         *
         * @return IGenericRespoinse - The object of IGenericResponse
         */

        const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null, 'fileRepo.id': fileNodeId });
        if (!user) {
            throw new GraphQLError('User or parent node does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const rootNode: IFileNode = user.fileRepo.filter(el => el.id === fileNodeId)[0];

        const session = db.client!.startSession();
        session.startTransaction();
        try {
            const fileIdsToDelete: string[] = [];
            const nodeIdsToDelete: string[] = [];
            this.recursiveFindFiles(user.fileRepo, rootNode, fileIdsToDelete, nodeIdsToDelete);
            await db.collections!.users_collection.findOneAndUpdate({ 'id': userId, 'life.deletedTime': null, 'fileRepo.children': fileNodeId }, {
                $pull: { 'fileRepo.$.children': fileNodeId }
            });

            await db.collections!.users_collection.findOneAndUpdate({ 'id': userId, 'life.deletedTime': null }, {
                $pull: { fileRepo: { id: { $in: nodeIdsToDelete } } }
            });

            await db.collections!.files_collection.updateMany({ 'id': { $in: fileIdsToDelete }, 'life.deletedTime': null }, {
                $set: {
                    'life.deletedTime': Date.now(),
                    'life.deletedUser': requester
                }
            });

            await session.commitTransaction();
            session.endSession();
            return makeGenericReponse(fileNodeId, true, undefined);
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw new GraphQLError(`${JSON.stringify(error)}`, { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async shareFileNodeToUsers(userId: string, fileNodeId: string, sharedUsers: string[]): Promise<IGenericResponse> {
        /**
         * Share a file node to other users.
         *
         * @param userId - The id of the user.
         * @param fileNodeId - The id of the file node.
         * @param sharedUsers - The ids of the users to share with.
         *
         * @return IGenericResponse - The object of IGenericResponse.
         */
        const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null, 'fileRepo.id': fileNodeId });
        if (!user) {
            throw new GraphQLError('User or parent node does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const fileIdsToShare: string[] = [];
        const nodeIdsToShare: string[] = [];
        this.recursiveFindFiles(user.fileRepo, user.fileRepo.filter(el => el.id === fileNodeId)[0], fileIdsToShare, nodeIdsToShare);
        await db.collections!.users_collection.findOneAndUpdate({ 'id': userId, 'fileRepo.id': { $in: nodeIdsToShare } }, {
            $set: { 'fileRepo.$.sharedUsers': sharedUsers }
        });

        return makeGenericReponse(fileNodeId, true, undefined);
    }

    public async getUserFileRepo(userId: string): Promise<any> {
        /**
         *  Get the file repo of a user. Including shared files.
         *
         * @param requester - The id of the requester.
         * @param userId - The id of the user.
         *
         * @return Record<string, IFileNode[]> - The json object where the key is the userId and the value is the file nodes
         */

        const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
        if (!user) {
            throw new GraphQLError('Parent node does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const nodes = await db.collections!.users_collection.aggregate([{
            $match: { 'life.deletedTime': null, 'fileRepo.sharedUsers': userId }
        }, {
            $group: { _id: '$id', nodes: { $push: '$fileRepo' } }
        }, {
            $project: { _id: 0, data: { $arrayToObject: [[{ k: '$_id', v: '$nodes' }]] } }
        }]);
        return nodes;
    }

    public async getOrganisations(organisationId: string | null): Promise<IOrganisation[]> {
        /**
         * Get the list of organisations. If input is null, return all organisaitons.
         *
         * @param organisationId - The id of the organisation.
         *
         * @return IOrganisation[] - The list of objects of IOrganisation.
         */

        if (!organisationId) {
            return await db.collections!.organisations_collection.find({ 'life.deletedTime': null }).toArray();
        } else {
            const organisation = await db.collections!.organisations_collection.findOne({ 'id': organisationId, 'life.deletedTime': null });
            if (!organisation) {
                throw new GraphQLError('Organisation does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            } else {
                return [organisation];
            }
        }
    }

    public async createOrganisation(requester: string, name: string, shortname: string | null, profile: string | null, location: number[] | null): Promise<IOrganisation> {
        /**
         * Create an organisation.
         *
         * @param requester - The id of the requester.
         * @param name - The name of the organisation.
         * @param shortname - The shortname of the organisation. Could be null.
         * @param type - The type of the organistaion. Either organistaion or group.
         * @param profile - The id of the image of the profile of the organisation. Could be null.
         * @param location - The location of the organisation.
         *
         * @return IOrganisation - The object of the organisation.
         */

        const org = await db.collections!.organisations_collection.findOne({ 'name': name, 'life.deletedTime': null });
        if (org) {
            throw new GraphQLError('Organisation already exists.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }
        if (profile) {
            const profileFile = await db.collections!.files_collection.findOne({ 'id': profile, 'life.deletedTime': null });
            if (!profileFile) {
                throw new GraphQLError('Profile file does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        }

        const entry: IOrganisation = {
            id: uuid(),
            name: name,
            shortname: shortname,
            profile: profile,
            location: location,
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };
        const result = await db.collections!.organisations_collection.insertOne(entry);
        if (result.acknowledged) {
            return entry;
        } else {
            throw new GraphQLError('Database error', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async deleteOrganisation(requester: string, organisationId: string): Promise<IGenericResponse> {
        /**
         * Delete an organisation.
         *
         * @param requester - The id of the requester.
         * @param organisationId - The id of the organisation.
         *
         * @return IOrganisation - The object of the organisation.
         */

        const org = await db.collections!.organisations_collection.findOne({ 'id': organisationId, 'life.deletedTime': null });
        if (!org) {
            throw new GraphQLError('Organisation does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        await db.collections!.organisations_collection.findOneAndUpdate({ id: organisationId }, {
            $set: {
                'life.deletedTime': Date.now(),
                'life.deletedUser': requester
            }
        });

        return makeGenericReponse(organisationId, true, undefined, `Organisation ${org.name} has been deleted.`);
    }

    public async editOrganisation(organisationId: string, name: string | null, shortname: string | null, profile: string | null): Promise<IGenericResponse> {
        /**
         * Delete an organisation.
         *
         * @param organisationId - The id of the organisation.
         * @param name - The name of the organisation.
         * @param shortname - The shortname of the organisation.
         * @param profile - The profile of the organisation.
         *
         * @return IOrganisation - The object of the organisation.
         */

        const org = await db.collections!.organisations_collection.findOne({ 'id': organisationId, 'life.deletedTime': null });
        if (!org) {
            throw new GraphQLError('Organisation does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }
        if (profile) {
            const profileFile = await db.collections!.files_collection.findOne({ 'id': profile, 'life.deletedTime': null });
            if (!profileFile) {
                throw new GraphQLError('Profile file does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        }

        await db.collections!.organisations_collection.findOneAndUpdate({ id: organisationId }, {
            $set: {
                name: name ?? org.name,
                shortname: shortname ?? org.shortname,
                profile: profile ?? org.profile
            }
        });

        return makeGenericReponse(organisationId, true, undefined, `Organisation ${name ?? org.name} has been edited.`);
    }

    public async registerPubkey(pubkey: string, associatedUserId: string, jwtPubkey: string, jwtSeckey: string): Promise<IPubkey> {
        /**
         * Register a pubkey to a user.
         *
         * @param pubkey - The public key.
         * @param associatedUserId - The user whom to attach the publick key to.
         * @param jwtPubkey - The jwt public key.
         * @param jwtSeckey - The jwt secret key.
         *
         * @return IPubkey - The object of ther registered key.
         */
        const entry: IPubkey = {
            id: uuid(),
            pubkey: pubkey,
            associatedUserId: associatedUserId,
            jwtPubkey: jwtPubkey,
            jwtSeckey: jwtSeckey,
            refreshCounter: 0,
            life: {
                createdTime: Date.now(),
                createdUser: associatedUserId,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        const result = await db.collections!.pubkeys_collection.insertOne(entry);
        if (result.acknowledged) {
            return entry;
        } else {
            throw new GraphQLError('Database error', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public recursiveFindFiles(fileNodesList: IFileNode[], root: IFileNode, filesList: string[], nodesList: string[]) {
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
        nodesList.push(root.id);
        if (root.type === enumFileNodeTypes.FILE && root.fileId) {
            filesList.push(root.fileId);
            return;
        }
        if (root.type === enumFileNodeTypes.FOLDER) {
            for (const child in root.children) {
                const thisNode = fileNodesList.filter(el => el.id === child)[0];
                if (!thisNode) {
                    continue;
                } else {
                    this.recursiveFindFiles(fileNodesList, thisNode, filesList, nodesList);
                }
            }
        }
        return;
    }

    public async addResetPasswordRequest(userId: string, resetPasswordRequest: IResetPasswordRequest): Promise<IGenericResponse> {
        /**
         * Insert a request of resetting password in IUser. Should tag all previous request as true before.
         *
         * @param resetPasswordRequest - The object of IResetPasswordRequest.
         *
         * @return IGenericResponse - The object of IGenericResponse.
         */

        const user = await this.getUser(userId, null, null);
        if (!user) {
            throw new GraphQLError('User does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

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
}

export const userCore = Object.freeze(new UserCore());
