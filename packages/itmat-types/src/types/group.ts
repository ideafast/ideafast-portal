import { IBase } from './base';

export interface IGroupNode extends IBase {
    studyId: string | null; // null by default, used further for merging groups and roles
    managerId: string;
    nameOrId: string; // name for group or id for user
    type: enumGroupNodeTypes;
    description: string | null;
    parentId: string | null; // null for root node
    children: string[]; // the ids of childen groups
}

export enum enumGroupNodeTypes {
    USER = 'USER',
    GROUP = 'GROUP'
}