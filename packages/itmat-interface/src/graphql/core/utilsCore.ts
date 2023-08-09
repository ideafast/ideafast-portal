import bcrypt from 'bcrypt';
import { db } from '../../database/database';
import config from '../../utils/configManager';
import { GraphQLError } from 'graphql';
import { IUser, enumUserTypes, IOrganisation, IPubkey, defaultSettings, IGenericResponse, enumFileNodeTypes, IFile, IFileNode, enumFileTypes, enumFileCategories, IResetPasswordRequest, enumConfigType, IValueVerifier, IAST, enumASTNodeTypes, enumMathOps, enumConditionOps } from '@itmat-broker/itmat-types';
import { makeGenericReponse } from '../responses';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../errors';
import { FileUpload } from 'graphql-upload-minimal';
import { fileCore } from './fileCore';
import * as mfa from '../../utils/mfa';
import { MarkOptional } from 'ts-essentials';
import { ApolloServerErrorCode } from '@apollo/server/dist/esm/errors';

export class UtilsCore {
    public validValueWithVerifier(value: string | number, verifier: IValueVerifier): boolean {
        const calculatedValue = this.IASTHelper(verifier.formula, value);
        if (verifier.condition === enumConditionOps.NUMERICALEQUAL) {
            return calculatedValue === verifier.value;
        } else if (verifier.condition === enumConditionOps.NUMERICALNOTEQUAL) {
            return calculatedValue !== verifier.value;
        } else if (verifier.condition === enumConditionOps.NUMERICALLESSTHAN) {
            return calculatedValue < verifier.value;
        } else if (verifier.condition === enumConditionOps.NUMERICALGREATERTHAN) {
            return calculatedValue > verifier.value;
        } else if (verifier.condition === enumConditionOps.NUMERICALNOTLESSTHAN) {
            return calculatedValue >= verifier.value;
        } else if (verifier.condition === enumConditionOps.NUMERICALNOTGREATERTHAN) {
            return calculatedValue <= verifier.value;
        } else if (verifier.condition === enumConditionOps.STRINGREGEXMATCH) {
            return new RegExp(verifier.value.toString()).test(calculatedValue.toString());
        } else if (verifier.condition === enumConditionOps.STRINGEQUAL) {
            return calculatedValue === verifier.value;
        }
        return false;
    }

    public IASTHelper(root: IAST, value: number | string): any {
        if (root.type === enumASTNodeTypes.VALUE) {
            return root.value as number;
        }
        if (root.type === enumASTNodeTypes.SELF) {
            return value as number;
        }
        if (root.type === enumASTNodeTypes.OPERATION) {
            if (!root.operator) {
                throw new GraphQLError('OPEARTION node must have an operator', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
            if (root.operator === enumMathOps.NUMERICALADD && root.children && root.children.length === 2) {
                return this.IASTHelper(root.children[0], value) + this.IASTHelper(root.children[1], value);
            } else if (root.operator === enumMathOps.NUMERICALMINUS && root.children && root.children.length === 2) {
                return this.IASTHelper(root.children[0], value) - this.IASTHelper(root.children[1], value);
            } else if (root.operator === enumMathOps.NUMERICALMULTIPLY && root.children && root.children.length === 2) {
                return this.IASTHelper(root.children[0], value) * this.IASTHelper(root.children[1], value);
            } else if (root.operator === enumMathOps.NUMERICALDIVIDE && root.children && root.children.length === 2) {
                return this.IASTHelper(root.children[0], value) / this.IASTHelper(root.children[1], value);
            } else if (root.operator === enumMathOps.NUMERICALPOW && root.children && root.children.length === 2) {
                return Math.pow(this.IASTHelper(root.children[0], value), this.IASTHelper(root.children[1], value));
            } else if (root.operator === enumMathOps.STRINGCONCAT && root.children && root.children.length) {
                return root.children.reduce((a, c) => {
                    return a + this.IASTHelper(c, value).toString();
                }, '');
            } else if (root.operator === enumMathOps.STRINGSUBSTR && root.children && root.children.length === 3) {
                return (this.IASTHelper(root.children[0], value).toString()).substr(this.IASTHelper(root.children[1], value), this.IASTHelper(root.children[2], value));
            } else if (root.operator === enumMathOps.TYPECONVERSION && root.children && root.children.length === 2) {
                const newType = this.IASTHelper(root.children[0], value);
                if (newType === 'INT') {
                    return Math.floor(Number(this.IASTHelper(root.children[0], value)))
                } else if (newType === 'FLOAT') {
                    return parseFloat((this.IASTHelper(root.children[0], value) as string | number).toString());
                } else if (newType === 'STRING') {
                    return this.IASTHelper(root.children[0], value).toString();
                } else {
                    throw new GraphQLError('Type converstion only supports INT, FLOAT and STRING.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
                }
            } else {
                throw new GraphQLError('Operator and children does not match.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            } 
        }

        throw new GraphQLError('Node type must be OPERATION,, SELF or VALUE', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
     
    }

};

export const utilsCore = Object.freeze(new UtilsCore());