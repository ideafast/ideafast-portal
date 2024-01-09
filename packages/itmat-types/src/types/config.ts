import { IBase, ILifeCircle } from './base';
import { v4 as uuid } from 'uuid';
import { enumReservedDefs } from './reserved';
import { IFile } from './file';
import { IJobSchedulerConfig, enumJobSchedulerStrategy } from './job';

export interface IConfig extends IBase {
    type: enumConfigType;
    key: string | null; // studyid for study; userid for user; null for system
    properties: ISystemConfig | IStudyConfig | IUserConfig | IDocConfig | ICacheConfig;
}

export enum enumConfigType {
    SYSTEMCONFIG = 'SYSTEMCONFIG',
    STUDYCONFIG = 'STUDYCONFIG',
    USERCONFIG = 'USERCONFIG',
    FILECONFIG = 'FILECONFIG',
    ORGANISATIONCONFIG = 'ORGANISATIONCONFIG',
    DOCCONFIG = 'DOCCONFIG',
    CACHECONFIG = 'CACHECONFIG'
}

export interface ISystemConfig extends IBase {
    defaultBackgroundColor: string; // hex code
    defaultMaximumFileSize: number;
    defaultFileBucketId: string;
    logoLink: string | null; // TODO: fetch file from database;
    logoSize: string[]; // width * height
    archiveAddress: string;
    defaultEventTimeConsumptionBar: number[];
    jobSchedulerConfig: IJobSchedulerConfig;
    defaultUserExpireDays: number;
}

export interface IStudyConfig extends IBase {
    defaultStudyProfile: string | null;
    defaultMaximumFileSize: number;
    defaultMaximumProfileSize: number;
    defaultRepresentationForMissingValue: string;
    defaultFileColumns: any;
    defaultFileColumnsPropertyColor: string | null;
    defaultFileDirectoryStructure: {
        pathLabels: string[],
        description: string | null
    },
    defaultVersioningKeys: string[]; // data clips with same values of such keys will be considered as the same values with different versions
}

export interface IUserConfig extends IBase {
    defaultUserExpiredDays: number
    defaultMaximumFileSize: number;
    defaultMaximumFileRepoSize: number;
    defaultMaximumRepoSize: number;
    defaultMaximumProfileSize: number;
    defaultFileBucketId: string;
}

export interface IOrganisationConfig extends IBase {
    defaultMaximumProfileSize: number;
    defaultFileBucketId: string;
}

export interface ICacheConfig extends IBase {
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
        logoSize: ['24px', '24px'],
        archiveAddress: '',
        defaultEventTimeConsumptionBar: [50, 100],
        jobSchedulerConfig: {
            strategy: enumJobSchedulerStrategy.FIFO,
            usePriority: true,
            // for errored jobs
            reExecuteFailedJobs: false,
            failedJobDelayTime: 30 * 60 * 1000, // unit timestamps
            maxAttempts: 10 // the number of attempts should be stored in history
        },
        defaultUserExpireDays: 90
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
        defaultRepresentationForMissingValue: '99999',
        defaultFileColumns: [],
        defaultFileColumnsPropertyColor: 'black',
        defaultFileDirectoryStructure: {
            pathLabels: [],
            description: null
        },
        defaultVersioningKeys: []
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
        defaultMaximumRepoSize: 10 * 1024 * 1024 * 1024, // 10GB
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
            PROFILE_FILE: 'PROFILE_FILE' // file should be images
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
    };

    public readonly cacheConfig: ICacheConfig = {
        id: uuid(),
        life: {
            createdTime: Date.now(),
            createdUser: enumReservedDefs.SYSTEMAGENT,
            deletedTime: null,
            deletedUser: null
        },
        metadata: {},
        defaultFileBucketId: 'cache'
    };
}

export const defaultSettings = Object.freeze(new DefaultSettings());
