import { IBase } from './base';

export interface IFile extends IBase {
    studyId: string | null; // null for system and user file
    userId: string | null; // null for system and study file
    fileName: string;
    fileSize: number;
    description?: string;
    properties: Record<string, any> | null;
    uri: string;
    path: string[];
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
    WEBP = 'WEBP',
    // videos
    MP4 = 'MP4'
}

export enum enumFileCategories {
    STUDY_DATA_FILE = 'STUDY_DATA_FILE',
    STUDY_PROFILE_FILE = 'STUDY_PROFILE_FILE',
    USER_REPO_FILE = 'USER_REPO_FILE',
    USER_PROFILE_FILE = 'USER_PROFILE_FILE',
    DOC_FILE = 'DOC_FILE',
    ORGANISATION_PROFILE_FILE = 'ORGANISATION_PROFILE_FILE',
    CACHE = 'CACHE'
}

export interface FileUpload {
    path: string;
    filename: string;
    mimetype?: string;  // Optional since you used z.optional
    size: number;
    // Include any other properties that you expect to receive
}