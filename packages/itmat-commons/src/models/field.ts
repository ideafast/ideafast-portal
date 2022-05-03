export interface IFieldEntry {
    id: string;
    studyId: string;
    fieldId: string;
    fieldName: string;
    tableName?: string;
    dataType: enumValueType;
    possibleValues?: IValueDescription[];
    standardization: IStandardization[];
    unit?: string;
    comments?: string;
    dateAdded: string;
    dateDeleted: string | null;
    dataVersion: string | null;
}

export interface IValueDescription {
    id: string;
    code: string;
    description: string
}

export enum enumItemType {
    IMAGE = 'I',
    CLINICAL = 'C'
}

export enum enumValueType {
    INTEGER = 'int',
    DECIMAL = 'dec',
    STRING = 'str',
    BOOLEAN = 'bool',
    DATETIME = 'date',
    FILE = 'file',
    JSON = 'json',
    CATEGORICAL = 'cat'
}

export interface IStandardization {
    id: string,
    name: string,
    metaField?: string,
    stdRules: IStandardizationRule[],
    ontologyPath: IOntologyPath[]
}

export enum StandardizationSource {
    value = 'value',
    data = 'data',
    fieldDef = 'fieldDef',
    inc = 'inc'
}

export interface IStandardizationRule {
    id: string,
    name: string,
    source: StandardizationSource,
    parameter: string,
    // if values are to ignore, this value would not be output
    ignoreValues?: string[],
    dict?: JSON
}

export enum OntologyNodeType {
    STRING = 'STRING',
    FIELD = 'FIELD'
}

export interface IOntologyPath {
    id: string,
    type: OntologyNodeType,
    value: string
}
