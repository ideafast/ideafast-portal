import { ZCategoricalOption, enumASTNodeTypes, enumConditionOps, enumDataTypes, enumMathOps, enumStudyRoles } from '@itmat-broker/itmat-types';
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { fileCore } from '../../core/fileCore';
import { dataCore } from '../../core/dataCore';
import { studyCore } from '../../core/studyCore';
import { baseProcedure } from '../../log/trpcLogHelper';
import { permissionCore } from '../../core/permissionCore';
import { parseJsonOrString } from '../../utils/file';
import fs from 'fs';

const createContext = () => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();


export const ZAST: any = z.lazy(() => z.object({
    type: z.nativeEnum(enumASTNodeTypes),
    operator: z.union([z.nativeEnum(enumMathOps), z.null()]),
    value: z.union([z.number(), z.string(), z.null()]),
    parameters: z.any(),
    children: z.union([z.array(ZAST), z.null()]) // null for lead node; OPERATION type should not be a lead node.
}));

export const ZValueVerifier = z.object({
    formula: ZAST,
    condition: z.nativeEnum(enumConditionOps),
    value: z.union([z.string(), z.number()]),
    parameters: z.any()
});

export const ZFieldProperty = z.object({
    name: z.string(),
    verifier: z.optional(z.union([z.array(z.array(ZValueVerifier)), z.null()])),
    description: z.optional(z.union([z.string(), z.null()])),
    required: z.boolean()
});

export const ZDataClipInput = z.object({
    fieldId: z.string(),
    value: z.string(),
    timestamps: z.optional(z.number()),
    properties: z.optional(z.any())
});



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
        projectId: z.optional(z.string()),
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
    /**
     * Create a field of a study. To adjust to data versioning, create an existing field wil not throw an error.
     *
     * @param studyId - The id of the study.
     * @param fieldName - The name of the field.
     * @param fieldId - The value of the id of the field. Should be unique.
     * @param description - The description of the field.
     * @param dataType - The dataType of the field.
     * @param categoricalOptions - The options of the field if the field is a categorical field.
     * @param unit - The unit of the field.
     * @param comments - The comments of the field.
     * @param verifier - The verifier of the field.
     * @param properties - The properties of the field.
     *
     * @return IField
     */
    createStudyField: baseProcedure.input(z.object({
        studyId: z.string(),
        fieldName: z.string(),
        fieldId: z.string(),
        description: z.optional(z.string()),
        dataType: z.nativeEnum(enumDataTypes),
        categoricalOptions: z.optional(z.array(ZCategoricalOption)),
        unit: z.optional(z.string()),
        comments: z.optional(z.string()),
        verifier: z.optional(z.array(z.array(ZValueVerifier))),
        properties: z.optional(z.array(ZFieldProperty))
    })).mutation(async (opts: any) => {
        // check permission
        await permissionCore.checkDataPermissionByUser(opts.ctx.req.user.id, opts.input);
        return await dataCore.createField(opts.ctx.req.user.id, {
            studyId: opts.input.studyId,
            fieldName: opts.input.fieldName,
            fieldId: opts.input.fieldId,
            description: opts.input.description,
            dataType: opts.input.dataType,
            categoricalOptions: opts.input.categoricalOptions,
            unit: opts.input.unit,
            comments: opts.input.comments,
            verifier: opts.input.verifier,
            properties: opts.input.properties
        });
    }),
    /**
     * Delete a field of a study.
     *
     * @param studyId - The id of the stduy.
     * @param fieldId - The id of the field.
     *
     * @return IGenericResponse
     */
    deleteStudyField: baseProcedure.input(z.object({
        studyId: z.string(),
        fieldId: z.string()
    })).mutation(async (opts: any) => {
        await permissionCore.checkDataPermissionByUser(opts.ctx.req.user.id, opts.input);
        return await dataCore.deleteField(
            opts.ctx.req.user.id,
            opts.input.studyId,
            opts.input.fieldId
        );
    }),

    /**
     * Delete data of a study. We add a deleted document in the database.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     * @param documentId - The id of the mongo document.
     *
     * @return IGenreicResponse - The object of IGenericResponse.
     */
    deleteStudyData: baseProcedure.input(z.object({
        studyId: z.string(),
        documentId: z.string()
    })).mutation(async (opts: any) => {
        return await dataCore.deleteData(
            opts.ctx.req.user.id,
            opts.input.studyId,
            opts.input.documentId
        );
    }),

    /**
     * Create a data version of a study.
     *
     * @param studyId - The id of the study.
     * @param version - The name of the new data version. Recommend for x.y.z
     * @param tag - The tag of the new data version.
     *
     * @return IStudyDataVersion
     */
    createStudyDataVersion: baseProcedure.input(z.object({
        studyId: z.string(),
        version: z.string(),
        tag: z.optional(z.string())
    })).mutation(async (opts: any) => {
        await permissionCore.checkOperationPermissionByUser(opts.ctx.req.user.id, opts.input.studyId, enumStudyRoles.STUDY_MANAGER);
        return await dataCore.createDataVersion(
            opts.ctx.req.user.id,
            opts.input.studyId,
            opts.input.version,
            opts.input.tag
        );
    }),
    getFiles: baseProcedure.input(z.object({
        studyId: z.string(),
        versionId: z.union([z.string(), z.null()]),
        aggregation: z.optional(z.any()),
        useCache: z.boolean(),
        forceUpdate: z.boolean(),
        readable: z.optional(z.boolean())
    })).query(async (opts: any) => {
        const time1 = Date.now();
        const user = opts.ctx.req?.user ?? opts.ctx.user;
        const study = (await studyCore.getStudies(opts.input.studyId))[0];
        // get the versions
        const availableDataVersions: Array<string | null> = !opts.input.versionId ? (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id)
            : study.dataVersions.filter((__unused__el, index) => index <= study.dataVersions.findIndex(el => el.id === opts.input.versionId)).map(el => el.id);
        if (opts.input.versionId === null) {
            availableDataVersions.push(null);
        }
        const fields = await dataCore.getStudyFields(opts.input.studyId, availableDataVersions, null);
        const filteredFieldIds = fields.filter(el => el.dataType === enumDataTypes.FILE).map(el => el.fieldId);
        const fileDataClips = await dataCore.getData(user.id, opts.input.studyId, filteredFieldIds, availableDataVersions, opts.input.aggregation, opts.input.useCache, opts.input.forceUpdate);
        const time2 = Date.now();
        const res = await fileCore.findFiles(fileDataClips.map((el: { value: any; }) => el.value), opts.input.readable);
        const time3 = Date.now();
        console.log(time2 - time1, time3 - time2);
        return res;
    }),
    /**
     * Get the data of a study.
     *
     * @param studyId - The id of the study.
     * @param versionId - The id of the data version. By default not specified for the latest version.
     * @param aggregation - The aggregation pipeline. Used for data post preocessing.
     * @param fieldIds - The list of fields to return.
     * @param useCache - Whether to use fetch the data from cache.
     * @param forceUpdate - Whether to update the cache with the results from this call.
     *
     * @return Partial<IData>[] - The list of objects of Partial<IData>
     */
    getData: baseProcedure.input(z.object({
        studyId: z.string(),
        versionId: z.optional(z.union([z.string(), z.null()])),
        aggregation: z.optional(z.any()),
        fieldIds: z.optional(z.union([z.array(z.string()), z.null()])),
        useCache: z.optional(z.boolean()),
        forceUpdate: z.optional(z.boolean()),
        formatted: z.optional(z.string())
    })).query(async (opts: any) => {
        const user = opts.ctx.req.user;
        if (opts.input.fieldIds) {
            for (const fieldId of opts.input.fieldIds) {
                await permissionCore.checkDataPermissionByUser(user.id, { fieldId: fieldId });
            }
        }
        const study = (await studyCore.getStudies(opts.input.studyId))[0];
        // get the versions
        const availableDataVersions: Array<string | null> = !opts.input.versionId ? (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id)
            : study.dataVersions.filter((__unused__el, index) => index <= study.dataVersions.findIndex(el => el.id === opts.input.versionId)).map(el => el.id);
        if (opts.input.versionId === null) {
            availableDataVersions.push(null);
        }
        let filteredFieldIds = (await dataCore.getStudyFields(opts.input.studyId, availableDataVersions, null)).map(el => el.fieldId);
        if (opts.input.fieldIds) {
            filteredFieldIds = filteredFieldIds.filter(el => opts.input.fieldIds.includes(el));
        }
        return await dataCore.getData(user.id, opts.input.studyId, filteredFieldIds, availableDataVersions, opts.input.aggregation, opts.input.useCache, opts.input.forceUpdate);
    }),
    /**
     * Get the data of a study filtered by dataVersion.
     *
     * @param studyId - The id of the study.
     * @param versionId - The id of the data version. By default not specified for the latest version.
     * @param aggregation - The aggregation pipeline. Used for data post preocessing.
     * @param fieldIds - The list of fields to return.
     * @param useCache - Whether to use fetch the data from cache.
     * @param forceUpdate - Whether to update the cache with the results from this call.
     *
     * @return Partial<IData>[] - The list of objects of Partial<IData>
     */
    getDataLatest: baseProcedure.input(z.object({
        studyId: z.string(),
        versionId: z.optional(z.union([z.string(), z.null()])),
        aggregation: z.optional(z.any()),
        fieldIds: z.optional(z.union([z.array(z.string()), z.null()])),
        useCache: z.optional(z.boolean()),
        forceUpdate: z.optional(z.boolean())
    })).query(async (opts: any) => {
        const user = opts.ctx.req.user;
        const study = (await studyCore.getStudies(opts.input.studyId))[0];
        // get the versions
        const availableDataVersions: Array<string | null> = !opts.input.versionId ? (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id)
            : study.dataVersions.filter((__unused__el, index) => index <= study.dataVersions.findIndex(el => el.id === opts.input.versionId)).map(el => el.id);
        if (opts.input.versionId === null) {
            availableDataVersions.push(null);
        }
        const fieldIds = (await dataCore.getStudyFields(opts.input.studyId, availableDataVersions, null)).map(el => el.fieldId).filter(el => opts.input.fieldIds.includes(el));
        const aggregation = {
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
        };
        console.log(fieldIds);
        return await dataCore.getData(user.id, opts.input.studyId, fieldIds, availableDataVersions, aggregation, opts.input.useCache, opts.input.forceUpdate);
    }),
    getFile: baseProcedure.input(z.object({
        fileId: z.string()
    })).query(async (opts: any) => {
        return dataCore.getFile(opts.input.fileId);
    }),
    /**
     * Get the data of a study.
     *
     * @param studyId - The id of the study.
     * @param fieldIds - The list of regular expressions of fields to return.
     * @param versionId - The version id of the data.
     * @param aggregation - The pipeline of the data aggregation.
     * @param useCache - Whether to use the cached data.
     * @param forceUpdate - Whether to force update the cache.
     *
     * @return Partial<IData>[] - The list of objects of Partial<IData>
     */
    getStudyData: baseProcedure.input(z.object({
        studyId: z.string(),
        fieldIds: z.optional(z.array(z.string())),
        versionId: z.optional(z.union([z.string(), z.null()])),
        aggregation: z.optional(z.any()),
        useCache: z.optional(z.boolean()),
        forceUpdate: z.optional(z.boolean())
    })).query(async (opts: any) => {
        const study = (await studyCore.getStudies(opts.input.studyId))[0];
        // get the versions
        const availableDataVersions: Array<string | null> = !opts.input.versionId ? (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id)
            : study.dataVersions.filter((__unused__el, index) => index <= study.dataVersions.findIndex(el => el.id === opts.input.versionId)).map(el => el.id);
        if (opts.input.versionId === null) {
            availableDataVersions.push(null);
        }
        await dataCore.getData(
            opts.ctx.req.user.id,
            opts.input.studyId,
            opts.input.fieldIds,
            availableDataVersions,
            opts.input.aggregation,
            opts.input.useCache,
            opts.input.forceUpdate
        );
    }),
    /**
     * Upload data clips to a study.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     * @param data - The list of data clips.
     *
     * @return IGenericResponse - The list of objects of IGenericResponse
     */
    uploadStudyData: baseProcedure.input(z.object({
        studyId: z.string(),
        data: z.array(ZDataClipInput)
    })).mutation(async (opts: any) => {
        // permission check will be done inside the function
        return await dataCore.uploadData(
            opts.ctx.req.user.id,
            opts.input.studyId,
            opts.input.data
        );
    }),
    /**
     * Upload a data file.
     *
     * @param studyId - The id of the study.
     * @param file - The file to upload.
     * @param properties - The properties of the file. Need to match field properties if defined.
     * @param fieldId - The id of the field.
     *
     * @return IData
     */
    uploadStudyFileData: baseProcedure.input(z.object({
        studyId: z.string(),
        file: z.array(z.object({
            path: z.any(),
            filename: z.string(),
            mimetype: z.optional(z.string()),
            size: z.number()
            // ... other validation ...
        })),
        properties: z.optional(z.any()),
        fieldId: z.string()
    })).mutation(async (opts: any) => {
        try {
            return await dataCore.uploadFileData(
                opts.ctx.req.user.id,
                opts.input.studyId,
                opts.input.file[0],
                opts.input.fieldId,
                parseJsonOrString(opts.input.properties)
            );
        } finally {
            // Cleanup: Delete the temporary file from the disk
            if (opts.input.file) {
                const filePath = opts.input.file[0].path;
                if (fs.existsSync(filePath)) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error('Error deleting temporary file:', filePath, err);
                        }
                    });
                }
            }
        }
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