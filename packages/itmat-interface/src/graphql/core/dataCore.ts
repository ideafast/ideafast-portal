import { GraphQLError } from 'graphql';
import { IField, enumDataTypes, ICategoricalOption, IValueVerifier, IGenericResponse, enumConfigType, defaultSettings, IOntologyTree, IOntologyRoute, IAST, enumConditionOps, enumFileTypes, enumFileCategories, IFieldProperty, IFile, permissionString, IStudyDataVersion, IData, enumASTNodeTypes, IRole, IStudyConfig, enumUserTypes } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../../database/database';
import { errorCodes } from '../errors';
import { permissionCore } from './permissionCore';
import { FileUpload } from 'graphql-upload-minimal';
import { makeGenericReponse } from '../responses';
import { utilsCore } from './utilsCore';
import { fileCore } from './fileCore';
import { z } from 'zod';
import { dataTransformationCore } from './transformationCore';
import { PassThrough } from 'stream';
import { enumCacheStatus } from 'packages/itmat-types/src/types/cache';
import { TRPCError } from '@trpc/server';
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';
import { transcode } from 'buffer';
import fs from 'fs';
import path from 'path';

export interface IDataClipInput {
    fieldId: string;
    value: string;
    timestamps?: number;
    properties?: Record<string, any>;
}

export interface ValueVerifierInput {
    formula: IAST,
    condition: enumConditionOps
    value: string,
    parameters: JSON
}

export const ZValueVerifier = z.object({

});

export class DataCore {
    public async getOntologyTree(studyId: string, treeId: string): Promise<IOntologyTree> {
        /**
         * Get the ontology tree of a study by id.
         *
         * @param studyId - The id of the study.
         * @param treeId - The id of the tree.
         *
         * @return IOntologyTree
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const ontologyTree = await db.collections!.ontologies_collection.findOne({ 'id': treeId, 'studyId': studyId, 'life.deletedTime': null });
        if (!ontologyTree) {
            throw new GraphQLError('Ontology does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        return ontologyTree;
    }

    public async createOntologyTree(requester: string, studyId: string, name: string, tag: string): Promise<IOntologyTree> {
        /**
         * Create an ontology tree.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param name - The name of the tree.
         * @param tag - The tag.
         *
         * @return IOntologyTree
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const ontologyTreeEntry: IOntologyTree = {
            id: uuid(),
            studyId: studyId,
            name: name,
            tag: tag,
            routes: [],
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        await db.collections!.ontologies_collection.insertOne(ontologyTreeEntry);
        return ontologyTreeEntry;
    }

    public async deleteOntologyTree(requester: string, studyId: string, ontologyTreeId: string): Promise<IGenericResponse> {
        /**
         * Delete an ontology tree.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param ontologyTreeId - The id of the ontology tree.
         *
         * @return IGenericResponse
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const ontologyTree = await db.collections!.ontologies_collection.findOne({ 'id': ontologyTreeId, 'studyId': studyId, 'life.deletedTime': null });
        if (!ontologyTree) {
            throw new GraphQLError('Ontology does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        await db.collections!.ontologies_collection.findOneAndUpdate({ 'studyId': studyId, 'id': ontologyTreeId, 'life.deletedTime': null }, {
            $set: {
                'life.deletedTime': Date.now(),
                'life.deletedUser': requester
            }
        });
        return makeGenericReponse(ontologyTreeId, true, undefined, `Ontology tree ${ontologyTreeId} has been deleted.`);
    }

    public async addOntologyRoutes(requester: string, studyId: string, ontologyTreeId: string, routes: { path: string[], name: string, fieldId: string }[]): Promise<IGenericResponse[]> {
        /**
         * Add ontology routes to an ontology tree.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param ontologyTreeId - The id of the ontologyTree.
         * @param routes - The list of ontology routes.
         *
         * @return IGenericResponse[]
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const ontologyTree = await db.collections!.ontologies_collection.findOne({ 'id': ontologyTreeId, 'studyId': studyId, 'life.deletedTime': null });
        if (!ontologyTree) {
            throw new GraphQLError('Ontology does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const existingFieldsIds: string[] = ontologyTree.routes.map(el => el.fieldId);
        const routesTooAdd: IOntologyRoute[] = [];
        const responses: IGenericResponse[] = [];
        for (const route of routes) {
            if (existingFieldsIds.includes(route.fieldId)) {
                responses.push(makeGenericReponse(route.fieldId, false, undefined, `Field ${route.fieldId} aleady exists in the tree.`));
            } else {
                routesTooAdd.push({
                    id: uuid(),
                    name: route.name,
                    path: route.path,
                    fieldId: route.fieldId,
                    life: {
                        createdTime: Date.now(),
                        createdUser: requester,
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {}
                });
                responses.push(makeGenericReponse(route.fieldId, true, undefined, `Field ${route.fieldId} has been added to the tree.`));
            }
        }

        await db.collections!.ontologies_collection.findOneAndUpdate({ 'id': ontologyTreeId, 'studyId': studyId, 'life.deletedTime': null }, {
            $push: {
                routes: { $each: routesTooAdd }
            }
        });

        return responses;
    }

    public async deleteOntologyRoutes(requester: string, studyId: string, ontologyTreeId: string, routeIds: string[]): Promise<IGenericResponse[]> {
        /**
         * Delete routes of an ontology tree.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param ontologyTreeId - The id of the ontology tree.
         * @param routeIds - The ids of the routes to delete.
         *
         * @return IGenericRespone[]
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const ontologyTree = await db.collections!.ontologies_collection.findOne({ 'id': ontologyTreeId, 'studyId': studyId, 'life.deletedTime': null });
        if (!ontologyTree) {
            throw new GraphQLError('Ontology does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const existingFieldsIds: string[] = ontologyTree.routes.map(el => el.fieldId);
        const responses: IGenericResponse[] = [];

        for (const routeId of routeIds) {
            if (existingFieldsIds.includes(routeId)) {
                responses.push(makeGenericReponse(routeId, true, undefined, `Route ${routeId} has been deleted.`));
            } else {
                responses.push(makeGenericReponse(routeId, false, undefined, `Route ${routeId} does not exist.`));
            }
        }

        await db.collections!.ontologies_collection.findOneAndUpdate({ 'studyId': studyId, 'id': ontologyTreeId, 'life.deletedTime': null }, {
            $pull: {
                routes: { id: { $in: routeIds } }
            }
        });

        return responses;
    }

    public async getStudyFields(studyId: string, dataVersions: Array<string | null>, selectedFields: string[] | null): Promise<IField[]> {
        /**
         * Get the list of fields of a study. Note, duplicate fields will be joined and only remain the latest one.
         *
         * @param studyId - The id of the study.
         * @param dataVersions - The data versions of the fields. Return fields whose data version in the dataVersions.
         * @param selectedFields - The list of ids of fields to return.
         *
         * @return IField[] - The list of objects of IField.
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const fields = await db.collections!.field_dictionary_collection.aggregate([{
            $match: { studyId: studyId, dataVersion: { $in: dataVersions }, fieldId: selectedFields ? { $in: selectedFields } : /^.*$/ }
        }, {
            $sort: {
                'life.createdTime': -1
            }
        }, {
            $group: {
                _id: '$fieldId',
                doc: { $first: '$$ROOT' }
            }
        }, {
            $replaceRoot: {
                newRoot: '$doc'
            }
        }]).toArray();
        return (fields as IField[]).filter(el => !el.life.deletedTime);
    }
    /**
     * Create a field of a study. To adjust to data versioning, create an existing field wil not throw an error.
     *
     * @param requester - The id of the requester.
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
    public async createField(requester: string, fieldInput: { studyId: string, fieldName: string, fieldId: string, description?: string | null, dataType: enumDataTypes, categoricalOptions?: ICategoricalOption[], unit?: string, comments?: string, verifier?: ValueVerifierInput[][], properties?: IFieldProperty[] }): Promise<IField> {
        const study = await db.collections!.studies_collection.findOne({ 'id': fieldInput.studyId, 'life.deletedTime': null });
        if (!study) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study does not exist.'
            });
        }

        const errors = this.validateFieldEntry(fieldInput);

        if (errors.length > 0) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: JSON.stringify(errors)
            });
        }

        // add id and life for verifier;
        const verifierWithId: IValueVerifier[][] = [];
        if (fieldInput.verifier) {
            for (let i = 0; i < fieldInput.verifier.length; i++) {
                verifierWithId.push([]);
                for (let j = 0; j < fieldInput.verifier[i].length; j++) {
                    verifierWithId[verifierWithId.length - 1].push({
                        ...fieldInput.verifier[i][j]
                    });
                }
            }
        }

        const fieldEntry: IField = {
            id: uuid(),
            studyId: fieldInput.studyId,
            fieldId: fieldInput.fieldId,
            fieldName: fieldInput.fieldName,
            description: fieldInput.description ?? null,
            dataType: fieldInput.dataType,
            categoricalOptions: fieldInput.categoricalOptions ?? null,
            unit: fieldInput.unit ?? null,
            comments: fieldInput.comments ?? null,
            dataVersion: null,
            verifier: verifierWithId,
            properties: fieldInput.properties ?? null,
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        await db.collections!.field_dictionary_collection.insertOne(fieldEntry);

        return fieldEntry;
    }
    /**
     * Edit a field of a study.
     *
     * @param requester - The id of the requester.
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
    public async editField(requester: string, fieldInput: { studyId: string, fieldName?: string, fieldId: string, description?: string, dataType?: enumDataTypes, categoricalOptions?: ICategoricalOption[], unit?: string, comments?: string, verifier?: ValueVerifierInput[][], properties?: IFieldProperty[] }): Promise<IGenericResponse> {
        const study = await db.collections!.studies_collection.findOne({ 'id': fieldInput.studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const field = await db.collections!.field_dictionary_collection.findOne({ 'studyId': fieldInput.studyId, 'fieldId': fieldInput.fieldId, 'life.deletedTime': null });
        if (!field) {
            throw new GraphQLError('Field does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const errors = this.validateFieldEntry(fieldInput);

        if (errors.length > 0) {
            throw new GraphQLError(`Field input error: ${JSON.stringify(errors)}`, { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const verifierWithId: IValueVerifier[][] = [];
        if (fieldInput.verifier) {
            for (let i = 0; i < fieldInput.verifier.length; i++) {
                verifierWithId.push([]);
                for (let j = 0; j < fieldInput.verifier[i].length; j++) {
                    verifierWithId[verifierWithId.length - 1].push({
                        ...fieldInput.verifier[i][j]
                    });
                }
            }
        }

        const fieldEntry: Partial<IField> = {
            fieldName: fieldInput.fieldName ?? field.fieldName,
            description: fieldInput.description ?? field.description,
            dataType: fieldInput.dataType ?? field.dataType,
            categoricalOptions: fieldInput.categoricalOptions ?? field.categoricalOptions,
            unit: fieldInput.unit ?? field.unit,
            comments: fieldInput.comments ?? field.comments,
            dataVersion: null,
            verifier: fieldInput.verifier ? verifierWithId : field.verifier,
            properties: fieldInput.properties ?? field.properties
        };
        await db.collections!.field_dictionary_collection.findOneAndUpdate({ 'studyId': fieldInput.studyId, 'fieldId': fieldInput.fieldId, 'dataVersion': null, 'life.deletedTime': null }, {
            $set: {
                id: uuid(),
                ...fieldEntry,
                life: field.life,
                metadata: field.metadata
            }
        }, {
            upsert: true
        });

        return makeGenericReponse(fieldInput.fieldId, true, undefined, `Field ${fieldInput.fieldId} has been edited.`);
    }

    /**
     * Delete a field of a study.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the stduy.
     * @param fieldId - The id of the field.
     *
     * @return IGenericResponse
     */
    public async deleteField(requester: string, studyId: string, fieldId: string): Promise<IGenericResponse> {
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study does not exist.'
            });
        }

        const field = (await db.collections!.field_dictionary_collection.find({ studyId: studyId, fieldId: fieldId }).sort({ 'life.createdTime': -1 }).limit(1).toArray())[0];
        if (!field || field.life.deletedTime) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Field does not exist.'
            });
        }

        await db.collections!.field_dictionary_collection.insertOne({
            id: uuid(),
            studyId: studyId,
            fieldId: fieldId,
            fieldName: field.fieldName,
            description: field.description,
            dataType: field.dataType,
            categoricalOptions: field.categoricalOptions,
            unit: field.unit,
            comments: field.comments,
            dataVersion: null,
            verifier: field.verifier,
            properties: field.properties,
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: Date.now(),
                deletedUser: requester
            },
            metadata: {}
        });
        return makeGenericReponse(fieldId, true, undefined, `Field ${fieldId} has been deleted.`);
    }

    /**
     * Validate field entry. This function only checks the input parameters without interacting with the database.
     *
     * @param fieldInput - The field input object.
     *
     * @return array[] - The error array, empty for null errors.
    */
    public validateFieldEntry(fieldInput: any): string[] {
        const errors: string[] = [];
        // check missing field
        const complusoryField: Array<keyof IField> = [
            'fieldId',
            'fieldName',
            'dataType'
        ];
        for (const key of complusoryField) {
            if (fieldInput[key] === undefined && fieldInput[key] === null) {
                errors.push(`${key} should not be empty.`);
            }
        }

        // only english letters, numbers and _ are allowed in fieldIds
        if (!/^[a-zA-Z0-9_]*$/.test(fieldInput.fieldId || '')) {
            errors.push('FieldId should contain letters, numbers and _ only.');
        }
        // data types
        if (!Object.values(enumDataTypes).includes(fieldInput.dataType)) {
            errors.push(`Data type shouldn't be ${fieldInput.dataType}: use 'int' for integer, 'dec' for decimal, 'str' for string, 'bool' for boolean, 'date' for datetime, 'file' for FILE, 'json' for json.`);
        }
        // check possiblevalues to be not-empty if datatype is categorical
        if (fieldInput.dataType === enumDataTypes.CATEGORICAL) {
            if (fieldInput.categoricalOptions !== undefined && fieldInput.categoricalOptions !== null) {
                if (fieldInput.categoricalOptions.length === 0) {
                    errors.push(`${fieldInput.fieldId}-${fieldInput.fieldName}: possible values can't be empty if data type is categorical.`);
                }
                for (let i = 0; i < fieldInput.categoricalOptions.length; i++) {
                    fieldInput.categoricalOptions[i]['id'] = uuid();
                }
            } else {
                errors.push(`${fieldInput.fieldId}-${fieldInput.fieldName}: possible values can't be empty if data type is categorical.`);
            }
        }

        // TODO: check verifier and properties definition

        return errors;
    }

    /* TODO */
    public async deleteStudyField(requester: string, studyId: string, fieldId: string): Promise<IGenericResponse> {
        /**
         * Delete a field of a study. Note all related data will also be deleted.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param fieldId - The id of the field.
         *
         * @return IGenericResponse - The object of IGenericResponse.
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const field = await db.collections!.field_dictionary_collection.findOne({ 'studyId': studyId, 'fieldId': fieldId, 'life.deletedTime': null });
        if (!field) {
            throw new GraphQLError('Field does not exist).', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const subjectIds: (string | null)[] = await db.collections!.data_collection.distinct('subjectId', { stuyId: studyId, dataVersion: { $ne: null } });
        const visitIds: (string | null)[] = await db.collections!.data_collection.distinct('visitId', { stuyId: studyId, dataVersion: { $ne: null } });

        const session = db.client!.startSession();
        session.startTransaction();
        let bulk = db.collections!.data_collection.initializeUnorderedBulkOp();
        try {
            await db.collections!.field_dictionary_collection.findOneAndUpdate({ studyId: studyId, fieldId: fieldId }, {
                $ser: { 'life.deletedTime': Date.now(), 'life.deletedUser': requester }
            });

            /* Mark versioned data as deleted, mark unversioned data as null */
            for (const subjectId of subjectIds) {
                for (const visitId of visitIds) {
                    bulk.find({ studyId: studyId, subjectId: subjectId, visitId: visitId, dataVersion: null }).upsert().update({
                        $set: {
                            id: uuid(),
                            subjectId: subjectId,
                            visitId: visitId,
                            fieldId: fieldId,
                            dataVersion: null,
                            value: null,
                            timestamps: null,
                            life: {
                                createdTime: Date.now(),
                                createdUser: requester,
                                deletedTime: null,
                                deletedUser: null
                            }
                        }
                    });

                    if (bulk.batches.length > 999) {
                        bulk.execute();
                        bulk = db.collections!.data_collection.initializeUnorderedBulkOp();
                    }
                }
            }
            bulk.batches.length !== 0 && await bulk.execute();
            await session.commitTransaction();
            session.endSession();
            return makeGenericReponse(fieldId, true, undefined, `Field ${field.fieldName} has been deleted.`);
        } catch (error) {
            // If an error occurred, abort the whole transaction and
            // undo any changes that might have happened
            await session.abortTransaction();
            session.endSession();
            throw new GraphQLError(`${JSON.stringify(error)}`, { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    /**
     * Upload data clips to a study.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     * @param data - The list of data clips.
     *
     * @return IGenericResponse - The list of objects of IGenericResponse
     */
    public async uploadData(requester: string, studyId: string, data: IDataClipInput[]): Promise<IGenericResponse[]> {
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study does not exist.'
            });
        }

        const availableFieldsMapping: Record<string, IField> = (await this.getStudyFields(
            studyId,
            (study.dataVersions.map(el => el.id) as Array<string | null>).concat([null]),
            null
        )).reduce((a, c) => {
            a[c.fieldId] = c;
            return a;
        }, {} as any);

        const studyConfig: any = (await db.collections!.configs_collection.findOne({ type: enumConfigType.USERCONFIG, key: studyId }))?.properties ?? defaultSettings.studyConfig;

        const response: IGenericResponse[] = [];
        let bulk = db.collections!.data_collection.initializeUnorderedBulkOp();
        let counter = -1; // index of the data
        for (const dataClip of data) {
            counter++;
            try {
                await permissionCore.checkDataPermissionByUser(requester, dataClip);
            }
            catch {
                response.push(makeGenericReponse(counter.toString(), false, errorCodes.NO_PERMISSION_ERROR, errorCodes.NO_PERMISSION_ERROR));
                continue;
            }

            if (!(dataClip.fieldId in availableFieldsMapping)) {
                response.push(makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY, `Field ${dataClip.fieldId}: Field not found`));
                continue;
            }

            /* Check value is value */
            let error: any = null;
            let parsedValue: any = null;
            if (dataClip.value.toString() === studyConfig.defaultRepresentationForMissingValue) {
                parsedValue = studyConfig.defaultRepresentationForMissingValue;
            } else {
                const field = availableFieldsMapping[dataClip.fieldId];
                switch (field.dataType) {
                    case enumDataTypes.DECIMAL: {// decimal
                        if (typeof (dataClip.value) !== 'string') {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as decimal.`);
                            break;
                        }
                        if (!/^\d+(.\d+)?$/.test(dataClip.value)) {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as decimal.`);
                            break;
                        }
                        parsedValue = parseFloat(dataClip.value);
                        break;
                    }
                    case enumDataTypes.INTEGER: {// integer
                        if (typeof (dataClip.value) !== 'string') {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as integer.`);
                            break;
                        }
                        if (!/^-?\d+$/.test(dataClip.value)) {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as integer.`);
                            break;
                        }
                        parsedValue = parseInt(dataClip.value, 10);
                        break;
                    }
                    case enumDataTypes.BOOLEAN: {// boolean
                        if (typeof (dataClip.value) !== 'string') {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as boolean.`);
                            break;
                        }
                        if (dataClip.value.toString().toLowerCase() === 'true' || dataClip.value.toString().toLowerCase() === 'false') {
                            parsedValue = dataClip.value.toLowerCase() === 'true';
                        } else {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as boolean.`);
                            break;
                        }
                        break;
                    }
                    case enumDataTypes.STRING: {
                        if (typeof (dataClip.value) !== 'string') {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as string.`);
                            break;
                        }
                        parsedValue = dataClip.value.toString();
                        break;
                    }
                    case enumDataTypes.DATETIME: {
                        if (typeof (dataClip.value) !== 'string') {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as date. Value for date type must be in ISO format.`);
                            break;
                        }
                        const matcher = /^(-?(?:[1-9][0-9]*)?[0-9]{4})-(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12][0-9])T(2[0-3]|[01][0-9]):([0-5][0-9]):([0-5][0-9])(.[0-9]+)?(Z)?/;
                        if (!dataClip.value.match(matcher)) {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as date. Value for date type must be in ISO format.`);
                            break;
                        }
                        parsedValue = dataClip.value.toString();
                        break;
                    }
                    case enumDataTypes.JSON: {
                        parsedValue = JSON.parse(dataClip.value);
                        break;
                    }
                    case enumDataTypes.FILE: {
                        parsedValue = dataClip.value;
                        break;
                    }
                    case enumDataTypes.CATEGORICAL: {
                        if (!(availableFieldsMapping[dataClip.fieldId].categoricalOptions)) {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as categorical, possible values not defined.`);
                            break;
                        }
                        if (!((availableFieldsMapping[dataClip.fieldId].categoricalOptions as ICategoricalOption[]).map((el: any) => el.code).includes(dataClip.value?.toString()))) {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as categorical, value not in value list.`);
                            break;
                        } else {
                            parsedValue = dataClip.value?.toString();
                        }
                        break;
                    }
                    default: {
                        error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Invalid data Type.`);
                        break;
                    }
                }
                const verifier = availableFieldsMapping[dataClip.fieldId].verifier;
                if (verifier && verifier.length) {
                    const resEach: boolean[] = [];
                    for (let i = 0; i < verifier.length; i++) {
                        resEach.push(true);
                        for (let j = 0; j < verifier[i].length; j++) {
                            if (!utilsCore.validValueWithVerifier(parsedValue, verifier[i][j])) {
                                resEach[resEach.length - 1] = false;
                                break;
                            }
                        }
                    }
                    if (resEach.every(el => !el)) {
                        error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId} value ${parsedValue}: Failed to pass the verifier.`);
                    }
                }
                if (field.properties) {
                    for (const property of field.properties) {
                        if (property.required && (!dataClip.properties || !dataClip.properties[property.name])) {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Property ${property.name} is required.`);
                            break;
                        }
                        if (property.verifier && dataClip.properties) {
                            const resEach: boolean[] = [];
                            for (let i = 0; i < property.verifier.length; i++) {
                                resEach.push(true);
                                for (let j = 0; j < property.verifier[i].length; j++) {
                                    if (!utilsCore.validValueWithVerifier(dataClip.properties[property.name], property.verifier[i][j])) {
                                        resEach[resEach.length - 1] = false;
                                        break;
                                    }
                                }
                            }
                            if (resEach.every(el => !el)) {
                                error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId} value ${parsedValue}: Property ${property.name} failed to pass the verifier.`);
                            }
                        }
                    }
                }
            }
            if (error) {
                response.push(error);
                continue;
            } else {
                response.push(makeGenericReponse(counter.toString(), true, undefined, undefined));
            }

            bulk.insert({
                id: uuid(),
                studyId: study.id,
                fieldId: dataClip.fieldId,
                dataVersion: null,
                value: parsedValue,
                properties: dataClip.properties,
                life: {
                    createdTime: Date.now(),
                    createdUser: requester,
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            });

            if (bulk.batches.length > 999) {
                await bulk.execute();
                bulk = db.collections!.data_collection.initializeUnorderedBulkOp();
            }
        }
        bulk.batches.length !== 0 && await bulk.execute();
        return response;
    }

    /**
     * Get the data of a study.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     * @param fieldIds - The list of regular expressions of fields to return.
     * @param dataVersions - The list of data versions to return.
     * @param aggregation - The pipeline of the data aggregation.
     * @param useCache - Whether to use the cached data.
     * @param forceUpdate - Whether to force update the cache.
     *
     * @return Partial<IData>[] - The list of objects of Partial<IData>
     */
    public async getData(requester: string, studyId: string, fieldIds: string[], dataVersions: Array<string | null>, aggregation: any, useCache: boolean, forceUpdate: boolean): Promise<any> {
        const user = await db.collections!.users_collection.findOne({ id: requester });
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }
        const userRoles = (await permissionCore.getUserRoles(requester, studyId));
        const config = await db.collections!.configs_collection.findOne({ type: enumConfigType.STUDYCONFIG, key: studyId });
        if (!config) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study config not found.'
            });
        }
        /** Check hash first */
        let hash: string;
        if (useCache) {
            hash = utilsCore.computeHash({
                query: 'getData',
                requester: requester,
                studyId: studyId,
                fieldIds: fieldIds,
                dataVersions: dataVersions,
                aggregation: aggregation
            });
            const hashedInfo = await db.collections!.cache_collection.findOne({ 'keyHash': hash, 'life.deletedTime': null });
            if (hashedInfo && !forceUpdate) {
                return hashedInfo;
            } else {
                const data = await this.getDataByRoles(user?.type === enumUserTypes.ADMIN, userRoles, studyId, dataVersions, fieldIds);
                const filteredData = dataTransformationCore.transformationAggregate(data, { version: this.genVersioningAggregation((config.properties as IStudyConfig).defaultVersioningKeys, dataVersions.includes(null)) });
                const transformed = dataTransformationCore.transformationAggregate(filteredData.version, aggregation);
                // write to minio and cache collection
                const info = await this.convertToBufferAndUpload(transformed, fileCore.uploadFile, uuid() + '.json', requester);
                const newHashInfo = {
                    id: uuid(),
                    keyHash: hash,
                    uri: info.uri,
                    life: {
                        createdTime: Date.now(),
                        createdUser: requester,
                        deletedTime: null,
                        deletedUser: null
                    },
                    status: enumCacheStatus.INUSE,
                    keys: {
                        query: 'getData',
                        requester: requester,
                        studyId: studyId,
                        fieldIds: fieldIds,
                        dataVersions: dataVersions,
                        aggregation: aggregation
                    },
                    metadata: {}
                };
                await db.collections!.cache_collection.insertOne(newHashInfo);
                return newHashInfo;
            }
        } else {
            const data = await this.getDataByRoles(user?.type === enumUserTypes.ADMIN, userRoles, studyId, dataVersions, fieldIds);
            const filteredData = dataTransformationCore.transformationAggregate(data, { version: this.genVersioningAggregation((config.properties as IStudyConfig).defaultVersioningKeys, dataVersions.includes(null)) });
            const transformed = dataTransformationCore.transformationAggregate(filteredData.version, aggregation);
            return transformed;
        }
    }

    public async getDataByRoles(isAdmin: boolean, roles: IRole[], studyId: string, dataVersions: Array<string | null>, fieldIds?: string[]) {
        const matchFilter: any = {
            studyId: studyId,
            dataVersion: { $in: dataVersions }
        };
        if (fieldIds) {
            // we assume that for regular expressions, ^ and $ must be used
            if (fieldIds[0][0] === '^' && fieldIds[0][fieldIds[0].length - 1] === '$') {
                matchFilter.fieldId = { $in: fieldIds.map(el => new RegExp(el)) };
            } else {
                matchFilter.fieldId = { $in: fieldIds };
            }
        }

        const roleArr: any[] = [];
        for (const role of roles) {
            const permissionArr: any[] = [];
            for (let i = 0; i < role.dataPermissions.length; i++) {
                if (role.dataPermissions[i].fields.length === 0) {
                    continue;
                }
                const obj: any = {
                    fieldId: { $in: role.dataPermissions[i].fields.map(el => new RegExp(el)) }
                };
                if (role.dataPermissions[i].dataProperties) {
                    for (const key of Object.keys(role.dataPermissions[i].dataProperties)) {
                        obj[`properties.${key}`] = { $in: role.dataPermissions[i].dataProperties[key].map(el => new RegExp(el)) };
                    }
                }
                permissionArr.push(obj);
            }
            if (permissionArr.length === 0) {
                return [];
            }
            roleArr.push({ $or: permissionArr });
        }
        const res = isAdmin ? await db.collections!.data_collection.find({ ...matchFilter }, { allowDiskUse: true }).toArray()
            : await db.collections!.data_collection.aggregate([{
                $match: { ...matchFilter }
            }, {
                $match: { $or: roleArr }
            }], { allowDiskUse: true }).toArray();
        return res;
    }

    public genVersioningAggregation(keys: string[], hasVersioning: boolean) {
        const aggregation: any[] = [];
        if (!hasVersioning) {
            aggregation.push({
                operationName: 'Filter', params: {
                    filters: {
                        deleted: [{
                            formula: {
                                type: enumASTNodeTypes.VARIABLE,
                                operation: null,
                                value: 'dataVersion',
                                parameter: {},
                                children: null
                            },
                            condition: enumConditionOps.GENERALISNOTNULL,
                            value: '',
                            parameters: {}
                        }]
                    }
                }
            });
        }
        aggregation.push({ operationName: 'Group', params: { keys: keys, skipUnmatch: false } });
        aggregation.push({ operationName: 'LeaveOne', params: { scoreFormula: { type: enumASTNodeTypes.VARIABLE, operator: null, value: 'life.createdTime', parameters: {}, children: null }, isDescend: true } });
        aggregation.push({
            operationName: 'Filter', params: {
                filters: {
                    deleted: [{
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
                    }]
                }
            }
        });
        return aggregation;
    }

    /**
     * Delete data of a study. We add a deleted document in the database.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     * @param documentId - The id of the mongo document.
     *
     * @return IGenreicResponse - The object of IGenericResponse.
     */
    public async deleteData(requester: string, studyId: string, documentId: string): Promise<IGenericResponse> {
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study does not exist.'
            });
        }

        const data: any = await db.collections!.data_collection.findOne({ 'id': documentId, 'life.deletedTime': null });
        if (!data) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Document does not exist or has been deleted.'
            });
        }
        if (!permissionCore.checkDataPermissionByUser(requester, data)) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }

        delete data._id;
        await db.collections!.data_collection.insertOne({
            ...data,
            id: uuid(),
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: Date.now(),
                deletedUser: requester
            }
        });
        return makeGenericReponse(undefined, true, undefined, 'Successfuly.');
    }

    /**
     * Upload a data file.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     * @param file - The file to upload.
     * @param properties - The properties of the file. Need to match field properties if defined.
     * @param fieldId - The id of the field.
     *
     * @return IData
     */
    public async uploadFileData(requester: string, studyId: string, file: FileUpload, fieldId: string, properties: Record<string, any>): Promise<IData> {
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study does not exist.'
            });
        }

        const availableDataVersions: (string | null)[] = (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id);
        availableDataVersions.push(null);
        const field = (await this.getStudyFields(studyId, availableDataVersions, [fieldId]))[0];
        if (!field) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Field does not exist.'
            });
        }

        if (!Object.keys(enumFileTypes).includes((file?.filename?.split('.').pop() || '').toUpperCase())) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'File type not supported.'
            });
        }

        if (field.properties) {
            for (const property of field.properties) {
                if (property.required && (!properties || !properties[property.name])) {
                    throw new TRPCError({
                        code: enumTRPCErrorCodes.BAD_REQUEST,
                        message: `Property ${property.name} is required.`
                    });
                }
                if (property.verifier && properties) {
                    const resEach: boolean[] = [];
                    for (let i = 0; i < property.verifier.length; i++) {
                        resEach.push(true);
                        for (let j = 0; j < property.verifier[i].length; j++) {
                            if (!utilsCore.validValueWithVerifier(properties[property.name], property.verifier[i][j])) {
                                resEach[resEach.length - 1] = false;
                                break;
                            }
                        }
                    }
                    if (resEach.every(el => !el)) {
                        throw new TRPCError({
                            code: enumTRPCErrorCodes.BAD_REQUEST,
                            message: `Property ${property.name} check failed. Failed value ${JSON.stringify(properties[property.name])}.`
                        });
                    }
                }
            }
        }
        const fileEntry = await fileCore.uploadFile(
            requester, studyId, null, file, null, enumFileTypes[(file.filename.split('.').pop() as string).toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.STUDY_DATA_FILE, properties);

        const dataEntry: IData = {
            id: uuid(),
            studyId: study.id,
            fieldId: fieldId,
            dataVersion: null,
            value: fileEntry.id,
            properties: properties,
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        await db.collections!.data_collection.insertOne(dataEntry);
        return dataEntry;
    }

    public async getStudySummary(studyId: string): Promise<Record<string, any>> {
        /**
         * Get the summary of a study.
         *
         * @param studyId - The id of the study.
         *
         * @return Record<string, any> - The object of Record<string, any>
         */

        const numberOfDataLogs: number = await db.collections!.data_collection.countDocuments({ studyId: studyId, dataVersion: { $ne: null } });
        const numberOfAdds: number = await db.collections!.data_collection.countDocuments({ studyId: studyId, value: { $ne: null }, dataVersion: { $ne: null } });
        const numberOfDeletes: number = await db.collections!.data_collection.countDocuments({ studyId: studyId, value: null, dataVersion: { $ne: null } });

        const numberOfVersionedLogs: number = await db.collections!.data_collection.countDocuments({ studyId: studyId, dataVersion: { $ne: null } });
        const numberOfUnversionedLogs: number = await db.collections!.data_collection.countDocuments({ studyId: studyId, dataVersion: null });

        const numberOfUnversionedAdds: number = await db.collections!.data_collection.countDocuments({ studyId: studyId, dataVersion: null, value: { $ne: null } });
        const numberOfUnversionedDeletes: number = await db.collections!.data_collection.countDocuments({ studyId: studyId, dataVersion: null, value: null });

        const numberOfSubjects: number = (await db.collections!.data_collection.distinct('subjectId', { stuyId: studyId, dataVersion: { $ne: null } })).length;
        const numberOfVisits: number = (await db.collections!.data_collection.distinct('visitId', { stuyId: studyId, dataVersion: { $ne: null } })).length;
        const numberOfFields: number = (await db.collections!.field_dictionary_collection.distinct('fieldId', { studyId: studyId })).length;

        return {
            numberOfDataLogs: numberOfDataLogs,
            numberOfAdds: numberOfAdds,
            numberOfDeletes: numberOfDeletes,
            numberOfVersionedLogs: numberOfVersionedLogs,
            numberOfUnversionedLogs: numberOfUnversionedLogs,
            numberOfUnversionedAdds: numberOfUnversionedAdds,
            numberOfUnversionedDeletes: numberOfUnversionedDeletes,
            numberOfSubjects: numberOfSubjects,
            numberOfVisits: numberOfVisits,
            numberOfFields: numberOfFields
        };
    }
    public async getFile(fileId: string): Promise<IFile | null> {
        /**
         * Get the metadata of a file by id.
         *
         * @param fileId - The id of the file.
         */

        return await db.collections!.files_collection.findOne({ 'id': fileId, 'life.deletedTime': null });
    }

    /* TODO: Data Transformation */
    // public async dataTransform(fields: IField[], data: IData[], rules: any) {

    // }

    /**
     * Create a data version of a study.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     * @param version - The name of the new data version. Recommend for x.y.z
     * @param tag - The tag of the new data version.
     *
     * @return IStudyDataVersion
     */
    public async createDataVersion(requester: string, studyId: string, version: string, tag?: string): Promise<IStudyDataVersion> {
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study does not exist.'
            });
        }

        const studyDataVersion: IStudyDataVersion = {
            id: uuid(),
            contentId: uuid(),
            version: version,
            tag: tag,
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        // update unversioned fields
        await db.collections!.field_dictionary_collection.updateMany({
            studyId: studyId,
            dataVersion: null
        }, {
            $set: {
                dataVersion: studyDataVersion.id
            }
        });

        // update unversioned data
        await db.collections!.data_collection.updateMany({
            studyId: studyId,
            dataVersion: null
        }, {
            $set: {
                dataVersion: studyDataVersion.id
            }
        });


        // push new verison to study
        await db.collections!.studies_collection.findOneAndUpdate({ id: studyId }, {
            $set: {
                currentDataVersion: study.currentDataVersion + 1
            },
            $push: {
                dataVersions: studyDataVersion
            }
        });
        return studyDataVersion;
    }



    public convertToBufferAndUpload(
        jsonObject: any,
        uploadFunc: any,
        fileName: string,
        requester: string
    ): Promise<any> {
        const uploadsDir = 'uploads'; // Define the uploads directory

        // Ensure the uploads directory exists
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir);
        }

        // Define the full path for the new file
        const filePath = path.join(uploadsDir, fileName);

        return new Promise((resolve, reject) => {
            // Write the JSON object to a file
            fs.writeFile(filePath, JSON.stringify(jsonObject), (writeErr) => {
                if (writeErr) {
                    return reject(writeErr);
                }

                // Prepare the file data for upload
                const result = {
                    path: filePath, // Use the file path
                    filename: fileName,
                    mimetype: 'application/json',
                    size: fs.statSync(filePath).size
                };

                // Upload the file using the provided upload function
                fileCore.uploadFile(
                    requester,
                    null, // studyId
                    null, // userId
                    result, // fileUpload
                    null, // description
                    enumFileTypes.JSON,
                    enumFileCategories.CACHE,
                    null // properties
                ).then(resolve).catch(reject).finally(() => {
                    // Cleanup: Delete the temporary file from the disk
                    if (fs.existsSync(filePath)) {
                        fs.unlink(filePath, (err) => {
                            if (err) {
                                console.error('Error deleting temporary file:', filePath, err);
                            }
                        });
                    }
                });
            });
        });
    }




}


export const dataCore = Object.freeze(new DataCore());
