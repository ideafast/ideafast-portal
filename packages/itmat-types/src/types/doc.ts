import { IBase } from './base';

export interface IDoc extends IBase {
    title: string;
    type: enumDocTypes;
    description?: string;
    tag?: string;
    studyId: string | null; // enable study-individual documents
    contents?: string; // we store the contents as string for now
    priority: number;
    attachmentFileIds?: string[]; // the list of uris of the attachments
}

export enum enumDocTypes {
    HOMEPAGE = 'HOMEPAGE',
    GENERAL = 'GENERAL',
    STUDYONLY = 'STUDYONLY'
}
