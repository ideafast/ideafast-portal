import { IResetPasswordRequest, IUser, ZBase, ZCategoricalOption, enumDataTypes, enumDocTypes, enumFileCategories, enumFileTypes, enumUserTypes } from '@itmat-broker/itmat-types';
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { custom, z } from 'zod';
import { userCore } from '../../graphql/core/userCore';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../../graphql/errors';
import { makeGenericReponse } from '../../graphql/responses';
import bcrypt from 'bcrypt';
import * as mfa from '../../utils/mfa';
import { mailer } from '../../emailer/emailer';
import { decryptEmail, encryptEmail, makeAESIv, makeAESKeySalt } from '../../encryption/aes';
import config from '../../utils/configManager';
import { Logger } from '@itmat-broker/itmat-commons';
import { v4 as uuid } from 'uuid';
import { Readable } from 'stream';
import QRCode from 'qrcode';
import tmp from 'tmp';
import { FileUpload } from 'graphql-upload-minimal';
import { type } from 'os';
import { fileCore } from '../../graphql/core/fileCore';
import { docCore } from '../../graphql/core/docCore';
import { dataCore } from '../../graphql/core/dataCore';
import { studyCore } from '../../graphql/core/studyCore';
import { baseProcedure } from '../../log/trpcLogHelper';

const createContext = ({
    req,
    res
}: trpcExpress.CreateExpressContextOptions) => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const dataRouter = t.router({
    /**
     * Get the list of fields of a study.
     *
     * @param studyId - The id of the study.
     * @param projectId - The id of the project.
     * @param versionId - The id of the version. By default, we will return data until this version. If not specificed, will return the latest versioned data.
     *
     * @return IField - The list of objects of IField.
     */
    getStudyFields: baseProcedure.input(z.object({
        studyId: z.string(),
        projectId: z.union([z.string(), z.null()]),
        versionId: z.optional(z.union([z.string(), z.null()]))
    })).query(async (opts: any) => {
        const study = (await studyCore.getStudies(opts.input.studyId))[0];
        // get the versions
        const availableDataVersions: Array<string | null> = !opts.input.versionId ? (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id)
            : study.dataVersions.filter((__unused__el, index) => index <= study.dataVersions.findIndex(el => el.id === opts.input.versionId)).map(el => el.id);
        if (opts.input.versionId === null) {
            availableDataVersions.push(null);
        }
        return await dataCore.getStudyFields(opts.input.studyId, availableDataVersions, null);
    }),
    // createStudyField: baseProcedure.input(z.object({
    //     requester: z.string(),
    //     fieldInput: {
    //         studyId: z.string(),
    //         fieldName: z.string(),
    //         fieldId: z.string(),
    //         description: z.union([z.string(), z.null()]),
    //         tableName: z.union([z.string(), z.null()]),
    //         dataType: z.nativeEnum(enumDataTypes),
    //         categoricalOptions: z.union([z.array(ZCategoricalOption), z.null()]),
    //         unit: z.union([z.string(), z.null()]),
    //         comments: z.union([z.string(), z.null()]),
    //         verifier: ValueVerifierInput[][] | null,
    //         properties: IFieldPropert[] | null
    //     }
    // }))
    getFiles: baseProcedure.input(z.object({
        studyId: z.string(),
        versionId: z.union([z.string(), z.null()]),
        aggregation: z.optional(z.any()),
        useCache: z.boolean(),
        forceUpdate: z.boolean()
    })).query(async (opts: any) => {
        const user = opts.ctx.req.user;
        const study = (await studyCore.getStudies(opts.input.studyId))[0];
        // get the versions
        const availableDataVersions: Array<string | null> = !opts.input.versionId ? (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id)
            : study.dataVersions.filter((__unused__el, index) => index <= study.dataVersions.findIndex(el => el.id === opts.input.versionId)).map(el => el.id);
        if (opts.input.versionId === null) {
            availableDataVersions.push(null);
        }
        const fields = await dataCore.getStudyFields(opts.input.studyId, availableDataVersions, null);
        const filteredFieldIds = fields.filter(el => el.dataType === enumDataTypes.FILE).map(el => el.fieldId);
        return await dataCore.getData(user.id, opts.input.studyId, filteredFieldIds, availableDataVersions, opts.input.aggregation, opts.input.useCache, opts.input.forceUpdate);
    }),
    getData: baseProcedure.input(z.object({
        studyId: z.string(),
        versionId: z.union([z.string(), z.null()]),
        aggregation: z.optional(z.any()),
        useCache: z.boolean(),
        forceUpdate: z.boolean()
    })).query(async (opts: any) => {
        const user = opts.ctx.req.user;
        const study = (await studyCore.getStudies(opts.input.studyId))[0];
        // get the versions
        const availableDataVersions: Array<string | null> = !opts.input.versionId ? (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id)
            : study.dataVersions.filter((__unused__el, index) => index <= study.dataVersions.findIndex(el => el.id === opts.input.versionId)).map(el => el.id);
        if (opts.input.versionId === null) {
            availableDataVersions.push(null);
        }
        const fieldIds = (await dataCore.getStudyFields(opts.input.studyId, availableDataVersions, null)).map(el => el.fieldId);
        return await dataCore.getData(user.id, opts.input.studyId, fieldIds, availableDataVersions, opts.input.aggregation, opts.input.useCache, opts.input.forceUpdate);
    }),
    getFile: baseProcedure.input(z.object({
        fileId: z.string()
    })).query(async (opts: any) => {
        return dataCore.getFile(opts.input.fileId);
    })
});

/** Example of data versioning aggregation */
/**
{
            clinical: [
                { operationName: 'Group', params: { keys: ['fieldId', 'properties.Participant ID', 'properties.Visit ID'], skipUnmatch: true } },
                { operationName: 'LeaveOne', params: { scoreFormula: { type: enumASTNodeTypes.VARIABLE, operator: null, value: 'life.createdTime', parameters: {}, children: null }, isDescend: true } },
                {
                    operationName: 'Filter', params: {
                        filters: {
                            deleted: {
                                formula: {
                                    type: enumASTNodeTypes.VARIABLE,
                                    operation: null,
                                    value: 'life.deletedTime',
                                    parameter: {},
                                    children: null
                                },
                                condition: enumConditionOps.GENERALISNULL,
                                value: '',
                                parameters: {}
                            }
                        }
                    }
                }
            ],
            device: [
                { operationName: 'Group', params: { keys: ['properties.Participant ID', 'properties.Device Type', 'properties.Device ID', 'properties.Start Date', 'properties.End Date'], skipUnmatch: true } },
                { operationName: 'LeaveOne', params: { scoreFormula: { type: enumASTNodeTypes.VARIABLE, operator: null, value: 'life.createdTime', parameters: {}, children: null }, isDescend: true } },
                {
                    operationName: 'Filter', params: {
                        filters: {
                            deleted: {
                                formula: {
                                    type: enumASTNodeTypes.VARIABLE,
                                    operation: null,
                                    value: 'life.deletedTime',
                                    parameter: {},
                                    children: null
                                },
                                condition: enumConditionOps.GENERALISNULL,
                                value: '',
                                parameters: {}
                            }
                        }
                    }
                }
                // { operationName: 'Concat', params: { concatKeys: ['properties', 'life'] } }
            ]
        }

*/