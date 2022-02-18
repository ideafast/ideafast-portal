export interface IFieldEntry {
    id: string;
    studyId: string;
    fieldId: string;
    fieldName: string;
    tableName?: string;
    dataType: enumValueType;
    possibleValues?: IValueDescription[];
    stdRules?: IStandardizationRule;
    ontologyPath?: IOntologyPath[];
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

export enum StandardizationSource {
    value = 'value', 
    data = 'data',
    fieldDef = 'fieldDef'
}

export interface IStandardizationRule {
    name: string,
    source: StandardizationSource,
    parameter: string,
    dict: JSON
}

export enum OntologyNodeType {
    STRING = 'string',
    FIELD = 'field'
}

export interface IOntologyPath {
    type: OntologyNodeType,
    value: string
}
