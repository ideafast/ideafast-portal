import { IBase } from './base';

export enum enumUserTypes {
    ADMIN = 'ADMIN',
    STANDARD = 'STANDARD',
    SYSTEM = 'SYSTEM',
    MANAGER = 'MANAGER',
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
    description: string;
    expiredAt: number | null;
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

