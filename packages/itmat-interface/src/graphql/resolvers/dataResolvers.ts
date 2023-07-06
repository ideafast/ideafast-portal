import { GraphQLError } from 'graphql';
import {
    IProject,
    IStudy,
    IStudyDataVersion,
    IField,
    IUser,
    IFile,
    IJob,
    IDataClip,
    ISubjectDataRecordSummary,
    IRole,
    IOntologyTree,
    enumUserTypes,
    atomicOperation,
    IPermissionManagementOptions,
    IData,
    ICombinedPermissions,
    IFieldValueVerifier,
    ICategoricalOption,
    enumDataTypes,
    IGenericResponse
} from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../../database/database';
import { permissionCore } from '../core/permissionCore';
import { validateAndGenerateFieldEntry } from '../core/fieldCore';
import { studyCore } from '../core/studyCore';
import { errorCodes } from '../errors';
import { makeGenericReponse } from '../responses';
import { buildPipeline, translateMetadata } from '../../utils/query';
import { dataStandardization } from '../../utils/query';
import { dataCore, IDataClipInput } from '../core/dataCore';


export const studyResolvers = {
    Query: {
        getFields: async (__unused__parent: Record<string, unknown>, { studyId, projectId, versionId }: { studyId: string, projectId: string | null, versionId?: string | null }, context: any): Promise<IField[]> => {
            /**
             * Get the list of fields of a study.
             *
             * @param studyId - The id of the study.
             * @param projectId - The id of the project.
             * @param versionId - The id of the version. By default, we will return data until this version. If not specificed, will return the latest versioned data.
             *
             * @return IField - The list of objects of IField.
             */

            const study: IStudy = await studyCore.getStudy(studyId);

            // TODO: Project check

            const requester: IUser = context.req.user;

            const combinedPermissions: ICombinedPermissions = await permissionCore.combineUserDataPermissions(requester.id, studyId, projectId, atomicOperation.READ);

            if (versionId === null) {
                if (!combinedPermissions.hasPriority || !combinedPermissions.hasVersioned) {
                    throw new GraphQLError('You have no permission to unversioned data.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
                }
            }

            if (versionId) {
                if (!combinedPermissions.hasPriority) {
                    throw new GraphQLError('You have no permission to specify a data version.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
                }
                if (!study.dataVersions.map(el => el.id).includes(versionId)) {
                    throw new GraphQLError('Version id does not exist .', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
                }
            }

            const availableDataVersions: Array<string | null> = !versionId ? (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id)
                : study.dataVersions.filter((__unused__el, index) => index <= study.dataVersions.findIndex(el => el.id === versionId)).map(el => el.id);

            if (versionId === null) {
                availableDataVersions.push(null);
            }

            const fields: IField[] = await dataCore.getStudyFields(studyId, availableDataVersions, null);
            return fields;
        },

        getOntologyTree: async (__unused__parent: Record<string, unknown>, { studyId, projectId, treeId }: { studyId: string, projectId: string | null, treeId: string }, context: any): Promise<IOntologyTree> => {
            /**
             * Get the ontology by the name.
             *
             * @param studyId - The id of the study.
             * @param projectId - The id of the project.
             * @param treeName - The name of the tree.
             *
             * @return IOntologyTree
             */

            const requester: IUser = context.req.user;

            // we dont filters fields of an ontology tree by fieldIds
            const hasProjectLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
                IPermissionManagementOptions.ontologyTrees,
                atomicOperation.READ,
                requester.id,
                studyId,
                projectId
            );

            const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
                IPermissionManagementOptions.ontologyTrees,
                atomicOperation.READ,
                requester.id,
                studyId,
                projectId
            );
            if (!hasStudyLevelPermission && !hasProjectLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }

            const ontologyTree: IOntologyTree = await dataCore.getOntologyTree(studyId, treeId);
            return ontologyTree;
        },

        getData: async (__unused__parent: Record<string, unknown>, { studyId, projectId, versionId }: { studyId: string, projectId: string | null, versionId: string | null }, context: any): Promise<Partial<IData>[]> => {
            /**
             * Get the data of a study by version.
             *
             * @param studyId - The id of the study.
             * @param projectId - The id of the project.
             * @param versionId - The id of the version.
             *
             * @return Partial<IData>
             */

            const study: IStudy = await studyCore.getStudy(studyId);

            // TODO: Project check

            const requester: IUser = context.req.user;

            const combinedPermissions: ICombinedPermissions = await permissionCore.combineUserDataPermissions(requester.id, studyId, projectId, atomicOperation.READ);

            if (versionId === null) {
                if (!combinedPermissions.hasPriority || !combinedPermissions.hasVersioned) {
                    throw new GraphQLError('You have no permission to unversioned data.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
                }
            }

            if (versionId) {
                if (!combinedPermissions.hasPriority) {
                    throw new GraphQLError('You have no permission to specify a data version.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
                }
                if (!study.dataVersions.map(el => el.id).includes(versionId)) {
                    throw new GraphQLError('Version id does not exist .', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
                }
            }

            const availableDataVersions: Array<string | null> = (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id);

            if (versionId === null) {
                availableDataVersions.push(null);
            }

            const dataClips: Partial<IData>[] = await dataCore.getData(studyId, ['^.*$'], ['^.*$'], ['^.*$'], availableDataVersions);

            return dataClips;
        }
    },
    Study: {

    },
    Project: {

    },
    Mutation: {
        createField: async (__unused__parent: Record<string, unknown>, { studyId, fieldName, fieldId, description, tableName, dataType, categoricalOptions, unit, comments, verifier }: { studyId: string, fieldName: string, fieldId: string, description: string | null, tableName: string | null, dataType: enumDataTypes, categoricalOptions: ICategoricalOption[] | null, unit: string | null, comments: string | null, verifier: IFieldValueVerifier | null }, context: any): Promise<IField> => {
            /**
             * Create a field of a study.
             *
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
             *
             * @return IField
             */
            const requester: IUser = context.req.user;
            const hasPermission = await permissionCore.chekckFieldEntryValidFromUser(requester.id, studyId, null, fieldId, atomicOperation.WRITE);

            if (!hasPermission) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }

            const field = await dataCore.createField(requester.id, {
                studyId: studyId,
                fieldName: fieldName,
                fieldId: fieldId,
                description: description,
                tableName: tableName,
                dataType: dataType,
                categoricalOptions: categoricalOptions,
                unit: unit,
                comments: comments,
                verifier: verifier
            });
            return field;
        },
        editField: async (__unused__parent: Record<string, unknown>, { studyId, fieldName, fieldId, description, tableName, dataType, categoricalOptions, unit, comments, verifier }: { studyId: string, fieldName: string, fieldId: string, description: string | null, tableName: string | null, dataType: enumDataTypes, categoricalOptions: ICategoricalOption[] | null, unit: string | null, comments: string | null, verifier: IFieldValueVerifier | null }, context: any): Promise<IGenericResponse> => {
            /**
             * Edit a field of a study.
             *
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
             *
             * @return IField
             */
            const requester: IUser = context.req.user;
            const hasPermission = await permissionCore.chekckFieldEntryValidFromUser(requester.id, studyId, null, fieldId, atomicOperation.WRITE);

            if (!hasPermission) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }

            const response = await dataCore.editField(requester.id, {
                studyId: studyId,
                fieldName: fieldName,
                fieldId: fieldId,
                description: description,
                tableName: tableName,
                dataType: dataType,
                categoricalOptions: categoricalOptions,
                unit: unit,
                comments: comments,
                verifier: verifier
            });
            return response;

        },
        deleteField: async (__unused__parent: Record<string, unknown>, { studyId, fieldId }: { studyId: string, fieldId: string }, context: any): Promise<IGenericResponse> => {
            /**
             * Delte a field of a study.
             *
             * @param studyId - The id of the stduy.
             * @param fieldId - The id of the field.
             *
             * @return IGenericResponse
             */

            const requester = context.req.user;
            const hasPermission = await permissionCore.chekckFieldEntryValidFromUser(requester.id, studyId, null, fieldId, atomicOperation.WRITE);

            if (!hasPermission) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }

            const response = await dataCore.deleteField(requester.id, studyId, fieldId);
            return response;
        },
        uploadData: async (__unused__parent: Record<string, unknown>, { studyId, data }: { studyId: string, data: IDataClipInput[] }, context: any): Promise<IGenericResponse[]> => {
            /**
             * Upload data clips to a study.
             *
             * @param requester - The id of the requester.
             * @param studyId - The id of the study.
             * @param data - The list of data clips.
             *
             * @return IGenericResponse - The list of objects of IGenericResponse
             */

            const requester = context.req.user;
            // permission checked in core functions
            const responses = await dataCore.uploadData(requester.id, studyId, data);
            return responses;
        },
        deleteData: async (__unused__parent: Record<string, unknown>, { studyId, subjectIds, visitIds, fieldIds }: { studyId: string, subjectIds: string[], visitIds: string[], fieldIds: string[] }, context: any): Promise<IGenericResponse> => {
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
            const requester = context.req.user;
            // permission checked in core functions
            const respones = await dataCore.deleteData(requester, studyId, subjectIds, visitIds, fieldIds);
            return respones;
        },
        createOntologyTree: async (__unused__parent: Record<string, unknown>, { studyId, name, tag }: { studyId: string, name: string, tag: string }, context: any): Promise<IOntologyTree> => {
            /**
             * Create an ontology tree.
             *
             * @param studyId - The id of the study.
             * @param name - The name of the tree.
             * @param tag - The tag.
             *
             * @return IOntologyTree
             */

            const requester = context.req.user;

            const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
                IPermissionManagementOptions.ontologyTrees,
                atomicOperation.WRITE,
                requester.id,
                studyId,
                null
            );
            if (!hasStudyLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }
            const tree = await dataCore.createOntologyTree(requester.id, studyId, name, tag);

            return tree;
        },
        deleteOntologyTree: async (__unused__parent: Record<string, unknown>, { studyId, ontologyTreeId }: { studyId: string, ontologyTreeId: string }, context: any): Promise<IGenericResponse> => {
            /**
             * Delete an ontology tree.
             *
             * @param requester - The id of the requester.
             * @param studyId - The id of the study.
             * @param ontologyTreeId - The id of the ontology tree.
             *
             * @return IGenericResponse
             */

            const requester = context.req.user;

            const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
                IPermissionManagementOptions.ontologyTrees,
                atomicOperation.READ,
                requester.id,
                studyId,
                null
            );
            if (!hasStudyLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }

            const response = await dataCore.deleteOntologyTree(requester.id, studyId, ontologyTreeId);

            return response;

        },
        addOntologyRoutes: async (__unused__parent: Record<string, unknown>, { studyId, ontologyTreeId, routes }: { studyId: string, ontologyTreeId: string, routes: { path: string[], name: string, fieldId: string }[] }, context: any): Promise<IGenericResponse[]> => {
            /**
             * Add ontology routes to an ontology tree.
             *
             * @param studyId - The id of the study.
             * @param ontologyTreeId - The id of the ontologyTree.
             * @param routes - The list of ontology routes.
             *
             * @return IGenericResponses
             */

            const requester = context.req.user;
            const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
                IPermissionManagementOptions.ontologyTrees,
                atomicOperation.READ,
                requester.id,
                studyId,
                null
            );
            if (!hasStudyLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }
            const responses = await dataCore.addOntologyRoutes(requester.id, studyId, ontologyTreeId, routes);

            return responses;

        },
        deleteOntologyRoutes: async (__unused__parent: Record<string, unknown>, { studyId, ontologyTreeId, routeIds }: { studyId: string, ontologyTreeId: string, routeIds: string[] }, context: any): Promise<IGenericResponse[]> => {
            /**
             * Delete ontology routes from an ontology tree.
             *
             * @param studyId - The id of the study.
             * @param ontologyTreeId - The id of the ontologyTree.
             * @param routeIds - The list of ids of ontology routes.
             *
             * @return IGenericResponses
             */

            const requester = context.req.user;
            const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
                IPermissionManagementOptions.ontologyTrees,
                atomicOperation.READ,
                requester.id,
                studyId,
                null
            );
            if (!hasStudyLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }
            const responses = await dataCore.deleteOntologyRoutes(requester.id, studyId, ontologyTreeId, routeIds);

            return responses;

        }
    },
    Subscription: {}
};
