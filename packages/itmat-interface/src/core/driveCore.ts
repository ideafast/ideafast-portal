import bcrypt from 'bcrypt';
import { db } from '../database/database';
import config from '../utils/configManager';
import { GraphQLError } from 'graphql';
import { IUser, enumUserTypes, IOrganisation, IPubkey, defaultSettings, IGenericResponse, enumFileTypes, enumFileCategories, IResetPasswordRequest, IDriveNode, enumDriveNodeTypes, IFile, IDrivePermission, FileUpload } from '@itmat-broker/itmat-types';
import { makeGenericReponse } from '../graphql/responses';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../graphql/errors';
import { fileCore } from './fileCore';
import * as mfa from '../utils/mfa';
import { TRPCError } from '@trpc/server';
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';
import { set } from 'zod';
import { objStore } from '../objStore/objStore';
import { error } from 'console';
import path from 'path';

export class DriveCore {
    /**
     * Create a drive folder.
     *
     * @param requester - The id of the requester.
     * @param folderName - The name of the folder.
     * @param parentId - The id of the parent. Null for default root node.
     * @param protected - Whether this folder is protected.
     * @param description - The description of the folder.
     *
     * @return IDriveNode - The drive node to return.
     */
    public async createDriveFolderNode(requester: string, folderName: string, parentId: string | null, restricted: boolean, description?: string): Promise<IDriveNode> {
        // check parent existence
        let parent;
        if (parentId) {
            parent = await db.collections!.drives_collection.findOne({ 'id': parentId, 'life.deletedTime': null });
            if (!parent) {
                throw new GraphQLError('Parent node does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        } else {
            parent = await db.collections!.drives_collection.findOne({ managerId: requester, parent: null });
            if (!parent) {
                throw new GraphQLError('Default root node not found.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        }

        // check permission; requester should have access to the parent node
        const groupIds = (await db.collections!.groups_collection.find({
            'children': requester,
            'life.deletedTime': null
        }).toArray()).map(el => el.id);

        if (parent.sharedUsers.filter(el => el.iid === requester && el.write === true).length === 0
            && parent.sharedGroups.filter(el => groupIds.includes(el.iid) && el.write === true).length === 0
            && parent.managerId !== requester) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }

        // check duplicates, there should not be a same folder in this path
        const children = await db.collections!.drives_collection.find({ 'parent': parent.id, 'life.deletedTime': null }).toArray();
        if (children.filter(el => el.type === enumDriveNodeTypes.FOLDER).map(el => el.name).includes(folderName)) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Folder already exists.'
            });
        }

        const folderDriveId = uuid();
        const driveEntry: IDriveNode = {
            id: folderDriveId,
            path: parent?.path.concat(folderDriveId) ?? [],
            managerId: requester,
            restricted: restricted,
            name: folderName,
            description: description,
            fileId: null,
            type: enumDriveNodeTypes.FOLDER,
            parent: parent.id,
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

        // update parent
        await db.collections!.drives_collection.findOneAndUpdate({ id: parent.id }, {
            $push: { children: driveEntry.id }
        });

        return driveEntry;
    }

    /**
     * Add/Upload a file to the user file repo.
     *
     * @param requester - The id of the requester.
     * @param parentId - The id of the file Node. Null for default root node.
     * @param description - The description of the file.
     * @param fileType - The type of the file.
     * @param file - The file to upload.
     *
     * @return IGenericResponse - The object of the IGenericResponse.
     */
    public async createDriveFileNode(requester: string, parentId: string | null, description: string | undefined, fileType: enumFileTypes | null, file: FileUpload | null): Promise<IDriveNode> {
        // check parent existence
        let parent;
        if (parentId && parentId !== '') {
            parent = await db.collections!.drives_collection.findOne({ 'id': parentId, 'life.deletedTime': null });
            if (!parent) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Parent node does not exist.'
                });
            }
        } else {
            parent = await db.collections!.drives_collection.findOne({ managerId: requester, parent: null });
            if (!parent) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Default root node not found.'
                });
            }
        }

        // check permission; requester should have access to the parent node
        const groupIds = (await db.collections!.groups_collection.find({
            'children': requester,
            'life.deletedTime': null
        }).toArray()).map(el => el.id);

        if (parent.sharedUsers.filter(el => el.iid === requester && el.write === true).length === 0
            && parent.sharedGroups.filter(el => groupIds.includes(el.iid) && el.write === true).length === 0
            && parent.managerId !== requester) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }

        let fileEntry: IFile | null = null;
        if (file && fileType) {
            // check duplicates, there should not be a same folder in this path
            const children = await db.collections!.drives_collection.find({ 'parent': parentId, 'life.deletedTime': null }).toArray();
            if (children.filter(el => el.type === enumDriveNodeTypes.FILE).map(el => el.name).includes(file?.filename)) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'File already exists.'
                });
            }
            fileEntry = await fileCore.uploadFile(requester, null, requester, file, description, fileType, enumFileCategories.USER_REPO_FILE, []);
        } else {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'File or filetype not valid.'
            });
        }

        const fileDriveId = uuid();
        const driveEntry: IDriveNode = {
            id: fileDriveId,
            path: parent.path.concat(fileDriveId) ?? [],
            managerId: requester,
            restricted: false,
            name: file?.filename,
            description: description,
            fileId: fileEntry.id,
            type: enumDriveNodeTypes.FILE,
            parent: parent.id,
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

        // update parent
        await db.collections!.drives_collection.findOneAndUpdate({ id: parent.id }, {
            $push: { children: driveEntry.id }
        });

        return driveEntry;
    }

    public async createRecursiveDrives(requester: string, parentId: string, files: any[], paths: string[][]) {

        const createdDrives: any[] = [];
        for (let i = 0; i < files.length; i++) {
            let currentParent = parentId;
            for (let j = 0; j < paths[i].length - 1; j++) {
                const existing = await db.collections!.drives_collection.findOne({ 'parent': currentParent, 'name': paths[i][j], 'life.deletedTime': null });
                if (!existing) {
                    const res = await this.createDriveFolderNode(requester, paths[i][j], currentParent, false, undefined);
                    currentParent = res.id;
                    createdDrives.push(res);
                } else {
                    currentParent = existing.id;
                    createdDrives.push(existing);
                }
            }
            const existing = await db.collections!.drives_collection.findOne({ 'parent': currentParent, 'name': files[i].filename, 'life.deletedTime': null });
            if (!existing) {
                const res = await this.createDriveFileNode(requester, currentParent, undefined, (files[i].filename.split('.').pop() || '').toUpperCase(), files[i]);
                createdDrives.push(res);
            }
        }

        console.log('length', createdDrives.length);
        return createdDrives;
    }

    /**
     * Get the drive nodes of a user, including own drives and shared drives.
     *
     * @param requester - The id of the requester.
     * @param rootId - The id of the root drive if specified.
     *
     * @return Record<string, IDriveNode[] - An object where key is the user Id and value is the list of drive nodes.
     */
    public async getDriveNodes(requester: string, rootId?: string): Promise<Record<string, IDriveNode[]>> {
        // check user exist
        const user = await db.collections!.users_collection.findOne({ 'id': requester, 'life.deletedTime': null });
        if (!user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'User does not exist.'
            });
        }
        // check user groups
        const groupIds = (await db.collections!.groups_collection.find({
            'children': requester,
            'life.deletedTime': null
        }).toArray()).map(el => el.id);

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
                // filtered the permission objects
                if (user.type !== enumUserTypes.ADMIN && drive.managerId !== user.id) {
                    drive.sharedUsers = drive.sharedUsers.filter((el: { iid: string; }) => el.iid === requester);
                    drive.sharedGroups = drive.sharedGroups.filter((el: any) => groupIds.includes(el));
                }
                resultObject[drives.managerId].push(drive);
            }
            if (drives.drives.filter((el: any) => el.parent === null).length === 0) {
                const rootDrive: any = {
                    id: uuid(),
                    managerId: drives.managerId,
                    restricted: false,
                    name: 'Shared',
                    description: null,
                    fileId: null,
                    type: enumDriveNodeTypes.FOLDER,
                    parent: null,
                    children: [],
                    sharedUsers: [{
                        iid: requester,
                        read: true,
                        write: false,
                        delete: false
                    }],
                    sharedGroups: [],
                    life: {
                        createdTime: Date.now(),
                        createdUser: drives.$managerId,
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {
                    }
                };
                const existingIds = drives.drives.map((el: { id: any; }) => el.id);
                for (const drive of resultObject[drives.managerId]) {
                    if (!existingIds.includes(drive.parent)) {
                        drive.parent = rootDrive.id;
                        rootDrive.children.push(drive.id);
                    }
                }
                resultObject[drives.managerId].push(rootDrive);
            }
        }
        return resultObject;
    }

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
     *
     * @return driveIds - The list of drive ids influenced.
     */
    public async editDriveNodes(requester: string, driveId: string, managerId?: string, name?: string, description?: string, parentId?: string, children?: string[], sharedUsers?: IDrivePermission[], sharedGroups?: IDrivePermission[]): Promise<{ driveIds: string[], drive: any }> {
        const drive = await db.collections!.drives_collection.findOne({ 'id': driveId, 'life.deletedTime': null });
        if (!drive) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Drive does not exist.'
            });
        }

        if (drive.managerId !== requester) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }

        const setObj: any = {};

        if (managerId) {
            const manager = await db.collections!.users_collection.findOne({ 'id': managerId, 'life.deletedTime': null });
            if (!manager) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Manager does not exist.'
                });
            }
            setObj.managerId = manager;
        }

        if (name) {
            setObj.name = name;
        }

        if (parentId) {
            const parentNode = await db.collections!.drives_collection.findOne({ 'id': parentId, 'life.deletedTime': null });
            if (!parentNode) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Parent does not exist.'
                });
            }
            setObj.parent = parentId;
        }

        if (children) {
            const childrenDriveIds: string[] = (await db.collections!.drives_collection.find({ 'life.deletedTime': null }).toArray()).map(el => el.id);
            if (children.some(el => !childrenDriveIds.includes(el))) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Children do not exist.'
                });
            }
            setObj.childeren = children;
        }

        if (sharedUsers) {
            const userIds: string[] = (await db.collections!.users_collection.find({ 'life.deletedTime': null }).toArray()).map(el => el.id);
            if (sharedUsers.map(el => el.iid).some(el => !userIds.includes(el))) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Shared users do not exist.'
                });
            }
            setObj.sharedUsers = sharedUsers;
        }

        if (sharedGroups) {
            const groupIds: string[] = (await db.collections!.groups_collection.find({ 'life.deletedTime': null }).toArray()).map(el => el.id);
            if (sharedGroups.map(el => el.iid).some(el => !groupIds.includes(el))) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Shared groups do not exist.'
                });
            }
            setObj.sharedGroups = sharedGroups;
        }

        if (Object.keys(setObj).length === 0) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'You have to edit at lease one property.'
            });
        }

        // TODO:check sharedUsers and sharedGroups are legal
        const updated = await db.collections!.drives_collection.findOneAndUpdate({ id: driveId }, {
            $set: setObj
        }, {
            returnDocument: 'after'
        });


        // update children drive parameters
        const driveIds: string[] = [];
        if (sharedUsers || sharedGroups || managerId) {
            await this.recursiveFindDrives(drive, [], driveIds);
            const setObjTmp: any = {};
            if (sharedUsers) {
                setObjTmp.sharedUsers = sharedUsers;
            }
            if (sharedGroups) {
                setObjTmp.sharedGroups = sharedGroups;
            }
            if (managerId) {
                setObjTmp.managerId = managerId;
            }
            await db.collections!.drives_collection.updateMany({
                id: { $in: driveIds }
            }, {
                $set: setObjTmp
            });
        } else {
            driveIds.push(driveId);
        }

        // for mv command, edit parent
        if (parentId) {
            const parentNode = await db.collections!.drives_collection.findOne({ 'id': parentId, 'life.deletedTime': null });
            if (parentNode) {
                await db.collections!.drives_collection.findOneAndUpdate({ id: parentId }, {
                    $push: {
                        children: driveId
                    }
                });
                // update children path
                for (const childId of driveIds) {
                    const childNode = await db.collections!.drives_collection.findOne({ id: childId });
                    if (!childNode) {
                        continue;
                    }
                    const path = childNode.path;
                    // eslint-disable-next-line no-constant-condition
                    while (path.length) {
                        if (path[0] !== driveId) {
                            path.shift();
                        }
                        else {
                            break;
                        }
                    }
                    const newPath = parentNode.path.concat(path);
                    await db.collections!.drives_collection.findOneAndUpdate({ id: childId }, {
                        $set: {
                            path: newPath
                        }
                    });
                }
            }
        }

        return {
            driveIds: driveIds,
            drive: updated.value
        };
    }

    /**
     * Delete a file node.
     *
     * @param requester - The id of the requester.
     * @param userId - The id of the user.
     * @param driveNodeId - The id of the file node.
     *
     * @return IDriveNode - The deleted drive.
     */
    public async deleteDriveNode(requester: string, driveId: string): Promise<IDriveNode> {
        const drive = await db.collections!.drives_collection.findOne({ 'id': driveId, 'life.deletedTime': null });
        if (!drive) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Drive does not exist.'
            });
        }
        const driveIds: string[] = [];
        const driveFileIds: string[] = [];
        await this.recursiveFindDrives(drive, driveFileIds, driveIds);
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