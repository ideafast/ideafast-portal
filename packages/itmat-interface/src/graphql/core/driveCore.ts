import bcrypt from 'bcrypt';
import { db } from '../../database/database';
import config from '../../utils/configManager';
import { GraphQLError } from 'graphql';
import { IUser, enumUserTypes, IOrganisation, IPubkey, defaultSettings, IGenericResponse, enumFileTypes, enumFileCategories, IResetPasswordRequest, IDriveNode, enumDriveNodeTypes, IFile, IDrivePermission } from '@itmat-broker/itmat-types';
import { makeGenericReponse } from '../responses';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../errors';
import { FileUpload } from 'graphql-upload-minimal';
import { fileCore } from './fileCore';
import * as mfa from '../../utils/mfa';

export class DriveCore {
    public async createDriveFolderNode(requester: string, folderName: string, parentId: string | null, restricted: boolean, description: string | null): Promise<IDriveNode> {
        /**
         * Create a drive folder.
         *
         * @param requester - The id of the requested.
         * @param folderName - The name of the folder.
         * @param parentId - The id of the parent. Null for root node.
         * @param protected - Whether this folder is protected.
         * @param description - The description of the folder.
         */
        let parent;
        if (parentId) {
            parent = await db.collections!.drives_collection.findOne({ 'id': parentId, 'life.deletedTime': null });
            if (!parent) {
                throw new GraphQLError('Parent node does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        }
        const driveEntry: IDriveNode = {
            id: uuid(),
            managerId: requester,
            restricted: restricted,
            name: folderName,
            description: description,
            fileId: null,
            type: enumDriveNodeTypes.FOLDER,
            parent: parentId,
            children: [],
            sharedUsers: parent ? parent.sharedUsers : [],
            sharedGroups: parent ? parent.sharedGroups : [],
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        await db.collections!.drives_collection.insertOne(driveEntry);
        return driveEntry;
    }

    public async createDriveFileNode(requester: string, parentId: string, description: string | null, fileType: enumFileTypes | null, file: FileUpload | null): Promise<IDriveNode> {
        /**
         * Add/Upload a file to the user file repo.
         *
         * @param requester - The id of the requester.
         * @param parentId - The id of the file Node.
         * @param description - The description of the file.
         * @param fileType - The type of the file.
         * @param file - The file to upload.
         *
         * @return IGenericResponse - The object of the IGenericResponse.
         */
        const parent = await db.collections!.drives_collection.findOne({ 'id': parentId, 'life.deletedTime': null });
        if (!parent) {
            throw new GraphQLError('Parent node does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        let fileEntry: IFile | null = null;
        if (file && fileType) {
            fileEntry = await fileCore.uploadFile(requester, null, requester, file, description, fileType, enumFileCategories.USER_REPO_FILE, []);
        } else {
            throw new GraphQLError('File or filetype missing.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }
        const driveEntry: IDriveNode = {
            id: uuid(),
            managerId: requester,
            restricted: false,
            name: file?.filename,
            description: description,
            fileId: fileEntry.id,
            type: enumDriveNodeTypes.FILE,
            parent: parentId,
            children: [],
            sharedUsers: parent.sharedUsers,
            sharedGroups: parent.sharedGroups,
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {
                fileSize: fileEntry.fileSize
            }
        };
        await db.collections!.drives_collection.insertOne(driveEntry);
        return driveEntry;
    }

    public async getDriveNodes(requester: string, rootId: string | null): Promise<Record<string, IDriveNode[]>> {
        /**
         * Get the drive nodes of a user.
         *
         * @param requester - The id of the requester.
         * @param rootId - The id of the root drive if specified.
         */

        // check user groups

        const groupIds = (await db.collections!.groups_collection.find({
            'children': requester,
            'life.deletedTime': null
        }).toArray()).map(el => el.id);
        // const drives = await db.collections!.drives_collection.find({
        //     'life.deletedTime': null,
        //     $or: [{
        //         managerId: requester
        //     }, {
        //         'sharedUsers.iid': requester
        //     }, {
        //         'sharedGroups.iid': { $in: groupIds }
        //     }]
        // }).toArray();
        const drivesByUser = await db.collections!.drives_collection.aggregate([
            {
                $match: {
                    'life.deletedTime': null,
                    'id': rootId ? new RegExp(`^${rootId}$`) : new RegExp('^.*$'),
                    '$or': [
                        { managerId: requester },
                        { 'sharedUsers.iid': requester },
                        { 'sharedGroups.iid': { $in: groupIds } }
                    ]
                }
            },
            {
                $group: {
                    _id: '$managerId',
                    drives: { $push: '$$ROOT' }
                }
            },
            {
                $project: {
                    managerId: '$_id',
                    drives: 1,
                    _id: 0
                }
            }
        ]).toArray();
        const resultObject: any = {};
        for (const drives of drivesByUser) {
            resultObject[drives.managerId] = [];
            for (const drive of drives.drives) {
                resultObject[drives.managerId].push(drive);
            }
            if (drives.drives.filter((el: any) => el.parent === null).length === 0) {
                const rootDrive = {
                    id: uuid(),
                    managerId: requester,
                    restricted: false,
                    name: drives.managerId,
                    description: null,
                    fileId: null,
                    type: enumDriveNodeTypes.FOLDER,
                    parent: null,
                    children: [],
                    sharedUsers: [requester],
                    sharedGroups: [requester],
                    life: {
                        createdTime: Date.now(),
                        createdUser: requester,
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {
                    }
                };
                const existingIds = drives.drives.map((el: { id: any; }) => el.id);
                for (const drive of resultObject[drives.managerId]) {
                    if (!existingIds.includes(drive.id)) {
                        drive.parent = rootDrive.id;
                    }
                }
                resultObject[drives.managerId].push(rootDrive);
            }
        }

        return resultObject;
    }

    public async editDriveNodes(requester: string, driveId: string, managerId: string | null, name: string | null, description: string | null, parentId: string | null, children: string[] | null, sharedUsers: IDrivePermission[] | null, sharedGroups: IDrivePermission[] | null) {
        /**
         * Edit a drive node.
         *
         * @param requester - The id of the requester.
         * @param driveId - The id of the driver.
         * @param managerId - The id of the manager.
         * @param name - The name of the drive.
         * @param description - The description of the drive.
         * @param parentId - The id of the parent node.
         * @param children - The ids of the childeren.
         * @param sharedUsers - Shared users.
         * @param sharedGroups - Shared user groups.
         */

        const drive = await db.collections!.drives_collection.findOne({ 'id': driveId, 'life.deletedTime': null });
        if (!drive) {
            throw new GraphQLError('Study or group does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        if (managerId) {
            const manager = await db.collections!.users_collection.findOne({ 'id': managerId, 'life.deletedTime': null });
            if (!manager) {
                throw new GraphQLError('Manger id does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        }

        if (parentId) {
            const targetParentGroup = await db.collections!.drives_collection.findOne({ 'id': parentId, 'life.deletedTime': null });
            if (!targetParentGroup) {
                throw new GraphQLError('Parent group does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        }

        if (children) {
            const groupNodeIds: string[] = (await db.collections!.drives_collection.find({ 'life.deletedTime': null }).toArray()).map(el => el.id);
            if (children.some(el => !groupNodeIds.includes(el))) {
                throw new GraphQLError('Children do not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        }


        // TODO:check sharedUsers and sharedGroups are legal
        const updated = await db.collections!.drives_collection.findOneAndUpdate({ id: driveId }, {
            $set: {
                managerId: managerId ?? drive.managerId,
                name: name ?? drive.name,
                description: description ?? drive.description,
                parentId: parentId ?? drive.parent,
                children: children ?? drive.children,
                sharedUsers: sharedUsers ?? drive.sharedUsers,
                sharedGroups: sharedGroups ?? drive.sharedGroups
            }
        }, {
            returnDocument: 'after'
        });
        const driveIds: string[] = [];
        await this.recursiveFindDrives(drive, [], driveIds);
        // Update children drives permission
        const childrenDrives = updated.value?.children ?? [];
        await db.collections!.drives_collection.updateMany({
            id: { $in: driveIds }
        }, {
            $set: {
                sharedUsers: updated.value?.sharedUsers ?? [],
                sharedGroups: updated.value?.sharedGroups ?? []
            }
        });

        return {
            driveIds: driveIds,
            drive: updated.value
        };
    }

    public async deleteDriveNode(requester: string, driveId: string): Promise<IDriveNode> {
        /**
         * Delete a file node.
         *
         * @param requester - The id of the requester.
         * @param userId - The id of the user.
         * @param driveNodeId - The id of the file node.
         *
         * @return IGenericRespoinse - The object of IGenericResponse
         */

        const drive = await db.collections!.drives_collection.findOne({ 'id': driveId, 'life.deletedTime': null });
        if (!drive) {
            throw new GraphQLError('Study or group does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }


        const driveIds: string[] = [];
        const driveFileIds: string[] = [];
        this.recursiveFindDrives(drive, driveFileIds, driveIds);
        // delete metadata in drive collection
        await db.collections!.drives_collection.updateMany({ id: { $in: driveIds } }, {
            $set: {
                'life.deletedTime': Date.now(),
                'life.deletedUser': requester
            }
        });
        // delete metadata in file collection
        await db.collections!.files_collection.updateMany({ id: { $in: driveFileIds } }, {
            $set: {
                'life.deletedTime': Date.now(),
                'life.deletedUser': requester
            }
        });
        return drive;
    }

    public async recursiveFindDrives(root: IDriveNode, driveFileIds: string[], driveIds: string[]) {
        /**
         * Recursive find the files and file nodes that are in the same tree.
         *
         * @param root - The root from which to start.
         * @param filesList - The ids of the files that belongs to this root.
         * @param nodesList - The ids of the file nodes that belongs to this root.
         *
         * @return null
         */
        if (!root) {
            return;
        }
        driveIds.push(root.id);
        if (root.type === enumDriveNodeTypes.FILE && root.fileId) {
            driveFileIds.push(root.fileId);
            return;
        }
        if (root.type === enumDriveNodeTypes.FOLDER) {
            for (const child of root.children) {
                const thisDrive = await db.collections!.drives_collection.findOne({ 'id': child, 'life.deletedTime': null });
                if (!thisDrive) {
                    continue;
                } else {
                    this.recursiveFindDrives(thisDrive, driveFileIds, driveIds);
                }
            }
        }
        return;
    }
}

export const driveCore = Object.freeze(new DriveCore());