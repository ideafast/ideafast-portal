import { IBase, ILifeCircle } from './base';
import { v4 as uuid } from 'uuid';
import { enumReservedDefs } from './reserved';

export interface IConfig extends IBase {
    type: enumConfigType;
    key: string | null; // studyid for study; userid for user; null for system
    properties: ISystemConfig | IStudyConfig | IUserConfig;
}

export enum enumConfigType {
    SYSTEMCONFIG = 'SYSTEMCONFIG',
    STUDYCONFIG = 'STUDYCONFIG',
    USERCONFIG = 'USERCONFIG',
}

export interface ISystemConfig extends IBase {
    defaultBackgroundColor: string; // hex code
    defaultMaximumFileSize: number;
    defaultFileBucketId: string;
    logoLink: string | null; // TODO: fetch file from database;
    logoSize: number[] // width * height
}

export interface IStudyConfig extends IBase {
    defaultStudyProfile: string | null;
    defaultMaximumFileSize: number;
    defaultRepresentationForMissingValue: string;
}

export interface IUserConfig extends IBase {
    defaultUserExpiredDays: number
    defaultMaximumFileSize: number;
    defaultMaximumFileRepoSize: number;
    defaultFileBucketId: string;
}

export interface IDefaultSettings extends IBase {
    systemConfig: ISystemConfig;
    studyConfig: IStudyConfig;
    userConfig: IUserConfig;
}

// default settings
export class DefaultSettings implements IDefaultSettings {
    public readonly id: string = uuid();
    public readonly life: ILifeCircle = {
        createdTime: Date.now(),
        createdUser: enumReservedDefs.SYSTEMAGENT,
        deletedTime: null,
        deletedUser: null
    };
    public readonly metadata: Record<string, any> = {};

    public readonly systemConfig: ISystemConfig = {
        id: uuid(),
        life: {
            createdTime: Date.now(),
            createdUser: enumReservedDefs.SYSTEMAGENT,
            deletedTime: null,
            deletedUser: null
        },
        metadata: {},
        defaultBackgroundColor: '#FFFFFF',
        defaultMaximumFileSize: 1 * 1024 * 1024 * 1024, // 1 GB
        defaultFileBucketId: 'system',
        logoLink: null,
        logoSize: [224, 224]
    };

    public readonly studyConfig: IStudyConfig = {
        id: uuid(),
        life: {
            createdTime: Date.now(),
            createdUser: enumReservedDefs.SYSTEMAGENT,
            deletedTime: null,
            deletedUser: null
        },
        metadata: {},
        defaultStudyProfile: null,
        defaultMaximumFileSize: 8 * 1024 * 1024 * 1024, // 8 GB,
        defaultRepresentationForMissingValue: '99999'
    };

    public readonly userConfig: IUserConfig = {
        id: uuid(),
        life: {
            createdTime: Date.now(),
            createdUser: enumReservedDefs.SYSTEMAGENT,
            deletedTime: null,
            deletedUser: null
        },
        metadata: {},
        defaultUserExpiredDays: 90,
        defaultMaximumFileSize: 100 * 1024 * 1024, // 100 MB
        defaultMaximumFileRepoSize: 500 * 1024 * 1024, // 500 MB
        defaultFileBucketId: 'user'
    };
}

export const defaultSettings = Object.freeze(new DefaultSettings());
