import { IBase } from "./base";

// Value verifier
export interface IValueVerifier extends IBase {
    formula: IAST;
    condition: enumConditionOps;
    value: string;
    parameters: Record<string, any>;
}

export enum enumConditionOps {
    NUMERICALEQUAL = '=',
    NUMERICALNOTEQUAL = '!=',
    NUMERICALLESSTHAN = '<',
    NUMERICALGREATERTHAN = '>',
    NUMERICALNOTLESSTHAN = '>=',
    NUMERICALNOTGREATERTHAN = '<=',
    STRINGREGEXMATCH = '=regex=',
    STRINGEQUAL = '='
}

export interface IAST {
    type: enumASTNodeTypes;
    operator: enumMathOps | null,
    value: string | number | null;
    parameters: Record<string, any>;
    children: IAST[] | null; // null for lead node; OPERATION type should not be a lead node.
}

export enum enumASTNodeTypes {
    OPERATION = 'OPERATION',
    // VARIABLE = 'VARIABLE',
    SELF = 'SELF', // the input value
    VALUE = 'VALUE'
}

export enum enumMathOps {
    NUMERICALADD = '+',
    NUMERICALMINUS = '-',
    NUMERICALMULTIPLY = '*',
    NUMERICALDIVIDE = '/',
    NUMERICALPOW = '^',
    STRINGCONCAT = '+',
    STRINGSUBSTR = 'substr',
    TYPECONVERSION = '=>'
}