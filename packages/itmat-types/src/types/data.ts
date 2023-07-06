import { IBase } from './base';

export interface IField extends IBase {
    studyId: string;
    fieldName: string;
    fieldId: string;
    description: string | null;
    tableName: string | null; // used for recognition for uploaders
    dataType: enumDataTypes;
    categoricalOptions: ICategoricalOption[] | null;
    unit: string | null;
    comments: string | null;
    dataVersion: string | null;
    verifier: IFieldValueVerifier | null;
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
    value: string;
    description: string;
}

export interface IFieldValueVerifier extends IBase {
    formula: IAST;
    condition: enumConditionOps;
    value: number;
    parameters: Array<number | string>;
}

export enum enumConditionOps {
    EQUAL = '=',
    NOTEQUAL = '!=',
    LESSTHAN = '<',
    GREATERTHAN = '>',
    NOTLESSTHAN = '>=',
    NOTGREATERTHAN = '<='
}

export interface IAST extends IBase {
    type: enumASTNodeTypes;
    op: enumMathOps;
    args: IAST[];
}

export enum enumASTNodeTypes {
    OPERATION = 'OPERATION',
    VARIABLE = 'VARIABLE',
    VALUE = 'VALUE'
}

export enum enumMathOps {
    ADD = '+',
    MINUS = '-',
    MULTIPLY = '*',
    DIVIDE = '/',
    POW = '^'
}

export interface IData extends IBase {
    studyId: string;
    subjectId: string;
    fieldId: string;
    visitId: string;
    dataVersion: string | null;
    value: any;
    timestamps: number | null;
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
