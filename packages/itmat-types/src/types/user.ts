import { IBase } from './base';

export enum enumUserTypes {
    ADMIN = 'ADMIN',
    STANDARD = 'STANDARD',
    SYSTEM = 'SYSTEM',
    OBSERVER = 'OBSERVER'
}

export interface IUser extends IBase {
    username: string;
    email: string;
    firstname: string;
    lastname: string;
    organisation: string; // id of IOrganisation
    type: enumUserTypes;
    emailNotificationsActivated: boolean;
    resetPasswordRequests: IResetPasswordRequest[];
    password: string;
    otpSecret: string;
    profile: string | null; // id of the profile image
    description: string | null;
    expiredAt: number;
    fileRepo: IFileNode[];
}

export interface IResetPasswordRequest {
    id: string;
    timeOfRequest: number;
    used: boolean;
}

export interface IOrganisation extends IBase {
    name: string;
    shortname: string | null;
    location: number[] | null;
    profile: string | null; // id of the profile image
}

export interface IFileNode extends IBase {
    value: string; // fileId for files or name for folders
    type: enumFileNodeTypes;
    parent: string | null; // null for root node
    children: string[]; // ids of the file nodes
    sharedUsers: string[];
}

export enum enumFileNodeTypes {
    FOLDER = 'FOLDER',
    FILE = 'FILE'
}
