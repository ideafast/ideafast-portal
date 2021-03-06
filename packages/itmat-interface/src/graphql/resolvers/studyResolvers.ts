import { ApolloError } from 'apollo-server-express';
import {
    permissions,
    Models,
    task_required_permissions,
    IProject,
    IStudy,
    IStudyDataVersion,
    IFieldEntry,
    IUser,
    studyType,
    IDataClip,
    userTypes,
    IOntologyField,
    ISubjectDataRecordSummary,
    DATA_CLIP_ERROR_TYPE
} from 'itmat-commons';
import { v4 as uuid } from 'uuid';
import { db } from '../../database/database';
import { permissionCore } from '../core/permissionCore';
import { validateAndGenerateFieldEntry } from '../core/fieldCore';
import { studyCore } from '../core/studyCore';
import { errorCodes } from '../errors';
import { IGenericResponse, makeGenericReponse } from '../responses';
import { buildPipeline } from '../../utils/query';

export const studyResolvers = {
    Query: {
        getStudy: async (__unused__parent: Record<string, unknown>, args: Record<string, string>, context: any): Promise<IStudy | null> => {
            const requester: IUser = context.req.user;
            const studyId: string = args.studyId;

            /* user can get study if he has readonly permission */
            const hasPermission = await permissionCore.userHasTheNeccessaryPermission(
                [permissions.specific_study.specific_study_readonly_access],
                requester,
                studyId
            );
            if (!hasPermission) { throw new ApolloError(errorCodes.NO_PERMISSION_ERROR); }

            const study = await db.collections!.studies_collection.findOne({ id: studyId, deleted: null })!;
            if (study === null || study === undefined) {
                throw new ApolloError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            }
            return study;
        },
        getProject: async (__unused__parent: Record<string, unknown>, args: any, context: any): Promise<Omit<IProject, 'patientMapping'> | null> => {
            const requester: IUser = context.req.user;
            const projectId: string = args.projectId;

            /* get project */ // defer patientMapping since it's costly and not available to all users
            const project = await db.collections!.projects_collection.findOne<Omit<IProject, 'patientMapping'>>({ id: projectId, deleted: null }, { projection: { patientMapping: 0 } })!;

            if (project === null) {
                throw new ApolloError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            }

            /* check if user has permission */
            const hasProjectLevelPermission = await permissionCore.userHasTheNeccessaryPermission(
                [permissions.specific_project.specific_project_readonly_access],
                requester,
                project.studyId,
                projectId
            );

            const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryPermission(
                [permissions.specific_study.specific_study_readonly_access],
                requester,
                project.studyId
            );
            if (!hasStudyLevelPermission && !hasProjectLevelPermission) { throw new ApolloError(errorCodes.NO_PERMISSION_ERROR); }

            return project;
        },
        getStudyFields: async (__unused__parent: Record<string, unknown>, { studyId, projectId }: { studyId: string, projectId?: string }, context: any): Promise<IFieldEntry[]> => {
            const requester: IUser = context.req.user;
            /* user can get study if he has readonly permission */
            const hasPermission = await permissionCore.userHasTheNeccessaryPermission(
                [permissions.specific_study.specific_study_readonly_access],
                requester,
                studyId
            );
            const hasProjectLevelPermission = await permissionCore.userHasTheNeccessaryPermission(
                [permissions.specific_project.specific_project_readonly_access],
                requester,
                studyId,
                projectId
            );
            if (!hasPermission && !hasProjectLevelPermission) { throw new ApolloError(errorCodes.NO_PERMISSION_ERROR); }
            const result = await db.collections!.field_dictionary_collection.find({ studyId: studyId, deleted: null }).toArray();

            return result;
        },
        getOntologyTree: async (__unused__parent: Record<string, unknown>, { studyId, projectId }: { studyId: string, projectId: string }, context: any): Promise<any> => {
            const requester: IUser = context.req.user;
            /* user can get study if he has readonly permission */
            const hasPermission = await permissionCore.userHasTheNeccessaryPermission(
                [permissions.specific_study.specific_study_readonly_access],
                requester,
                studyId
            );
            const hasProjectLevelPermission = await permissionCore.userHasTheNeccessaryPermission(
                [permissions.specific_project.specific_project_readonly_access],
                requester,
                studyId,
                projectId
            );
            if (!hasPermission && !hasProjectLevelPermission) { throw new ApolloError(errorCodes.NO_PERMISSION_ERROR); }
            const result = await db.collections!.studies_collection.findOne({ id: studyId });
            return result.ontologyTree;
        },
        checkDataComplete: async (__unused__parent: Record<string, unknown>, { studyId }: { studyId: string }, context: any): Promise<any> => {
            const requester: IUser = context.req.user;

            /* user can get study if he has readonly permission */
            const hasPermission = await permissionCore.userHasTheNeccessaryPermission(
                [permissions.specific_study.specific_study_data_management],
                requester,
                studyId
            );
            if (!hasPermission) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }
            // console.log(await db.collections!.field_dictionary_collection.find({ }).toArray());
            const fieldsList = await db.collections!.field_dictionary_collection.find({ studyId: studyId, dateDeleted: null }).toArray();
            const summary: ISubjectDataRecordSummary[] = [];
            // we only check data that hasnt been pushed to a new data version
            const data: any[] = await db.collections!.data_collection.find({ m_studyId: studyId, m_versionId: null, deleted: null }).toArray();
            for (let i=0; i<data.length; i++) {
                const record: ISubjectDataRecordSummary = {
                    subjectId: data[i].m_subjectId,
                    visitId: data[i].m_visitId,
                    missingFields: []
                };
                for (let j=0; j<fieldsList.length; j++) {
                    if (data[i][fieldsList[j].fieldId] === undefined || data[i][fieldsList[j].fieldId] === null) {
                        record.missingFields.push(fieldsList[j].fieldId);
                    }
                }
                summary.push(record);
            }
            return summary;
        },
        getDataRecords: async (__unused__parent: Record<string, unknown>, { studyId, queryString, versionId, projectId }: { queryString: any, studyId: string, versionId: string[], projectId?: string }, context: any): Promise<any> => {
            const requester: IUser = context.req.user;

            /* user can get study if he has readonly permission */
            const hasPermission = await permissionCore.userHasTheNeccessaryPermission(
                [permissions.specific_study.specific_study_data_management, permissions.specific_project.specific_project_readonly_access],
                requester,
                studyId
            );
            const hasProjectLevelPermission = await permissionCore.userHasTheNeccessaryPermission(
                [permissions.specific_project.specific_project_readonly_access],
                requester,
                studyId,
                projectId
            );
            if (!hasPermission && !hasProjectLevelPermission) { throw new ApolloError(errorCodes.NO_PERMISSION_ERROR); }
            let availableDataVersions: any[] = [];
            let result;
            const thisStudy = await db.collections!.studies_collection.findOne({ id: studyId });
            if (versionId !== undefined) {
                if (versionId.length === 1 && versionId[0] === null) {
                    if (hasPermission) {
                        availableDataVersions = versionId;
                    } else {
                        throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
                    }
                } else {
                    availableDataVersions = versionId;
                }
            } else {
                if (thisStudy.currentDataVersion !== -1) {
                    const endContentId = thisStudy.dataVersions[thisStudy.currentDataVersion].contentId;
                    for (let i=0; i<thisStudy.dataVersions.length; i++) {
                        availableDataVersions.push(thisStudy.dataVersions[i].contentId);
                        if (thisStudy.dataVersions[i].contentId === endContentId) {
                            break;
                        }
                    }
                }
                if (requester.type === userTypes.ADMIN) {
                    availableDataVersions.push(null);
                }
            }
            if (queryString !== undefined && queryString.data_requested.length !== 0) {
                const pipeline = buildPipeline(queryString, studyId, availableDataVersions);
                result = await db.collections!.data_collection.aggregate(pipeline).toArray();
            } else {
                result = await db.collections!.data_collection.find({ m_studyId: studyId, m_versionId: {$in: availableDataVersions} }).toArray();
            }
            return {data: result};
        }
    },
    Study: {
        projects: async (study: IStudy): Promise<Array<unknown>> => {
            return await db.collections!.projects_collection.find({ studyId: study.id, deleted: null }).toArray();
        },
        jobs: async (study: IStudy): Promise<Array<unknown>> => {
            return await db.collections!.jobs_collection.find({ studyId: study.id }).toArray();
        },
        roles: async (study: IStudy): Promise<Array<unknown>> => {
            return await db.collections!.roles_collection.find({ studyId: study.id, projectId: null, deleted: null }).toArray();
        },
        files: async (study: IStudy): Promise<Array<unknown>> => {
            return await db.collections!.files_collection.find({ studyId: study.id, deleted: null }).toArray();
        },
        numOfSubjects: async (study: IStudy): Promise<number> => {
            if (study.currentDataVersion === -1) {
                return 0;
            }
            const validDataVersions: any[] = [];
            for (let i=0; i<study.dataVersions.length; i++) {
                if (i <= study.currentDataVersion) {
                    validDataVersions.push(study.dataVersions[i].id);
                }
            }
            const validContentIds: string[] = [];
            const endContentId = study.dataVersions[study.currentDataVersion].contentId;
            for (let i=0; i<study.dataVersions.length; i++) {
                validContentIds.push(study.dataVersions[i].contentId);
                if (study.dataVersions[i].contentId === endContentId) {
                    break;
                }
            }
            return study.currentDataVersion === -1 ? 0 : (await db.collections!.data_collection.distinct('m_subjectId', { m_studyId: study.id, m_versionId: { $in: validContentIds }})).length;
        },
        currentDataVersion: async (study: IStudy): Promise<null | number> => {
            return study.currentDataVersion === -1 ? null : study.currentDataVersion;
        }
    },
    Project: {
        fields: async (project: Omit<IProject, 'patientMapping'>): Promise<Record<string, any>> => {
            const approvedFields = ([] as string[]).concat(...Object.values(project.approvedFields));
            const result: IFieldEntry[] = await db.collections!.field_dictionary_collection.find({ studyId: project.studyId, id: { $in: approvedFields }, deleted: null }).toArray();
            return result;
        },
        jobs: async (project: Omit<IProject, 'patientMapping'>): Promise<Array<any>> => {
            return await db.collections!.jobs_collection.find({ studyId: project.studyId, projectId: project.id }).toArray();
        },
        files: async (project: Omit<IProject, 'patientMapping'>): Promise<Array<any>> => {
            return await db.collections!.files_collection.find({ studyId: project.studyId, id: { $in: project.approvedFiles }, deleted: null }).toArray();
        },
        patientMapping: async (project: Omit<IProject, 'patientMapping'>, __unused__args: never, context: any): Promise<any> => {
            const requester: IUser = context.req.user;
            /* check privileges */
            if (!(await permissionCore.userHasTheNeccessaryPermission(
                task_required_permissions.access_study_data,  // patientMapping is not visible to project users; only to study users.
                requester,
                project.studyId
            ))) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            /* returning */
            const result =
                await db.collections!.projects_collection.findOne(
                    { id: project.id, deleted: null },
                    { projection: { patientMapping: 1 } }
                );
            if (result && result.patientMapping) {
                return result.patientMapping;
            } else {
                return null;
            }
        },
        approvedFields: async (project: IProject, __unused__args: never, context: any): Promise<Record<string, string[]>> => {
            const requester: IUser = context.req.user;
            /* check privileges */
            if (!(await permissionCore.userHasTheNeccessaryPermission(
                task_required_permissions.manage_study_projects.concat(task_required_permissions.access_project_data),
                requester,
                project.studyId,
                project.id
            ))) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            return project.approvedFields;
        },
        approvedFiles: async (project: IProject, __unused__args: never, context: any): Promise<string[]> => {
            const requester: IUser = context.req.user;

            /* check privileges */
            if (!(await permissionCore.userHasTheNeccessaryPermission(
                task_required_permissions.manage_study_projects.concat(task_required_permissions.access_project_data),
                requester,
                project.studyId,
                project.id
            ))) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            return project.approvedFiles;
        },
        roles: async (project: IProject): Promise<Array<any>> => {
            return await db.collections!.roles_collection.find({ studyId: project.studyId, projectId: project.id, deleted: null }).toArray();
        },
        iCanEdit: async (project: IProject): Promise<boolean> => { // TO_DO
            await db.collections!.roles_collection.findOne({
                studyId: project.studyId,
                projectId: project.id
                // permissions: permissions.specific_project.specifi
            });
            return true;
        }
    },
    Mutation: {
        createStudy: async (__unused__parent: Record<string, unknown>, { name, description, type }: { name: string, description: string, type: studyType }, context: any): Promise<IStudy> => {
            const requester: IUser = context.req.user;

            /* check privileges */
            if (requester.type !== Models.UserModels.userTypes.ADMIN) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            /* create study */
            const study = await studyCore.createNewStudy(name, description, type, requester.id);
            return study;
        },
        editStudy: async (__unused__parent: Record<string, unknown>, { studyId, description }: { studyId: string, description: string }, context: any): Promise<IStudy> => {
            const requester: IUser = context.req.user;

            /* check privileges */
            if (requester.type !== Models.UserModels.userTypes.ADMIN) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            /* create study */
            const study = await studyCore.editStudy(studyId, description);
            return study;
        },
        createNewField: async (__unused__parent: Record<string, unknown>, { studyId, fieldInput }: { studyId: string, fieldInput: any[] }, context: any): Promise<any[]> => {
            const requester: IUser = context.req.user;
            /* check privileges */
            /* user can get study if he has readonly permission */
            const hasPermission = await permissionCore.userHasTheNeccessaryPermission(
                [permissions.specific_study.specific_study_data_management],
                requester,
                studyId
            );
            if (!hasPermission) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            // check study exists
            await studyCore.findOneStudy_throwErrorIfNotExist(studyId);

            const error: any[] = [];
            let isError = false;
            // check fieldId duplicate
            for (const oneFieldInput of fieldInput) {
                isError = false;
                const searchField = await db.collections!.field_dictionary_collection.findOne({ studyId: studyId, fieldId: oneFieldInput.fieldId });
                if (searchField) {
                    // throw new ApolloError('Field already exists, please select another ID.', errorCodes.CLIENT_MALFORMED_INPUT);
                    error.push({code: DATA_CLIP_ERROR_TYPE.MALFORMED_INPUT, description: `Field ${oneFieldInput.fieldId} already exists, please select another ID.`});
                    isError = true;
                }

                // check data valid
                if (!isError) {
                    const {fieldEntry, error: thisError} = validateAndGenerateFieldEntry(oneFieldInput);
                    if (thisError.length !== 0) {
                        error.push({code: DATA_CLIP_ERROR_TYPE.MALFORMED_INPUT, description: `Field ${oneFieldInput.fieldId}: ${JSON.stringify(thisError)}`});
                        isError = true;
                    }

                    // // construct the rest of the fields
                    if (!isError) {
                        fieldEntry.id = uuid();
                        fieldEntry.studyId = studyId;
                        fieldEntry.dateAdded = (new Date()).valueOf();
                        fieldEntry.dateDeleted = null;
                        await db.collections!.field_dictionary_collection.insertOne(fieldEntry);
                    }
                }
            }
            return error;
        },
        editField: async (__unused__parent: Record<string, unknown>, { studyId, fieldInput }: { studyId: string, fieldInput: any }, context: any): Promise<IFieldEntry> => {
            const requester: IUser = context.req.user;
            /* check privileges */
            if (requester.type !== Models.UserModels.userTypes.ADMIN) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            // check fieldId exist
            const searchField = await db.collections!.field_dictionary_collection.findOne({ studyId: studyId, fieldId: fieldInput.fieldId });
            if (!searchField) {
                throw new ApolloError('Field does not exist.', errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            }
            for (const each of Object.keys(fieldInput)) {
                searchField[each] = fieldInput[each];
            }
            const {fieldEntry, error} = validateAndGenerateFieldEntry(searchField);
            if (error.length !== 0) {
                throw new ApolloError(JSON.stringify(error), errorCodes.CLIENT_MALFORMED_INPUT);
            }
            const newFieldEntry = {...fieldEntry, id: searchField.id, dateAdded: searchField.dateAdded, deleted: searchField.dateDeleted, studyId: searchField.studyId};
            await db.collections!.field_dictionary_collection.findOneAndUpdate({ studyId: studyId, fieldId: newFieldEntry.fieldId }, {$set: newFieldEntry});

            return newFieldEntry;

        },
        deleteField: async (__unused__parent: Record<string, unknown>, { studyId, fieldId }: { studyId: string, fieldId: number }, context: any): Promise<IFieldEntry> => {
            const requester: IUser = context.req.user;
            /* check privileges */
            if (!(await permissionCore.userHasTheNeccessaryPermission(
                task_required_permissions.manage_study_data,
                requester,
                studyId
            ))) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            // check fieldId exist
            const searchField = await db.collections!.field_dictionary_collection.findOne({ studyId: studyId, fieldId: fieldId });
            if (!searchField) {
                throw new ApolloError('Field does not exist.', errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            }
            await db.collections!.field_dictionary_collection.findOneAndUpdate({ studyId: studyId, fieldId: fieldId }, {$set: {deleted: (new Date()).valueOf()} });

            return searchField;

        },
        uploadDataInArray: async (__unused__parent: Record<string, unknown>, { studyId, data }: { studyId: string, data: IDataClip[] }, context: any): Promise<any> => {
            // check study exists
            await studyCore.findOneStudy_throwErrorIfNotExist(studyId);

            const requester: IUser = context.req.user;
            /* check privileges */
            /* user can get study if he has readonly permission */
            const hasPermission = await permissionCore.userHasTheNeccessaryPermission(
                [permissions.specific_study.specific_study_data_management],
                requester,
                studyId
            );
            if (!hasPermission) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            // find the fieldsList
            const fieldsList = await db.collections!.field_dictionary_collection.find({ studyId: studyId }).toArray();
            if (!fieldsList) {
                throw new ApolloError('FieldTree is not valid', errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            }

            const errors: string[] = [];
            for (const each of data) {
                const error = (await studyCore.uploadOneDataClip(studyId, fieldsList, each));
                if (error !== null) {
                    errors.push(error);
                }
            }
            return errors;
        },
        deleteDataRecords: async (__unused__parent: Record<string, unknown>, { studyId, subjectId, visitId, fieldIds }: { studyId: string, subjectId: string, visitId: string, fieldIds: string[] }, context: any): Promise<any> => {
            // check study exists
            await studyCore.findOneStudy_throwErrorIfNotExist(studyId);

            const requester: IUser = context.req.user;
            /* check privileges */
            if (!(await permissionCore.userHasTheNeccessaryPermission(
                task_required_permissions.manage_study_data,
                requester,
                studyId
            ))) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            // construct query object
            const queryObj: any = {
            };
            if (subjectId) {
                queryObj.m_subjectId = subjectId;
            }
            if (visitId) {
                queryObj.m_visitId = visitId;
            }
            queryObj.m_versionId = null;
            // delete records
            if (fieldIds){
                // remove certain value, but not set record as deleted
                const fields = fieldIds.reduce((acc,curr)=> (acc[curr] = undefined,acc), {});
                await db.collections!.data_collection.updateMany(queryObj, {
                    $set: fields
                });
            } else {
                // direct set satisfied records as deleted
                await db.collections!.data_collection.updateMany(queryObj, {
                    $set: { dateDeleted: (new Date()).toISOString() }
                });
            }

            return [];
        },
        createNewDataVersion: async (__unused__parent: Record<string, unknown>, { studyId, dataVersion, tag }: { studyId: string, dataVersion: string, tag: string }, context: any): Promise<IStudyDataVersion> => {
            // check study exists
            await studyCore.findOneStudy_throwErrorIfNotExist(studyId);

            const requester: IUser = context.req.user;

            /* check privileges */
            if (requester.type !== Models.UserModels.userTypes.ADMIN) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            // check dataVersion name valid
            if (!/^\d{1,3}(\.\d{1,2}){0,2}$/.test(dataVersion)) {
                throw new ApolloError(errorCodes.CLIENT_MALFORMED_INPUT);
            }
            const created = await studyCore.createNewDataVersion(studyId, tag, dataVersion);
            return created;
        },
        addOntologyField: async (__unused__parent: Record<string, unknown>, { studyId, ontologyInput }: { studyId: string, ontologyInput: IOntologyField[] }, context: any): Promise<any> => {
            const requester: IUser = context.req.user;

            /* check privileges */
            if (requester.type !== Models.UserModels.userTypes.ADMIN) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            // sample path
            // name1>name2>fieldId1>fieldId2...
            // check study exists
            const study = await studyCore.findOneStudy_throwErrorIfNotExist(studyId);
            let newOntologyFields: any[];
            if (study.ontologyTree === undefined || study.ontologyTree === null) {
                newOntologyFields = [];
            } else {
                newOntologyFields = study.ontologyTree;
            }
            for (let i=0; i<ontologyInput.length; i++) {
                // check fieldId exists
                const fieldExist = await db.collections!.field_dictionary_collection.findOne({ studyId: studyId, fieldId: ontologyInput[i].fieldId });
                // check path last item is the same fieldId
                const parts = ontologyInput[i].path;
                if (parts[parts.length - 1] !== ontologyInput[i].fieldId) {
                    continue;
                }
                if (fieldExist) {
                    // check if existing in ontologyTree
                    const index = newOntologyFields.map(el => JSON.stringify(el)).indexOf(JSON.stringify(newOntologyFields.filter(el => el.fieldId === ontologyInput[i].fieldId)[0]));
                    if (index !== -1) {
                        newOntologyFields[index] = ontologyInput[i];
                    } else {
                        newOntologyFields.push(ontologyInput[i]);
                    }
                } else {
                    continue;
                }
            }
            await db.collections!.studies_collection.findOneAndUpdate({ id: studyId }, { $set: { ontologyTree: newOntologyFields } });
            return newOntologyFields;
        },
        deleteOntologyField: async (__unused__parent: Record<string, unknown>, { studyId, fieldId }: { studyId: string, fieldId: string[] }, context: any): Promise<any> => {
            const requester: IUser = context.req.user;
            /* check privileges */
            if (requester.type !== Models.UserModels.userTypes.ADMIN) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            // check study exists
            const study = await studyCore.findOneStudy_throwErrorIfNotExist(studyId);
            const returnResult: any[] = [];
            let ontologyFields;
            if (study.ontologyTree === undefined) {
                ontologyFields = [];
            } else {
                ontologyFields = study.ontologyTree;
            }
            for (let i=ontologyFields.length-1; i>=0; i--) {
                if (fieldId.includes(ontologyFields[i].fieldId)) {
                    returnResult.push(ontologyFields[i]);
                    ontologyFields.splice(i, 1);
                }
            }
            await db.collections!.studies_collection.findOneAndUpdate({id: studyId}, {$set: {ontologyTree: ontologyFields}});
            return returnResult;
        },
        createProject: async (__unused__parent: Record<string, unknown>, { studyId, projectName }: { studyId: string, projectName: string }, context: any): Promise<IProject> => {
            const requester: IUser = context.req.user;

            /* check privileges */
            if (!(await permissionCore.userHasTheNeccessaryPermission(
                task_required_permissions.manage_study_projects,
                requester,
                studyId
            ))) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            /* making sure that the study exists first */
            await studyCore.findOneStudy_throwErrorIfNotExist(studyId);

            /* create project */
            const project = await studyCore.createProjectForStudy(studyId, projectName, requester.id);
            return project;
        },
        deleteProject: async (__unused__parent: Record<string, unknown>, { projectId }: { projectId: string }, context: any): Promise<IGenericResponse> => {
            const requester: IUser = context.req.user;

            const project = await studyCore.findOneProject_throwErrorIfNotExist(projectId);

            /* check privileges */
            if (!(await permissionCore.userHasTheNeccessaryPermission(
                task_required_permissions.manage_study_projects,
                requester,
                project.studyId
            ))) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            /* delete project */
            await studyCore.deleteProject(projectId);
            return makeGenericReponse(projectId);
        },
        deleteStudy: async (__unused__parent: Record<string, unknown>, { studyId }: { studyId: string }, context: any): Promise<IGenericResponse> => {
            const requester: IUser = context.req.user;

            /* check privileges */
            if (requester.type !== Models.UserModels.userTypes.ADMIN) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            const study = await db.collections!.studies_collection.findOne({ id: studyId, deleted: null });

            if (study) {
                /* delete study */
                await studyCore.deleteStudy(studyId);
            } else {
                throw new ApolloError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            }

            return makeGenericReponse(studyId);
        },
        editProjectApprovedFields: async (__unused__parent: Record<string, unknown>, { projectId, approvedFields }: { projectId: string, approvedFields: string[] }, context: any): Promise<IProject> => {
            const requester: IUser = context.req.user;

            /* check study id for the project */
            const project = await studyCore.findOneProject_throwErrorIfNotExist(projectId);

            /* check privileges */
            if (!(await permissionCore.userHasTheNeccessaryPermission(
                task_required_permissions.manage_study_projects,
                requester,
                project.studyId
            ))) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            /* check field tree exists */
            const study = await studyCore.findOneStudy_throwErrorIfNotExist(project.studyId);
            const currentDataVersion = study.dataVersions[study.currentDataVersion];
            if (!currentDataVersion) {
                throw new ApolloError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            }

            /* check all the fields are valid */
            const activefields = await db.collections!.field_dictionary_collection.find({ id: { $in: approvedFields }, deleted: null }).toArray();
            if (activefields.length !== approvedFields.length) {
                throw new ApolloError('Some of the fields provided in your changes are not valid.', errorCodes.CLIENT_MALFORMED_INPUT);
            }


            /* edit approved fields */
            const resultingProject = await studyCore.editProjectApprovedFields(projectId, approvedFields);
            return resultingProject;
        },
        editProjectApprovedFiles: async (__unused__parent: Record<string, unknown>, { projectId, approvedFiles }: { projectId: string, approvedFiles: string[] }, context: any): Promise<IProject> => {
            const requester: IUser = context.req.user;

            /* check study id for the project */
            const project = await studyCore.findOneProject_throwErrorIfNotExist(projectId);

            /* check privileges */
            if (!(await permissionCore.userHasTheNeccessaryPermission(
                task_required_permissions.manage_study_projects,
                requester,
                project.studyId
            ))) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            /* check all the files are valid */
            const activefiles = await db.collections!.files_collection.find({ id: { $in: approvedFiles }, deleted: null }).toArray();
            if (activefiles.length !== approvedFiles.length) {
                throw new ApolloError('Some of the files provided in your changes are not valid.', errorCodes.CLIENT_MALFORMED_INPUT);
            }

            /* edit approved fields */
            const resultingProject = await studyCore.editProjectApprovedFiles(projectId, approvedFiles);
            return resultingProject;
        },
        setDataversionAsCurrent: async (__unused__parent: Record<string, unknown>, { studyId, dataVersionId }: { studyId: string, dataVersionId: string }, context: any): Promise<IStudy> => {
            const requester: IUser = context.req.user;

            /* check privileges */
            if (!(await permissionCore.userHasTheNeccessaryPermission(
                task_required_permissions.manage_study_data,
                requester,
                studyId
            ))) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            const study = await studyCore.findOneStudy_throwErrorIfNotExist(studyId);

            /* check whether the dataversion exists */
            const selectedataVersionFiltered = study.dataVersions.filter((el) => el.id === dataVersionId);
            if (selectedataVersionFiltered.length !== 1) {
                throw new ApolloError(errorCodes.CLIENT_MALFORMED_INPUT);
            }

            /* create a new dataversion with the same contentId */
            const newDataVersion: IStudyDataVersion = {
                ...selectedataVersionFiltered[0],
                id: uuid()
            };

            /* add this to the database */
            const result = await db.collections!.studies_collection.findOneAndUpdate({ id: studyId, deleted: null }, {
                $push: { dataVersions: newDataVersion }, $inc: { currentDataVersion: 1 }
            }, { returnOriginal: false });

            if (result.ok === 1) {
                return result.value;
            } else {
                throw new ApolloError(errorCodes.DATABASE_ERROR);
            }
        }
    },
    Subscription: {}
};
