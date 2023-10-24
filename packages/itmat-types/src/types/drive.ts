import { IBase } from './base';

export interface IDriveNode extends IBase {
    managerId: string;
    restricted: boolean; // whether to allow delete on this node. User own folders are protected.
    name: string; // folder name or file name
    description: string | null;
    fileId: string | null; // null for folder
    type: enumDriveNodeTypes;
    parent: string | null; // null for root node
    children: string[]; // ids of the file nodes
    sharedUsers: IDrivePermission[]; // ids of shared users
    sharedGroups: IDrivePermission[]; // ids of shared groups.
}

// this permission is different form data permissions
export interface IDrivePermission {
    iid: string; // userId or userGroupId
    read: boolean;
    write: boolean;
    delete: boolean;
}

export enum enumDriveNodeTypes {
    FOLDER = 'FOLDER',
    FILE = 'FILE'
}
