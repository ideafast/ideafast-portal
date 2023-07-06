import { IBase } from './base';

export interface IFile extends IBase {
    studyId: string | null; // null for system and user file
    userId: string | null; // null for system and study file
    fileName: string;
    fileSize: number;
    description: Record<string, any>;
    uri: string;
    hash: string;
    fileType: enumFileTypes;
    fileCategory: enumFileCategories;
    sharedUsers: string[] | null;
}

export enum enumFileTypes {
    CSV = 'Comma-Separated Values',
    ZIP = 'ZIP',
    RAR = 'Roshal ARchive Format',
    UNKNOWN = 'UNKNOWN',
    MARKDOWN = 'MARKDOWN',
    TXT = 'TXT',
    JSON = 'JSON'
}

export enum enumFileCategories {
    SUBJECTDATAFILE = 'SUBJECTDATAFILE',
    STUDYDATAFILE = 'STUDYDATAFILE',
    USERFILE = 'USERFILE',
    SYSTEMFILE = 'SYSTEMFILE',
    DOCFILE = 'DOCFILE'
}
