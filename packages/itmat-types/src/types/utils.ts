import { ZodTypeAny, z } from 'zod';
import { IBase, ZBase } from './base';

// Value verifier
export interface IValueVerifier extends IBase {
    formula: IAST;
    condition: enumConditionOps;
    value: string;
    parameters: Record<string, any>;
}

export enum enumConditionOps {
    NUMERICALEQUAL = 'numerical:=',
    NUMERICALNOTEQUAL = 'numerical:!=',
    NUMERICALLESSTHAN = 'numerical:<',
    NUMERICALGREATERTHAN = 'numerical:>',
    NUMERICALNOTLESSTHAN = 'numerical:>=',
    NUMERICALNOTGREATERTHAN = 'numerical:<=',
    STRINGREGEXMATCH = 'string:=regex=',
    STRINGEQUAL = 'string:=',
    GENERALISNULL = 'general:=null',
    GENERALISNOTNULL = 'general:!=null'
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
    VARIABLE = 'VARIABLE',
    SELF = 'SELF', // the input value
    VALUE = 'VALUE',
    MAP = 'MAP'
}

export enum enumMathOps {
    NUMERICALADD = 'numerical:+',
    NUMERICALMINUS = 'numerical:-',
    NUMERICALMULTIPLY = 'numerical:*',
    NUMERICALDIVIDE = 'numerical:/',
    NUMERICALPOW = 'numerical:^',
    STRINGCONCAT = 'string:+',
    STRINGSUBSTR = 'string:substr',
    TYPECONVERSION = 'string:=>'
}


// zod
export const ZAST: ZodTypeAny = z.lazy(() =>
    z.object({
        type: z.nativeEnum(enumASTNodeTypes),
        operator: z.union([z.nativeEnum(enumMathOps), z.null()]),
        value: z.union([z.string(), z.number(), z.null()]),
        parameters: z.record(z.any()),
        children: z.union([z.array(ZAST), z.null()]) // Assuming you want an array of children.
    })
);

export const ZValueVerifier: ZodTypeAny = z.object({
    formula: ZAST,
    condition: z.nativeEnum(enumConditionOps),
    value: z.string(),
    parameters: z.record(z.any())
}).merge(ZBase);