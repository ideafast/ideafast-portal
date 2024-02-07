import {
    IField,
    IUser,
    enumDataTypes,
    IGenericResponse
} from '@itmat-broker/itmat-types';
import { studyCore } from '../../core/studyCore';
import { dataCore } from '../../core/dataCore';
import { permissionCore } from '../../core/permissionCore';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../errors';
import { validate } from '@ideafast/idgen';


export const dataResolvers = {
    Query: {
        getStudyFields: async (__unused__parent: Record<string, unknown>, { studyId, versionId }: { studyId: string, projectId?: string, versionId?: string | null }, context: any): Promise<any[]> => {
            const study = (await studyCore.getStudies(studyId))[0];
            // get the versions
            const availableDataVersions: Array<string | null> = !versionId ? (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id)
                : study.dataVersions.filter((__unused__el, index) => index <= study.dataVersions.findIndex(el => el.id === versionId)).map(el => el.id);
            if (versionId === null) {
                availableDataVersions.push(null);
            }
            const dataTypeConvert: any = {
                int: enumDataTypes.INTEGER,
                str: enumDataTypes.STRING,
                bool: enumDataTypes.BOOLEAN,
                json: enumDataTypes.JSON,
                cat: enumDataTypes.CATEGORICAL,
                dec: enumDataTypes.DECIMAL,
                datetime: enumDataTypes.DATETIME,
                file: enumDataTypes.FILE
            };
            const fields: any[] = await dataCore.getStudyFields(context.req.user.id, studyId, availableDataVersions, null);
            fields.forEach(el => {
                el.possibleValues = el.categoricalOptions;
                el.dataType = (() => {
                    for (const key of Object.keys(dataTypeConvert)) {
                        if (dataTypeConvert[key] === el.dataType) {
                            return key;
                        }
                    }
                    return 'str';
                })();
                delete el.categoricalOptions;
                el.dateAdded = el.life.createdTime.toString();
                el.dateDeleted = el.life.deletedTime ? el.life.deletedTime.toString() : null;
            });
            return fields;
        },

        // // getOntologyTree: async (__unused__parent: Record<string, unknown>, { studyId, projectId, treeId }: { studyId: string, projectId: string | null, treeId: string }, context: any): Promise<IOntologyTree> => {
        // //     /**
        // //      * Get the ontology by the name.
        // //      *
        // //      * @param studyId - The id of the study.
        // //      * @param projectId - The id of the project.
        // //      * @param treeName - The name of the tree.
        // //      *
        // //      * @return IOntologyTree
        // //      */

        // //     const requester: IUser = context.req.user;

        // //     // we dont filters fields of an ontology tree by fieldIds
        // //     const hasProjectLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
        // //         IPermissionManagementOptions.ontologyTrees,
        // //         atomicOperation.READ,
        // //         requester.id,
        // //         studyId,
        // //         projectId
        // //     );

        // //     const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
        // //         IPermissionManagementOptions.ontologyTrees,
        // //         atomicOperation.READ,
        // //         requester.id,
        // //         studyId,
        // //         projectId
        // //     );
        // //     if (!hasStudyLevelPermission && !hasProjectLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }

        // //     const ontologyTree: IOntologyTree = await dataCore.getOntologyTree(studyId, treeId);
        // //     return ontologyTree;
        // // },

        getDataRecords: async (__unused__parent: Record<string, unknown>, { studyId, queryString, versionId }: { queryString: any, studyId: string, versionId: string | null | undefined, projectId?: string }, context: any): Promise<any> => {
            const requester: IUser = context.req.user;
            if (queryString.data_requested) {
                for (const fieldId of queryString.data_requested) {
                    await permissionCore.checkDataPermissionByUser(requester.id, { fieldId: fieldId }, studyId);
                }
            }
            const study = (await studyCore.getStudies(studyId))[0];
            // get the versions
            const availableDataVersions: Array<string | null> = !versionId ? (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id)
                : study.dataVersions.filter((__unused__el, index) => index <= study.dataVersions.findIndex(el => el.id === versionId)).map(el => el.id);
            if (versionId === null) {
                availableDataVersions.push(null);
            }
            let filteredFieldIds = (await dataCore.getStudyFields(requester.id, studyId, availableDataVersions, null)).map(el => el.fieldId);
            if (queryString.data_requested) {
                filteredFieldIds = filteredFieldIds.filter(el => queryString.data_requested.includes(el));
            }
            const res = await dataCore.getData(requester.id, studyId, filteredFieldIds, availableDataVersions);
            const combined: any = {};
            for (let i = 0; i < res.length; i++) {
                if (res[i].properties['Participant ID'] && res[i].properties['Visit ID']) {
                    if (!combined[res[i].properties['Participant ID']]) {
                        combined[res[i].properties['Participant ID']] = {};
                    }
                    if (!combined[res[i].properties['Participant ID']][res[i].properties['Visit ID']]) {
                        combined[res[i].properties['Participant ID']][res[i].properties['Visit ID']] = {};
                    }
                    combined[res[i].properties['Participant ID']][res[i].properties['Visit ID']][res[i].fieldId] = res[i].value;
                } else {
                    continue;
                }
            }
            return combined;
        }
    },
    Study: {

    },
    Project: {

    },
    Mutation: {
        createNewField: async (__unused__parent: Record<string, unknown>, { studyId, fieldInput }: { studyId: string, fieldInput: any[] }, context: any): Promise<IGenericResponse[]> => {
            const requester: IUser = context.req.user;
            const responses: IGenericResponse[] = [];
            const dataTypeConvert: any = {
                int: enumDataTypes.INTEGER,
                str: enumDataTypes.STRING,
                bool: enumDataTypes.BOOLEAN,
                json: enumDataTypes.JSON,
                cat: enumDataTypes.CATEGORICAL,
                dec: enumDataTypes.DECIMAL,
                datetime: enumDataTypes.DATETIME,
                file: enumDataTypes.FILE
            };
            for (const item of fieldInput) {
                try {
                    await permissionCore.checkDataPermissionByUser(requester.id, fieldInput, studyId);
                    const response = await dataCore.createField(requester.id, {
                        studyId: studyId,
                        fieldName: item.fieldName,
                        fieldId: item.fieldId,
                        description: item.description,
                        dataType: dataTypeConvert[item.dataType],
                        categoricalOptions: item.possibleValues,
                        unit: item.unit,
                        comments: item.comments,
                        properties: [{
                            name: 'Participant ID',
                            verifier: null,
                            description: '',
                            required: true
                        }, {
                            name: 'Visit ID',
                            verifier: null,
                            description: '',
                            required: true
                        }]
                    });
                    responses.push({ id: response.id, successful: true, code: undefined, description: `Field ${response.fieldId}-${response.fieldName} is created successfully.` });
                } catch (e) {
                    responses.push({ id: item.fieldId, successful: false, code: undefined, description: `Field ${item.fieldId}-${item.fieldName}: ${(e as any).message.toString()}` });
                }
            }
            return responses;
        },
        editField: async (): Promise<IField> => {
            throw new GraphQLError(errorCodes.NOT_IMPLEMENTED);
        },
        deleteField: async (__unused__parent: Record<string, unknown>, { studyId, fieldId }: { studyId: string, fieldId: string }, context: any): Promise<IGenericResponse> => {
            const requester: IUser = context.req.user;
            await permissionCore.checkDataPermissionByUser(requester.id, fieldId, studyId);
            return await dataCore.deleteField(
                requester.id,
                studyId,
                fieldId
            );
        },
        uploadDataInArray: async (__unused__parent: Record<string, unknown>, { studyId, data }: { studyId: string, data: any[] }, context: any): Promise<IGenericResponse[]> => {
            const requester = context.req.user;
            const reformattedData: {
                fieldId: string;
                value: string;
                properties: Record<string, any>;
            }[] = [];
            const tag: boolean[] = [];
            for (const d of data) {
                if (!validate(d.subjectId.slice(1))) {
                    tag.push(false);
                } else {
                    tag.push(true);
                    reformattedData.push({
                        fieldId: d.fieldId,
                        value: d.value,
                        properties: {
                            'Participant ID': d.subjectId,
                            'Visit ID': d.visitId
                        }
                    });
                }
            }
            const res = await dataCore.uploadData(
                requester.id,
                studyId,
                reformattedData
            );
            const combined: IGenericResponse[] = [];
            for (let i = 0; i < tag.length; i++) {
                if (tag[i]) {
                    combined.push(res.shift() as any);
                } else {
                    combined.push({ id: i.toString(), successful: false, code: undefined, description: `Subject ID ${data[i].subjectId} is illegal.` });
                }
            }
            return combined;
        }
        // // createOntologyTree: async (__unused__parent: Record<string, unknown>, { studyId, name, tag }: { studyId: string, name: string, tag: string }, context: any): Promise<IOntologyTree> => {
        // //     /**
        // //      * Create an ontology tree.
        // //      *
        // //      * @param studyId - The id of the study.
        // //      * @param name - The name of the tree.
        // //      * @param tag - The tag.
        // //      *
        // //      * @return IOntologyTree
        // //      */

        // //     const requester = context.req.user;

        // //     const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
        // //         IPermissionManagementOptions.ontologyTrees,
        // //         atomicOperation.WRITE,
        // //         requester.id,
        // //         studyId,
        // //         null
        // //     );
        // //     if (!hasStudyLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }
        // //     const tree = await dataCore.createOntologyTree(requester.id, studyId, name, tag);

        // //     return tree;
        // // },
        // // deleteOntologyTree: async (__unused__parent: Record<string, unknown>, { studyId, ontologyTreeId }: { studyId: string, ontologyTreeId: string }, context: any): Promise<IGenericResponse> => {
        // //     /**
        // //      * Delete an ontology tree.
        // //      *
        // //      * @param requester - The id of the requester.
        // //      * @param studyId - The id of the study.
        // //      * @param ontologyTreeId - The id of the ontology tree.
        // //      *
        // //      * @return IGenericResponse
        // //      */

        // //     const requester = context.req.user;

        // //     const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
        // //         IPermissionManagementOptions.ontologyTrees,
        // //         atomicOperation.READ,
        // //         requester.id,
        // //         studyId,
        // //         null
        // //     );
        // //     if (!hasStudyLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }

        // //     const response = await dataCore.deleteOntologyTree(requester.id, studyId, ontologyTreeId);

        // //     return response;

        // // },
        // // addOntologyRoutes: async (__unused__parent: Record<string, unknown>, { studyId, ontologyTreeId, routes }: { studyId: string, ontologyTreeId: string, routes: { path: string[], name: string, fieldId: string }[] }, context: any): Promise<IGenericResponse[]> => {
        // //     /**
        // //      * Add ontology routes to an ontology tree.
        // //      *
        // //      * @param studyId - The id of the study.
        // //      * @param ontologyTreeId - The id of the ontologyTree.
        // //      * @param routes - The list of ontology routes.
        // //      *
        // //      * @return IGenericResponses
        // //      */

        // //     const requester = context.req.user;
        // //     const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
        // //         IPermissionManagementOptions.ontologyTrees,
        // //         atomicOperation.READ,
        // //         requester.id,
        // //         studyId,
        // //         null
        // //     );
        // //     if (!hasStudyLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }
        // //     const responses = await dataCore.addOntologyRoutes(requester.id, studyId, ontologyTreeId, routes);

        // //     return responses;

        // // },
        // // deleteOntologyRoutes: async (__unused__parent: Record<string, unknown>, { studyId, ontologyTreeId, routeIds }: { studyId: string, ontologyTreeId: string, routeIds: string[] }, context: any): Promise<IGenericResponse[]> => {
        // //     /**
        // //      * Delete ontology routes from an ontology tree.
        // //      *
        // //      * @param studyId - The id of the study.
        // //      * @param ontologyTreeId - The id of the ontologyTree.
        // //      * @param routeIds - The list of ids of ontology routes.
        // //      *
        // //      * @return IGenericResponses
        // //      */

        // //     const requester = context.req.user;
        // //     const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
        // //         IPermissionManagementOptions.ontologyTrees,
        // //         atomicOperation.READ,
        // //         requester.id,
        // //         studyId,
        // //         null
        // //     );
        // //     if (!hasStudyLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }
        // //     const responses = await dataCore.deleteOntologyRoutes(requester.id, studyId, ontologyTreeId, routeIds);

        // //     return responses;

        // // }
        // uploadFileData: async (__unused__parent: Record<string, unknown>, { studyId, file, properties, subjectId, fieldId, visitId, timestamps }: { studyId: string, file: Promise<FileUpload>, properties: Record<string, any>, subjectId: string, fieldId: string, visitId: string | null, timestamps: number | null }, context: any): Promise<IGenericResponse> => {
        //     /**
        //      * Upload a data file.
        //      *
        //      * @param studyId - The id of the study.
        //      * @param file - The file to upload.
        //      * @param properties - The properties of the file. Need to match field properties if defined.
        //      * @param subjectId - The id of the subject.
        //      * @param fieldId - The id of the field.
        //      * @param visitId - The id of the visit.
        //      * @param timestamps - The timestamps of the data.
        //      *
        //      * @return IGenericResponse
        //      */
        //     // const requester = context.req.user;
        //     // const file_ = await file;

        //     // const response = await dataCore.uploadFileData(requester.id, studyId, file_, properties, subjectId, fieldId, visitId, timestamps);
        //     // return response;
        //     return makeGenericReponse('', true);
        // }
    },
    Subscription: {}
};
