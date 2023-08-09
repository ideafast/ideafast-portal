import { IBase } from './base';
import { IUser } from './user';
import { FileUpload } from 'graphql-upload-minimal';

export interface IStudy extends IBase {
    name: string;
    currentDataVersion: number; // index; dataVersions[currentDataVersion] gives current version; // -1 if no data
    dataVersions: IStudyDataVersion[];
    description: string | null;
    profile: string | null;
    groupList: IStudyGroupNode[];
}

export interface IStudyGroupNode extends IBase {
    name: string;
    type: enumGroupNodeTypes;
    description: string | null;
    parent: string | null; // null for root node
    children: IStudyGroupNode[]
}

export enum enumGroupNodeTypes {
    USER = 'USER',
    GROUP = 'GROUP'
}

export interface IStudyDataVersion extends IBase {
    contentId: string; // same contentId = same data
    version: string;
    tag?: string;
}

export enum atomicOperation {
    READ = 'READ',
    WRITE = 'WRITE'
}

export enum IPermissionManagementOptions {
    own = 'own',
    role = 'role',
    job = 'job',
    query = 'query',
    ontologyTrees = 'ontologyTrees'
}

export interface ICombinedPermissions {
    hasPriority: boolean, // if true, skip the check
    roleMatch: Array<Record<string, any>>,
    hasVersioned: boolean,
    dataRE: {
        subjectIds: string[],
        visitIds: string[],
        fieldIds: string[]
    }
}

export interface IPermissionChanges {
    data: {
        subjectIds: string[],
        visitIds: string[],
        fieldIds: string[],
        hasVersioned: boolean,
        operations: atomicOperation[],
        filters: any[]
    },
    manage: {
        [IPermissionManagementOptions.own]: atomicOperation[],
        [IPermissionManagementOptions.role]: atomicOperation[],
        [IPermissionManagementOptions.job]: atomicOperation[],
        [IPermissionManagementOptions.query]: atomicOperation[],
        [IPermissionManagementOptions.ontologyTrees]: atomicOperation[]
    }
}

export interface IRole {
    id: string;
    studyId: string;
    projectId: string | null;
    name: string;
    permissions: {
        data?: {
            subjectIds?: string[];
            visitIds?: string[];
            fieldIds?: string[];
            hasVersioned?: boolean;
            operations?: atomicOperation[];
        },
        manage?: {
            [IPermissionManagementOptions.own]?: atomicOperation[];
            [IPermissionManagementOptions.role]?: atomicOperation[];
            [IPermissionManagementOptions.job]?: atomicOperation[];
            [IPermissionManagementOptions.query]?: atomicOperation[];
            [IPermissionManagementOptions.ontologyTrees]: atomicOperation[];
        }
    };
    description: string | null;
    users: string[];
}


export interface IProject extends IBase {
    studyId: string;
    name: string;
    dataVersion: string | null; // if not null, the data of the project is available only until this version
    patientMapping: { [originalId: string]: string };
}

export interface IDataClip extends IBase {
    studyId: string;
    subjectId: string;
    fieldId: string;
    visitId: string | null; // null for data with no actual visit
    value: string | null; //
    dataVersion: string | null; // null for unversioned data
    timestamps: number | null; // the exact timesamp of this data clip
}

export interface ISubjectDataRecordSummary {
    subjectId: string,
    visitId: string,
    fieldId: string,
    error: string
}

