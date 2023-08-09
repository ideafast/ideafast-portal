import { IBase, ILifeCircle } from './base';
import { v4 as uuid } from 'uuid';
import { enumReservedDefs } from './reserved';
import { IFile } from './file';

export interface IConfig extends IBase {
    type: enumConfigType;
    key: string | null; // studyid for study; userid for user; null for system
    properties: ISystemConfig | IStudyConfig | IUserConfig | IDocConfig;
}

export enum enumConfigType {
    SYSTEMCONFIG = 'SYSTEMCONFIG',
    STUDYCONFIG = 'STUDYCONFIG',
    USERCONFIG = 'USERCONFIG',
    FILECONFIG = 'FILECONFIG',
    ORGANISATIONCONFIG = 'ORGANISATIONCONFIG',
    DOCCONFIG = 'DOCCONFIG'
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
    defaultMaximumProfileSize: number;
    defaultRepresentationForMissingValue: string;
}

export interface IUserConfig extends IBase {
    defaultUserExpiredDays: number
    defaultMaximumFileSize: number;
    defaultMaximumFileRepoSize: number;
    defaultMaximumProfileSize: number;
    defaultFileBucketId: string;
}

export interface IOrganisationConfig extends IBase {
    defaultMaximumProfileSize: number;
    defaultFileBucketId: string;
}

export interface IDocConfig extends IBase {
    defaultFileTypeList: Record<string, string>;
    defaultFileBucketId: string;
}

export interface IDefaultSettings extends IBase {
    systemConfig: ISystemConfig;
    studyConfig: IStudyConfig;
    userConfig: IUserConfig;
    docConfig: IDocConfig;
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
        defaultMaximumProfileSize: 10 * 1024 * 1024, // 10MB
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
        defaultMaximumProfileSize: 10 * 1024 * 1024, // 10MB
        defaultFileBucketId: 'user'
    };

    public readonly docConfig: IDocConfig = {
        id: uuid(),
        life: {
            createdTime: Date.now(),
            createdUser: enumReservedDefs.SYSTEMAGENT,
            deletedTime: null,
            deletedUser: null
        },
        metadata: {},
        defaultFileTypeList: {
            STUDY_DATA_FILE: 'STUDY_DATA_FILE',
            USER_REPO_FILE: 'USER_REPO_FILE',
            PROFILE_FILE: 'PROFILE_FILE', // file should be images
        },
        defaultFileBucketId: 'doc'
    };

    public readonly organisationConfig: IOrganisationConfig = {
        id: uuid(),
        life: {
            createdTime: Date.now(),
            createdUser: enumReservedDefs.SYSTEMAGENT,
            deletedTime: null,
            deletedUser: null
        },
        metadata: {},
        defaultMaximumProfileSize: 10 * 1024 * 1024, // 10MB
        defaultFileBucketId: 'organisation'
    }
}

export const defaultSettings = Object.freeze(new DefaultSettings());
