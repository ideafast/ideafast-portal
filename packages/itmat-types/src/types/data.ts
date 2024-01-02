import { z } from 'zod';
import { IBase, ZBase } from './base';
import { IValueVerifier } from './utils';

export interface IField extends IBase {
    studyId: string;
    fieldName: string;
    fieldId: string;
    description: string | null;
    dataType: enumDataTypes;
    categoricalOptions: ICategoricalOption[] | null;
    unit: string | null;
    comments: string | null;
    dataVersion: string | null;
    verifier: IValueVerifier[][] | null;
    properties: IFieldProperty[] | null; // mostly used for file ddata
}

export interface IFieldProperty {
    name: string;
    verifier: IValueVerifier[][] | null;
    description: string | null;
    required: boolean;
}

export enum enumDataTypes {
    INTEGER = 'INTEGER',
    DECIMAL = 'DECIMAL',
    STRING = 'STRING',
    BOOLEAN = 'BOOLEAN',
    DATETIME = 'DATETIME',
    FILE = 'FILE',
    JSON = 'JSON',
    CATEGORICAL = 'CATEGORICAL'
}

export interface ICategoricalOption extends IBase {
    code: string;
    description: string;
}

export const ZCategoricalOption = z.object({
    code: z.string(),
    description: z.string()
});

export interface IData extends IBase {
    studyId: string;
    fieldId: string;
    dataVersion: string | null;
    value: any;
    properties: Record<string, any>;
}

export interface IOntologyTree extends IBase {
    studyId: string;
    name: string,
    tag: string, // could be the version
    routes: IOntologyRoute[]
}

export interface IOntologyRoute extends IBase {
    path: string[],
    name: string,
    fieldId: string,
}
