import { IBase } from './base';
import { IValueVerifier } from './utils';

export interface IFile extends IBase {
    studyId: string | null; // null for system and user file
    userId: string | null; // null for system and study file
    fileName: string;
    fileSize: number;
    description: string | null;
    properties: Record<string, any> | null;
    uri: string;
    hash: string;
    fileType: enumFileTypes;
    fileCategory: enumFileCategories;
    sharedUsers: string[] | null;
}


export enum enumFileTypes {
    CSV = 'CSV',
    ZIP = 'ZIP',
    RAR = 'RAR',
    UNKNOWN = 'UNKNOWN',
    MARKDOWN = 'MARKDOWN',
    TXT = 'TXT',
    JSON = 'JSON',
    PDF = 'PDF',
    DOCX = 'DOCX',
    // images
    JPG = 'JPG',
    JPEG = 'JPEG',
    PNG = 'PNG',
    WEBP = 'WEBP'
}

export enum enumFileCategories {
    STUDY_DATA_FILE = 'STUDY_DATA_FILE',
    STUDY_PROFILE_FILE = 'STUDY_PROFILE_FILE',
    USER_REPO_FILE = 'USER_REPO_FILE',
    USER_PROFILE_FILE = 'USER_PROFILE_FILE',
    DOC_FILE = 'DOC_FILE',
    ORGANISATION_PROFILE_FILE = 'ORGANISATION_PROFILE_FILE'
}
