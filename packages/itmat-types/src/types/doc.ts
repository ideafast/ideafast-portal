import { IBase } from './base';

export interface IDoc extends IBase {
    title: string;
    type: enumDocTypes;
    tag: string;
    fileId: string; // the url of the file
    priority: number;
    attachments: string[]; // the list of urls of the attachments
}

export enum enumDocTypes {
    HOMEPAGE = 'HOMEPAGE',
    GENERAL = 'GENERAL'
}
