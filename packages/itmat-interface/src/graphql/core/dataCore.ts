import { GraphQLError } from 'graphql';
import { IField, enumDataTypes, ICategoricalOption, IValueVerifier, IGenericResponse, IData, enumConfigType, defaultSettings, IOntologyTree, IOntologyRoute, IAST, enumConditionOps, enumFileTypes, enumFileCategories, IFieldPropert, enumASTNodeTypes, IFile, permissionString } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../../database/database';
import { errorCodes } from '../errors';
import { permissionCore } from './permissionCore';
import { validate } from '@ideafast/idgen';
import type { MatchKeysAndValues } from 'mongodb';
import { objStore } from '../../objStore/objStore';
import { FileUpload } from 'graphql-upload-minimal';
import crypto from 'crypto';
import { fileSizeLimit } from '../../utils/definition';
import { makeGenericReponse } from '../responses';
import { utilsCore } from './utilsCore';
import { resetCaches } from 'graphql-tag';
import { fileCore } from './fileCore';
import { z } from 'zod';
import { dataTransformationCore } from './transformationCore';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import stream, { PassThrough } from 'stream';
import { enumCacheStatus } from 'packages/itmat-types/src/types/cache';
import { availableParallelism } from 'os';


export interface IDataClipInput {
    fieldId: string;
    value: string;
    timestamps: number | null;
    properties: Record<string, any>;
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
            $match: { 'studyId': studyId, 'life.deletedTime': null, 'dataVersion': { $in: dataVersions }, 'fieldId': selectedFields ? { $in: selectedFields } : /^.*$/ }
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

        return fields as IField[];
    }

    public async createField(requester: string, fieldInput: { studyId: string, fieldName: string, fieldId: string, description: string | null, tableName: string | null, dataType: enumDataTypes, categoricalOptions: ICategoricalOption[] | null, unit: string | null, comments: string | null, verifier: ValueVerifierInput[][] | null, properties: IFieldPropert[] | null }): Promise<IField> {
        /**
         * Create a field of a study.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param fieldName - The name of the field.
         * @param fieldId - The value of the id of the field. Should be unique.
         * @param description - The description of the field.
         * @param tableName - The table name of the field.
         * @param dataType - The dataType of the field.
         * @param categoricalOptions - The options of the field if the field is a categorical field.
         * @param unit - The unit of the field.
         * @param comments - The comments of the field.
         * @param verifier - The verifier of the field.
         * @param properties - The properties of the field.
         *
         * @return IField
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': fieldInput.studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const errors = this.validateFieldEntry(fieldInput);

        if (errors.length > 0) {
            throw new GraphQLError(`Field input error: ${JSON.stringify(errors)}`, { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        // add id and life for verifier;
        const verifierWithId: IValueVerifier[][] = [];
        if (fieldInput.verifier) {
            for (let i = 0; i < fieldInput.verifier.length; i++) {
                verifierWithId.push([]);
                for (let j = 0; j < fieldInput.verifier[i].length; j++) {
                    verifierWithId[verifierWithId.length - 1].push({
                        id: uuid(),
                        ...fieldInput.verifier[i][j],
                        life: {
                            createdTime: Date.now(),
                            createdUser: requester,
                            deletedTime: null,
                            deletedUser: null
                        },
                        metadata: {}
                    });
                }
            }
        }

        const fieldEntry: IField = {
            id: uuid(),
            studyId: fieldInput.studyId,
            fieldId: fieldInput.fieldId,
            fieldName: fieldInput.fieldName,
            description: fieldInput.description,
            tableName: fieldInput.tableName,
            dataType: fieldInput.dataType,
            categoricalOptions: fieldInput.categoricalOptions,
            unit: fieldInput.unit,
            comments: fieldInput.comments,
            dataVersion: null,
            verifier: verifierWithId,
            properties: fieldInput.properties,
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        await db.collections!.field_dictionary_collection.findOneAndUpdate({ 'studyId': fieldInput.studyId, 'fieldId': fieldEntry.fieldId, 'life.deletedTime': null, 'dataVersion': null }, {
            $set: fieldEntry
        }, {
            upsert: true
        });

        return fieldEntry;
    }

    public async editField(requester: string, fieldInput: { studyId: string, fieldName: string, fieldId: string, description: string | null, tableName: string | null, dataType: enumDataTypes, categoricalOptions: ICategoricalOption[] | null, unit: string | null, comments: string | null, verifier: ValueVerifierInput[][] | null, properties: IFieldPropert[] | null }): Promise<IGenericResponse> {
        /**
         * Edit a field of a study.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param fieldName - The name of the field.
         * @param fieldId - The value of the id of the field. Should be unique.
         * @param description - The description of the field.
         * @param tableName - The table name of the field.
         * @param dataType - The dataType of the field.
         * @param categoricalOptions - The options of the field if the field is a categorical field.
         * @param unit - The unit of the field.
         * @param comments - The comments of the field.
         * @param verifier - The verifier of the field.
         * @param properties - The properties of the field.
         *
         * @return IField
         */

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
                        id: uuid(),
                        ...fieldInput.verifier[i][j],
                        life: {
                            createdTime: Date.now(),
                            createdUser: requester,
                            deletedTime: null,
                            deletedUser: null
                        },
                        metadata: {}
                    });
                }
            }
        }

        const fieldEntry: Partial<IField> = {
            fieldName: fieldInput.fieldName ?? field.fieldName,
            description: fieldInput.description ?? field.description,
            tableName: fieldInput.tableName ?? field.tableName,
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

    public async deleteField(requester: string, studyId: string, fieldId: string): Promise<IGenericResponse> {
        /**
         * Delete a field of a study.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the stduy.
         * @param fieldId - The id of the field.
         *
         * @return IGenericResponse
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const field = (await db.collections!.field_dictionary_collection.find({ studyId: studyId, fieldId: fieldId }).sort({ 'life.createdTime': -1 }).limit(1).toArray())[0];
        if (!field) {
            throw new GraphQLError('Field does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        await db.collections!.field_dictionary_collection.findOneAndUpdate({ studyId: studyId, fieldId: fieldId, dataVersion: null }, {
            $set: {
                id: uuid(),
                studyId: studyId,
                fieldId: fieldId,
                fieldName: field.fieldName,
                description: field.description,
                tableName: field.tableName,
                dataType: field.dataType,
                categoricalOptions: field.categoricalOptions,
                unit: field.unit,
                comments: field.comments,
                dataVersion: null,
                verifier: field.verifier,
                life: {
                    createdTime: field.life.createdTime,
                    createdUser: field.life.createdUser,
                    deletedTime: Date.now(),
                    deletedUser: requester
                },
                metadata: {}
            }
        });

        return makeGenericReponse(fieldId, true, undefined, `Field ${fieldId} has been deleted.`);
    }

    public validateFieldEntry(fieldInput: any): string[] {
        /**
         * Validate field entrt.
         */
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

    public async uploadData(requester: string, studyId: string, data: IDataClipInput[]): Promise<IGenericResponse[]> {
        /**
         * Upload data clips to a study.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param data - The list of data clips.
         *
         * @return IGenericResponse - The list of objects of IGenericResponse
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
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
            if (!(dataClip.fieldId in availableFieldsMapping)) {
                response.push(makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY, `Field ${dataClip.fieldId}: Field Not found`));
                continue;
            }

            // if (!(await permissionCore.chekckDataEntryValidFromUser(requester, studyId, null, dataClip.fieldId, dataClip.subjectId, dataClip.visitId, atomicOperation.WRITE))) {
            //     response.push(makeGenericReponse(counter.toString(), false, errorCodes.NO_PERMISSION_ERROR, 'You do not have permission to edit this field.'));
            // }

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
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as data. Value for date type must be in ISO format.`);
                            break;
                        }
                        const matcher = /^(-?(?:[1-9][0-9]*)?[0-9]{4})-(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12][0-9])T(2[0-3]|[01][0-9]):([0-5][0-9]):([0-5][0-9])(.[0-9]+)?(Z)?/;
                        if (!dataClip.value.match(matcher)) {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Cannot parse as data. Value for date type must be in ISO format.`);
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
                if (verifier) {
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
                        if (property.required && !dataClip.properties[property.name]) {
                            error = makeGenericReponse(counter.toString(), false, errorCodes.CLIENT_MALFORMED_INPUT, `Field ${dataClip.fieldId}: Property ${property.name} is required.`);
                            break;
                        }
                        if (property.verifier) {
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
                timestamps: dataClip.timestamps,
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
            bulk.batches.length !== 0 && await bulk.execute();
        }
        return response;
    }

    public async getData(requester: string, studyId: string, fieldIds: string[], dataVersions: Array<string | null>, aggregation: any, useCache: boolean, forceUpdate: boolean): Promise<any> {
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
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }
        const userRoles = (await permissionCore.getUserRoles(requester));
        const permissionFilters: any[] = [];
        for (const role of userRoles) {
            const filter: any = {};
            filter[`metadata.role:${role.id}`] = { $in: permissionString.read };
            permissionFilters.push(filter);
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
                const data = await db.collections!.data_collection.aggregate([{
                    $match: {
                        studyId: studyId,
                        fieldId: { $in: fieldIds.map((el: string) => new RegExp(el)) },
                        dataVersion: { $in: dataVersions }
                    }
                }]).toArray();
                const transformed = await dataTransformationCore.transformationAggregate(data, aggregation);
                // write to minio and cache collection
                const info = await this.convertToBufferAndUpload(transformed, fileCore.uploadFile, uuid() + '.json', requester);
                await db.collections!.cache_collection.insertOne({
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
                });
                return info;
            }
        } else {
            const data = await db.collections!.data_collection.aggregate([{
                $match: {
                    studyId: studyId,
                    fieldId: { $in: fieldIds },
                    dataVersion: { $in: dataVersions }
                    // $or: permissionFilters
                }
            }]).toArray();
            const transformed = await dataTransformationCore.transformationAggregate(data, aggregation);
            return transformed;
        }
    }

    public async deleteData(requester: string, studyId: string, subjectIds: string[], visitIds: string[], fieldIds: string[]): Promise<IGenericResponse> {
        /**
         * Delete data of a study.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param subjectIds - The list of ids of subjects.
         * @param visitIds - The list of ids of visits.
         * @param fieldIds - The list of ids of fields.
         *
         * @return IGenreicResponse - The object of IGenericResponse.
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const availableFieldIds: string[] = await (await this.getStudyFields(studyId, (study.dataVersions.map(el => el.id) as Array<string | null>).concat([null]), null)).map(el => el.id);

        const bulk = db.collections!.data_collection.initializeUnorderedBulkOp();
        for (const fieldId of fieldIds) {
            if (!(availableFieldIds.includes(fieldId))) {
                continue;
            }
            for (const subjectId of subjectIds) {
                for (const visitId of visitIds) {
                    bulk.find({ studyId: studyId, subjectId: subjectId, visitId: visitId, fieldId: fieldId, dataVersion: null }).upsert().updateOne({
                        $set: {
                            id: uuid(),
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
                }
            }
        }
        return makeGenericReponse(undefined, true, undefined, 'Successfuly.');
    }

    public async uploadFileData(requester: string, studyId: string, file: FileUpload, properties: Record<string, any>, subjectId: string, fieldId: string, visitId: string | null, timestamps: number | null): Promise<IGenericResponse> {
        /**
         * Upload a data file.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param file - The file to upload.
         * @param properties - The properties of the file. Need to match field properties if defined.
         * @param subjectId - The id of the subject.
         * @param fieldId - The id of the field.
         * @param visitId - The id of the visit.
         * @param timestamps - The timestamps of the data.
         *
         * @return IGenericResponse
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const availableDataVersions: (string | null)[] = (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id);
        availableDataVersions.push(null);
        const field = (await this.getStudyFields(studyId, availableDataVersions, [fieldId]))[0];
        if (!field) {
            throw new GraphQLError('Field does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        if (field.properties) {
            for (let i = 0; i < field.properties.length; i++) {
                const property = field.properties[i];
                if (property.required && !properties[property.name]) {
                    throw new GraphQLError(`Property ${property.name} is required.`, { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
                }
                const resEach: boolean[] = [];
                for (let i = 0; i < properties.verifier.length; i++) {
                    resEach.push(true);
                    for (let j = 0; j < properties.verifier[i].length; j++) {
                        if (!utilsCore.validValueWithVerifier(properties[property.name], properties.verifier[i][j])) {
                            resEach[resEach.length - 1] = false;
                            break;
                        }
                    }
                }
                if (resEach.every(el => !el)) {
                    throw new GraphQLError(`Property ${property.name} check failed. Failed value ${JSON.stringify(properties[property.name])}`, { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
                }

            }
        }

        // uploadfile
        const file_ = file;
        if (file_) {
            const supportedFormats: string[] = Object.keys(enumFileTypes);
            if (!(supportedFormats.includes((file_.filename.split('.').pop() as string).toUpperCase()))) {
                throw new GraphQLError('File type not supported.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        }
        const fileEntry = await fileCore.uploadFile(requester, studyId, null, file_, null, enumFileTypes[(file_.filename.split('.').pop() as string).toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.STUDY_DATA_FILE, properties);

        const dataEntry = {
            id: uuid(),
            studyId: study.id,
            subjectId: subjectId,
            visitId: visitId,
            fieldId: fieldId,
            dataVersion: null,
            value: fileEntry.id,
            timestamps: timestamps,
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
        return makeGenericReponse(fileEntry.id, true, undefined, 'File has been uploaded.');
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



    public convertToBufferAndUpload(
        jsonObject: any,
        uploadFunc: any,
        fileName: string,
        requester: string
    ): Promise<any> {
        // Convert the JSON object into a JSON string, chunk by chunk
        function* chunkedStringify(jsonObject: any, chunkSize = 1024): Generator<string> {
            const jsonString = JSON.stringify(jsonObject);
            let index = 0;
            while (index < jsonString.length) {
                yield jsonString.slice(index, index + chunkSize);
                index += chunkSize;
            }
        }

        // Your promise should wrap the core logic
        return new Promise((resolve, reject) => {
            // Create a passthrough stream to gather data
            const gatherStream = new PassThrough();

            // This array will collect chunks of data
            const chunks: Buffer[] = [];

            // Collect chunks in the array
            gatherStream.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            // Once the stream ends, concatenate all chunks to produce the final buffer
            gatherStream.on('end', () => {
                const fileBuffer = Buffer.concat(chunks);

                const result = {
                    fileBuffer: fileBuffer,
                    filename: fileName,
                    mimetype: 'application/json',
                    size: fileBuffer.length
                };

                // Upload to MinIO or any other target using the provided upload function
                fileCore.uploadFile(
                    requester,
                    null,
                    null,
                    result, // fileupload
                    null, // description
                    enumFileTypes.JSON,
                    enumFileCategories.CACHE,
                    null
                ).then(resolve).catch(reject);
            });

            // Send the JSON chunks to our gathering stream
            for (const chunk of chunkedStringify(jsonObject)) {
                gatherStream.write(chunk);
            }

            gatherStream.end();
        });
    }


}


export const dataCore = Object.freeze(new DataCore());
