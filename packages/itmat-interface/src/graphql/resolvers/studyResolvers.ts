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

export const studyResolvers = {
    Query: {
        getStudy: async (__unused__parent: Record<string, unknown>, { studyId }: { studyId: string }, context: any): Promise<Partial<IStudy>> => {
            /**
             * Get the info of a study.
             *
             * @param studyId - The if of the study.
             *
             * @return Partial<IStudy>
             */
            const requester: IUser = context.req.user;
            /* user can get study if he has readonly permission */
            const hasPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
                IPermissionManagementOptions.own,
                atomicOperation.READ,
                requester.id,
                studyId,
                null
            );

            if (!hasPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }

            const study = await studyCore.getStudy(studyId);

            return {
                id: study.id,
                name: study.name,
                description: study.description,
                currentDataVersion: requester.type === enumUserTypes.ADMIN ? study.currentDataVersion : undefined,
                dataVersions: requester.type === enumUserTypes.ADMIN ? study.dataVersions : undefined,
                groupList: requester.type === enumUserTypes.ADMIN ? study.groupList : undefined
            };
        }

        /** TODO */
        // getProject: async (__unused__parent: Record<string, unknown>, args: any, context: any): Promise<Omit<IProject, 'patientMapping'> | null> => {
        //     const requester: IUser = context.req.user;
        //     const projectId: string = args.projectId;

        //     /* get project */ // defer patientMapping since it's costly and not available to all users
        //     const project = await db.collections!.projects_collection.findOne({ id: projectId, deleted: null }, { projection: { patientMapping: 0 } })!;
        //     if (!project)
        //         throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);

        //     /* check if user has permission */
        //     const hasProjectLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
        //         IPermissionManagementOptions.own,
        //         atomicOperation.READ,
        //         requester,
        //         project.studyId,
        //         projectId
        //     );

        //     const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
        //         IPermissionManagementOptions.own,
        //         atomicOperation.READ,
        //         requester,
        //         project.studyId
        //     );
        //     if (!hasStudyLevelPermission && !hasProjectLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }

        //     return project;
        // },


    },
    Study: {
        // projects: async (study: IStudy): Promise<Array<IProject>> => {
        //     return await db.collections!.projects_collection.find({ studyId: study.id, deleted: null }).toArray();
        // },
        // jobs: async (study: IStudy): Promise<Array<IJob<any>>> => {
        //     return await db.collections!.jobs_collection.find({ studyId: study.id }).toArray();
        // },
        // roles: async (study: IStudy): Promise<Array<IRole>> => {
        //     return await db.collections!.roles_collection.find({ studyId: study.id, projectId: undefined, deleted: null }).toArray();
        // },
        // files: async (study: IStudy, __unused__args: never, context: any): Promise<Array<IFile>> => {
        //     const requester: IUser = context.req.user;
        //     const hasPermission = await permissionCore.userHasTheNeccessaryDataPermission(
        //         atomicOperation.READ,
        //         requester,
        //         study.id
        //     );
        //     let adds: string[] = [];
        //     let removes: string[] = [];
        //     if (hasPermission) {
        //         const availableDataVersions: Array<string | null> = (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id);
        //         if (hasPermission.hasVersioned) {
        //             availableDataVersions.push(null);
        //         }
        //         // we do not use metadata filter because unvesioned data is needed
        //         const fileFieldIds: string[] = (await db.collections!.field_dictionary_collection.aggregate([{
        //             $match: { studyId: study.id, dateDeleted: null, dataVersion: { $in: availableDataVersions }, dataType: enumValueType.FILE }
        //         }, { $match: { fieldId: { $in: hasPermission.raw.fieldIds.map((el: string) => new RegExp(el)) } } }, {
        //             $group: {
        //                 _id: '$fieldId',
        //                 doc: { $last: '$$ROOT' }
        //             }
        //         }, {
        //             $replaceRoot: {
        //                 newRoot: '$doc'
        //             }
        //         }, {
        //             $sort: { fieldId: 1 }
        //         }]).toArray()).map(el => el.fieldId);
        //         let fileRecords;
        //         if (Object.keys(hasPermission.matchObj).length === 0) {
        //             // ADMIN
        //             fileRecords = (await db.collections!.data_collection.aggregate([{
        //                 $match: { m_studyId: study.id, m_versionId: { $in: availableDataVersions }, m_fieldId: { $in: fileFieldIds } }
        //             }]).toArray());
        //         } else {
        //             fileRecords = (await db.collections!.data_collection.aggregate([{
        //                 $match: { m_studyId: study.id, m_versionId: { $in: availableDataVersions }, m_fieldId: { $in: fileFieldIds } }
        //             }, {
        //                 $match: { m_subjectId: { $in: hasPermission.raw.subjectIds.map((el: string) => new RegExp(el)) } }
        //             }, {
        //                 $match: { m_visitId: { $in: hasPermission.raw.visitIds.map((el: string) => new RegExp(el)) } }
        //             }]).toArray());
        //         }
        //         adds = fileRecords.map(el => el.metadata?.add || []).flat();
        //         removes = fileRecords.map(el => el.metadata?.remove || []).flat();
        //     }
        //     return await db.collections!.files_collection.find({ studyId: study.id, deleted: null, $or: [{ id: { $in: adds, $nin: removes } }, { description: JSON.stringify({}) }] }).toArray();
        // },
        // subjects: async (study: IStudy, __unused__args: never, context: any): Promise<Array<Array<string>>> => {
        //     const requester: IUser = context.req.user;
        //     const hasPermission = await permissionCore.userHasTheNeccessaryDataPermission(
        //         atomicOperation.READ,
        //         requester,
        //         study.id
        //     );
        //     if (!hasPermission) {
        //         return [[], []];
        //     }
        //     const availableDataVersions: Array<string> = (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id);
        //     const versionedSubjects = (await db.collections!.data_collection.distinct('m_subjectId', {
        //         m_studyId: study.id,
        //         m_versionId: { $in: availableDataVersions },
        //         m_subjectId: { $in: hasPermission.raw.subjectIds.map((el: string) => new RegExp(el)) },
        //         m_visitId: { $in: hasPermission.raw.visitIds.map((el: string) => new RegExp(el)) },
        //         m_fieldId: { $in: hasPermission.raw.fieldIds.map((el: string) => new RegExp(el)) },
        //         value: { $ne: null }
        //     })).sort() || [];
        //     const unVersionedSubjects = hasPermission.hasVersioned ? (await db.collections!.data_collection.distinct('m_subjectId', {
        //         m_studyId: study.id,
        //         m_versionId: { $in: [null] },
        //         m_subjectId: { $in: hasPermission.raw.subjectIds.map((el: string) => new RegExp(el)) },
        //         m_visitId: { $in: hasPermission.raw.visitIds.map((el: string) => new RegExp(el)) },
        //         m_fieldId: { $in: hasPermission.raw.fieldIds.map((el: string) => new RegExp(el)) },
        //         value: { $ne: null }
        //     })).sort() || [] : [];
        //     return [versionedSubjects, unVersionedSubjects];
        // },
        // visits: async (study: IStudy, __unused__args: never, context: any): Promise<Array<Array<string>>> => {
        //     const requester: IUser = context.req.user;
        //     const hasPermission = await permissionCore.userHasTheNeccessaryDataPermission(
        //         atomicOperation.READ,
        //         requester,
        //         study.id
        //     );
        //     if (!hasPermission) {
        //         return [[], []];
        //     }
        //     const availableDataVersions: Array<string> = (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id);
        //     const versionedVisits = (await db.collections!.data_collection.distinct('m_visitId', {
        //         m_studyId: study.id,
        //         m_versionId: { $in: availableDataVersions },
        //         m_subjectId: { $in: hasPermission.raw.subjectIds.map((el: string) => new RegExp(el)) },
        //         m_visitId: { $in: hasPermission.raw.visitIds.map((el: string) => new RegExp(el)) },
        //         m_fieldId: { $in: hasPermission.raw.fieldIds.map((el: string) => new RegExp(el)) },
        //         value: { $ne: null }
        //     })).sort((a, b) => parseFloat(a) - parseFloat(b));
        //     const unVersionedVisits = hasPermission.hasVersioned ? (await db.collections!.data_collection.distinct('m_visitId', {
        //         m_studyId: study.id,
        //         m_versionId: { $in: [null] },
        //         m_subjectId: { $in: hasPermission.raw.subjectIds.map((el: string) => new RegExp(el)) },
        //         m_visitId: { $in: hasPermission.raw.visitIds.map((el: string) => new RegExp(el)) },
        //         m_fieldId: { $in: hasPermission.raw.fieldIds.map((el: string) => new RegExp(el)) },
        //         value: { $ne: null }
        //     })).sort((a, b) => parseFloat(a) - parseFloat(b)) : [];
        //     return [versionedVisits, unVersionedVisits];
        // },
        // numOfRecords: async (study: IStudy, __unused__args: never, context: any): Promise<number[]> => {
        //     const requester: IUser = context.req.user;
        //     const hasPermission = await permissionCore.userHasTheNeccessaryDataPermission(
        //         atomicOperation.READ,
        //         requester,
        //         study.id
        //     );
        //     if (!hasPermission) {
        //         return [0, 0];
        //     }
        //     const availableDataVersions: Array<string | null> = (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id);
        //     const numberOfVersioned: number = (await db.collections!.data_collection.aggregate([{
        //         $match: { m_studyId: study.id, m_versionId: { $in: availableDataVersions }, value: { $ne: null } }
        //     }, {
        //         $match: {
        //             m_subjectId: { $in: hasPermission.raw.subjectIds.map((el: string) => new RegExp(el)) },
        //             m_visitId: { $in: hasPermission.raw.visitIds.map((el: string) => new RegExp(el)) },
        //             m_fieldId: { $in: hasPermission.raw.fieldIds.map((el: string) => new RegExp(el)) }
        //         }
        //     }, {
        //         $count: 'count'
        //     }]).toArray())[0]?.count || 0;
        //     const numberOfUnVersioned: number = hasPermission.hasVersioned ? (await db.collections!.data_collection.aggregate([{
        //         $match: { m_studyId: study.id, m_versionId: { $in: [null] }, value: { $ne: null } }
        //     }, {
        //         $match: {
        //             m_subjectId: { $in: hasPermission.raw.subjectIds.map((el: string) => new RegExp(el)) },
        //             m_visitId: { $in: hasPermission.raw.visitIds.map((el: string) => new RegExp(el)) },
        //             m_fieldId: { $in: hasPermission.raw.fieldIds.map((el: string) => new RegExp(el)) }
        //         }
        //     }, {
        //         $count: 'count'
        //     }]).toArray())[0]?.count || 0 : 0;
        //     return [numberOfVersioned, numberOfUnVersioned];
        // },
        // currentDataVersion: async (study: IStudy): Promise<null | number> => {
        //     return study.currentDataVersion === -1 ? null : study.currentDataVersion;
        // }
    },
    Project: {
        // fields: async (project: Omit<IProject, 'patientMapping'>, __unused__args: never, context: any): Promise<Array<IField>> => {
        //     const requester: IUser = context.req.user;
        //     const hasProjectLevelPermission = await permissionCore.userHasTheNeccessaryDataPermission(
        //         atomicOperation.READ,
        //         requester,
        //         project.studyId,
        //         project.id
        //     );
        //     if (!hasProjectLevelPermission) { return []; }
        //     // get all dataVersions that are valid (before the current version)
        //     const study = await studyCore.findOneStudy_throwErrorIfNotExist(project.studyId);

        //     // the processes of requiring versioned data and unversioned data are different
        //     // check the metadata:role:**** for versioned data directly
        //     // check the regular expressions for unversioned data
        //     const availableDataVersions: string[] = (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id);
        //     const availableTrees: IOntologyTree[] = [];
        //     const trees: IOntologyTree[] = study.ontologyTrees || [];
        //     for (let i = trees.length - 1; i >= 0; i--) {
        //         if (availableDataVersions.includes(trees[i].dataVersion || '')
        //             && availableTrees.filter(el => el.name === trees[i].name).length === 0) {
        //             availableTrees.push(trees[i]);
        //         } else {
        //             continue;
        //         }
        //     }
        //     if (availableTrees.length === 0) {
        //         return [];
        //     }
        //     const ontologyTreeFieldIds: string[] = (availableTrees[0].routes || []).map(el => el.field[0].replace('$', ''));
        //     if (requester.type === enumUserTypes.ADMIN) {
        //         const fieldRecords: any[] = await db.collections!.field_dictionary_collection.aggregate([{
        //             $match: { studyId: project.studyId, dateDeleted: null, dataVersion: { $in: availableDataVersions }, fieldId: { $in: ontologyTreeFieldIds } }
        //         }, {
        //             $group: {
        //                 _id: '$fieldId',
        //                 doc: { $last: '$$ROOT' }
        //             }
        //         }, {
        //             $replaceRoot: {
        //                 newRoot: '$doc'
        //             }
        //         }, {
        //             $sort: { fieldId: 1 }
        //         }, {
        //             $set: { metadata: null }
        //         }]).toArray();
        //         return fieldRecords;
        //     } else {
        //         // metadata filter
        //         const subqueries: any = [];
        //         hasProjectLevelPermission.matchObj.forEach((subMetadata: any) => {
        //             subqueries.push(translateMetadata(subMetadata));
        //         });
        //         const metadataFilter = { $or: subqueries };
        //         const fieldRecords: any[] = await db.collections!.field_dictionary_collection.aggregate([{
        //             $match: { studyId: project.studyId, dateDeleted: null, dataVersion: { $in: availableDataVersions }, fieldId: { $in: ontologyTreeFieldIds } }
        //         }, { $match: metadataFilter }, {
        //             $group: {
        //                 _id: '$fieldId',
        //                 doc: { $last: '$$ROOT' }
        //             }
        //         }, {
        //             $replaceRoot: {
        //                 newRoot: '$doc'
        //             }
        //         }, {
        //             $sort: { fieldId: 1 }
        //         }, {
        //             $set: { metadata: null }
        //         }]).toArray();
        //         return fieldRecords;
        //     }
        // },
        // jobs: async (project: Omit<IProject, 'patientMapping'>): Promise<Array<IJob<any>>> => {
        //     return await db.collections!.jobs_collection.find({ studyId: project.studyId, projectId: project.id }).toArray();
        // },
        // files: async (project: Omit<IProject, 'patientMapping'>, __unused__args: never, context: any): Promise<Array<IFile>> => {
        //     const requester: IUser = context.req.user;
        //     const hasPermission = await permissionCore.userHasTheNeccessaryDataPermission(
        //         atomicOperation.READ,
        //         requester,
        //         project.studyId,
        //         project.id
        //     );
        //     if (!hasPermission) {
        //         return [];
        //     }
        //     const study = await studyCore.findOneStudy_throwErrorIfNotExist(project.studyId);
        //     const availableDataVersions = (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id);
        //     const availableTrees: IOntologyTree[] = [];
        //     const trees: IOntologyTree[] = study.ontologyTrees || [];
        //     for (let i = trees.length - 1; i >= 0; i--) {
        //         if (availableDataVersions.includes(trees[i].dataVersion || '')
        //             && availableTrees.filter(el => el.name === trees[i].name).length === 0) {
        //             availableTrees.push(trees[i]);
        //         } else {
        //             continue;
        //         }
        //     }
        //     if (availableTrees.length === 0) {
        //         return [];
        //     }
        //     const ontologyTreeFieldIds: string[] = (availableTrees[0].routes || []).map(el => el.field[0].replace('$', ''));
        //     const fileFieldIds: string[] = (await db.collections!.field_dictionary_collection.aggregate([{
        //         $match: { studyId: study.id, dateDeleted: null, dataVersion: { $in: availableDataVersions }, dataType: enumValueType.FILE }
        //     }, { $match: { $and: [{ fieldId: { $in: hasPermission.raw.fieldIds.map((el: string) => new RegExp(el)) } }, { fieldId: { $in: ontologyTreeFieldIds } }] } }, {
        //         $group: {
        //             _id: '$fieldId',
        //             doc: { $last: '$$ROOT' }
        //         }
        //     }, {
        //         $replaceRoot: {
        //             newRoot: '$doc'
        //         }
        //     }, {
        //         $sort: { fieldId: 1 }
        //     }]).toArray()).map(el => el.fieldId);
        //     let add: string[] = [];
        //     let remove: string[] = [];
        //     if (Object.keys(hasPermission.matchObj).length === 0) {
        //         (await db.collections!.data_collection.aggregate([{
        //             $match: { m_studyId: study.id, m_versionId: { $in: availableDataVersions }, m_fieldId: { $in: fileFieldIds } }
        //         }]).toArray()).forEach(element => {
        //             add = add.concat(element.metadata?.add || []);
        //             remove = remove.concat(element.metadata?.remove || []);
        //         });
        //     } else {
        //         const subqueries: any = [];
        //         hasPermission.matchObj.forEach((subMetadata: any) => {
        //             subqueries.push(translateMetadata(subMetadata));
        //         });
        //         const metadataFilter = { $or: subqueries };
        //         (await db.collections!.data_collection.aggregate([{
        //             $match: { m_studyId: study.id, m_versionId: { $in: availableDataVersions }, m_fieldId: { $in: fileFieldIds } }
        //         }, {
        //             $match: metadataFilter
        //         }]).toArray()).forEach(element => {
        //             add = add.concat(element.metadata?.add || []);
        //             remove = remove.concat(element.metadata?.remove || []);
        //         });
        //     }
        //     return await db.collections!.files_collection.find({ $and: [{ id: { $in: add } }, { id: { $nin: remove } }] }).toArray();
        // },
        // dataVersion: async (project: IProject): Promise<IStudyDataVersion | null> => {
        //     const study = await db.collections!.studies_collection.findOne({ id: project.studyId, deleted: null });
        //     if (study === undefined || study === null) {
        //         return null;
        //     }
        //     if (study.currentDataVersion === -1) {
        //         return null;
        //     }
        //     return study.dataVersions[study?.currentDataVersion];
        // },
        // summary: async (project: IProject, __unused__args: never, context: any): Promise<any> => {
        //     const summary: any = {};
        //     const study = await db.collections!.studies_collection.findOne({ id: project.studyId });
        //     if (study === undefined || study === null || study.currentDataVersion === -1) {
        //         return summary;
        //     }

        //     const requester: IUser = context.req.user;
        //     /* user can get study if he has readonly permission */
        //     const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryDataPermission(
        //         atomicOperation.READ,
        //         requester,
        //         project.studyId
        //     );
        //     const hasProjectLevelPermission = await permissionCore.userHasTheNeccessaryDataPermission(
        //         atomicOperation.READ,
        //         requester,
        //         project.studyId,
        //         project.id
        //     );
        //     if (!hasStudyLevelPermission && !hasProjectLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }
        //     // get all dataVersions that are valid (before the current version)
        //     const aggregatedPermissions: any = permissionCore.combineMultiplePermissions([hasStudyLevelPermission, hasProjectLevelPermission]);

        //     let metadataFilter: any = undefined;

        //     const availableDataVersions = (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id);
        //     // ontology trees
        //     const availableTrees: IOntologyTree[] = [];
        //     const trees: IOntologyTree[] = study.ontologyTrees || [];
        //     for (let i = trees.length - 1; i >= 0; i--) {
        //         if (availableDataVersions.includes(trees[i].dataVersion || '')
        //             && availableTrees.filter(el => el.name === trees[i].name).length === 0) {
        //             availableTrees.push(trees[i]);
        //         } else {
        //             continue;
        //         }
        //     }
        //     const ontologyTreeFieldIds = (availableTrees[0]?.routes || []).map(el => el.field[0].replace('$', ''));

        //     let fieldRecords;
        //     if (requester.type === enumUserTypes.ADMIN) {
        //         fieldRecords = await db.collections!.field_dictionary_collection.aggregate([{
        //             $match: { studyId: project.studyId, dateDeleted: null, dataVersion: { $in: availableDataVersions } }
        //         }, {
        //             $group: {
        //                 _id: '$fieldId',
        //                 doc: { $last: '$$ROOT' }
        //             }
        //         }, {
        //             $replaceRoot: {
        //                 newRoot: '$doc'
        //             }
        //         }]).toArray();
        //     } else {
        //         const subqueries: any = [];
        //         aggregatedPermissions.matchObj.forEach((subMetadata: any) => {
        //             subqueries.push(translateMetadata(subMetadata));
        //         });
        //         metadataFilter = { $or: subqueries };

        //         fieldRecords = await db.collections!.field_dictionary_collection.aggregate([{
        //             $match: { studyId: project.studyId, dateDeleted: null, dataVersion: { $in: availableDataVersions }, fieldId: { $in: ontologyTreeFieldIds } }
        //         }, { $match: metadataFilter }, {
        //             $group: {
        //                 _id: '$fieldId',
        //                 doc: { $last: '$$ROOT' }
        //             }
        //         }, {
        //             $replaceRoot: {
        //                 newRoot: '$doc'
        //             }
        //         }]).toArray();
        //     }
        //     // fieldRecords = fieldRecords.filter(el => ontologyTreeFieldIds.includes(el.fieldId));
        //     const pipeline = buildPipeline({}, project.studyId, availableDataVersions, fieldRecords as IField[], metadataFilter, requester.type === enumUserTypes.ADMIN);
        //     const result = await db.collections!.data_collection.aggregate(pipeline, { allowDiskUse: true }).toArray();

        //     summary['subjects'] = Array.from(new Set(result.map((el: any) => el.m_subjectId)));
        //     summary['visits'] = Array.from(new Set(result.map((el: any) => el.m_visitId))).sort((a, b) => parseFloat(a) - parseFloat(b));
        //     summary['standardizationTypes'] = await db.collections!.standardizations_collection.distinct('type', { studyId: study.id, deleted: null });
        //     return summary;
        // },
        // patientMapping: async (project: Omit<IProject, 'patientMapping'>, __unused__args: never, context: any): Promise<any> => {
        //     const requester: IUser = context.req.user;
        //     /* check privileges */
        //     if (!(await permissionCore.userHasTheNeccessaryDataPermission(
        //         atomicOperation.READ,  // patientMapping is not visible to project users; only to study users.
        //         requester,
        //         project.studyId
        //     ))) {
        //         throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
        //     }

        //     /* returning */
        //     const result =
        //         await db.collections!.projects_collection.findOne(
        //             { id: project.id, deleted: null },
        //             { projection: { patientMapping: 1 } }
        //         );
        //     if (result && result.patientMapping) {
        //         return result.patientMapping;
        //     } else {
        //         return null;
        //     }
        // },
        // roles: async (project: IProject): Promise<Array<any>> => {
        //     return await db.collections!.roles_collection.find({ studyId: project.studyId, projectId: project.id, deleted: null }).toArray();
        // },
        // iCanEdit: async (project: IProject): Promise<boolean> => { // TO_DO
        //     await db.collections!.roles_collection.findOne({
        //         studyId: project.studyId,
        //         projectId: project.id
        //         // permissions: permissions.specific_project.specifi
        //     });
        //     return true;
        // }
    },
    Mutation: {
        createStudy: async (__unused__parent: Record<string, unknown>, { name, description }: { name: string, description: string }, context: any): Promise<IStudy> => {
            /**
             * Create a study.
             *
             * @param name - The name of the study.
             * @param description - The description of the study.
             *
             *
             * @return IStudy
             */
            const requester: IUser = context.req.user;
            if (requester.type !== enumUserTypes.ADMIN) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }

            /* create study */
            const study = await studyCore.createStudy(requester.id, name, description);
            return study;
        },
        editStudy: async (__unused__parent: Record<string, unknown>, { studyId, name, description }: { studyId: string, name: string, description: string }, context: any): Promise<IStudy> => {
            /**
             * Edit a study.
             *
             * @param studyId - The id of the study.
             * @param name - The name of the study.
             * @param description - The description of the study.
             *
             * @return
             */

            const requester: IUser = context.req.user;
            if (requester.type !== enumUserTypes.ADMIN) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }

            const study = await studyCore.editStudy(studyId, name, description);
            return study;
        },
        deleteStudy: async (__unused__parent: Record<string, unknown>, { studyId }: { studyId: string }, context: any): Promise<IGenericResponse> => {
            /**
             * Delete a study.
             *
             * @param studyId - The id of the study.
             *
             * @return IGenericResponse - The obejct of IGenericResponse.
             */
            const requester: IUser = context.req.user;

            /* check privileges */
            if (requester.type !== enumUserTypes.ADMIN) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }

            const response = studyCore.deleteStudy(requester.id, studyId);

            return response;
        },
        createDataVersion: async (__unused__parent: Record<string, unknown>, { studyId, dataVersion, tag }: { studyId: string, dataVersion: string, tag: string }, context: any): Promise<IGenericResponse> => {
            /**
             * Create a new data version of the study.
             *
             * @param studyId - The id of the study.
             * @param tag - The tag of the study.
             * @param dataVersion - The new version of the study. User float number.
             *
             * @return IGenericResponse - The object of IGenericResponse.
             */

            const requester = context.req.user;

            const decimalRegex = /^[0-9]+(\.[0-9]+)?$/;

            if (!decimalRegex.test(dataVersion)) {
                throw new GraphQLError('Version must be a float number.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            const response = await studyCore.createDataVersion(requester, studyId, tag, dataVersion);
            return response;
        },
        // createProject: async (__unused__parent: Record<string, unknown>, { studyId, projectName }: { studyId: string, projectName: string }, context: any): Promise<IProject> => {
        //     const requester: IUser = context.req.user;

        //     /* check privileges */
        //     if (!(await permissionCore.userHasTheNeccessaryManagementPermission(
        //         IPermissionManagementOptions.own,
        //         atomicOperation.WRITE,
        //         requester,
        //         studyId
        //     ))) {
        //         throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
        //     }

        //     /* making sure that the study exists first */
        //     await studyCore.findOneStudy_throwErrorIfNotExist(studyId);

        //     /* create project */
        //     const project = await studyCore.createProjectForStudy(studyId, projectName, requester.id);
        //     return project;
        // },
        // deleteProject: async (__unused__parent: Record<string, unknown>, { projectId }: { projectId: string }, context: any): Promise<IGenericResponse> => {
        //     const requester: IUser = context.req.user;

        //     const project = await studyCore.findOneProject_throwErrorIfNotExist(projectId);

        //     /* check privileges */
        //     if (!(await permissionCore.userHasTheNeccessaryManagementPermission(
        //         IPermissionManagementOptions.own,
        //         atomicOperation.WRITE,
        //         requester,
        //         project.studyId
        //     ))) {
        //         throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
        //     }

        //     /* delete project */
        //     await studyCore.deleteProject(projectId);
        //     return makeGenericReponse(projectId);
        // },

        setDataversionAsCurrent: async (__unused__parent: Record<string, unknown>, { studyId, dataVersionId }: { studyId: string, dataVersionId: string }, context: any): Promise<IGenericResponse> => {
            /**
             * Set a data version as the current data version of a  study.
             *
             * @param studyId - The id of the study.
             * @param dataVersionId - The id of the data version.
             *
             * @return IGenreicResponse
             */
            const requester: IUser = context.req.user;

            if (requester.type !== enumUserTypes.ADMIN) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }

            const response = await studyCore.setDataVersion(studyId, dataVersionId);

            return response;
        }
    },
    Subscription: {}
};
