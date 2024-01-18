import { GraphQLError } from 'graphql';
import { IRole, IGenericResponse, enumStudyRoles, IDataPermission, IGroupNode, enumUserTypes } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../database/database';
import { errorCodes } from '../graphql/errors';
import { makeGenericReponse } from '../graphql/responses';
import { TRPCError } from '@trpc/server';
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';

export class PermissionCore {
    // public async getAllRolesOfStudyOrProject(studyId: string, projectId?: string): Promise<IRole[]> {
    //     /**
    //      * Get the list of roles of a study or project.
    //      *
    //      * @param studyId - The id of the study.
    //      * @param projectId - The id of the project.
    //      *
    //      * @return IRole - The list of objects of IRole.
    //      */

    //     const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
    //     if (!study) {
    //         throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //     }
    //     let project;
    //     if (projectId) {
    //         project = await db.collections!.projects_collection.findOne({ 'id': projectId, 'life.deletedTime': null });
    //         if (!project) {
    //             throw new GraphQLError('Project does not exist).', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //         }
    //     }

    //     if (project && project.studyId !== studyId) {
    //         throw new GraphQLError('Project and study does not match).', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //     }

    //     return db.collections!.roles_collection.find({ 'studyId': studyId, 'projectId': projectId, 'life.deletedTime': null }).toArray();
    // }

    // public async userHasTheNeccessaryManagementPermission(type: IPermissionManagementOptions, operation: atomicOperation, userId: string, studyId: string, projectId: string | null): Promise<boolean> {
    //     /**
    //      * Check user has management permissions.
    //      *
    //      * @param type: The specific management permission type.
    //      * @param operation - The specific permission: READ OR WRITE.
    //      * @param userId - The id of the user.
    //      * @param studyId - The id of the study.
    //      * @param projectId - The id of the project.
    //      *
    //      * @reutrn boolean - Whether user has this permission.
    //      */

    //     const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
    //     if (!user) {
    //         throw new GraphQLError('User does not exist).', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //     }

    //     const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
    //     if (!study) {
    //         throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //     }

    //     if (projectId) {
    //         const project = await db.collections!.projects_collection.findOne({ 'id': projectId, 'life.deletedTime': null });
    //         if (!project) {
    //             throw new GraphQLError('Project does not exist).', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //         }
    //     }

    //     /* if user is an admin then return true if admin privileges includes needed permissions */
    //     if (user.type === enumUserTypes.ADMIN) {
    //         return true;
    //     }

    //     const tag = `permissions.manage.${type}`;
    //     const roles = await db.collections!.roles_collection.aggregate([
    //         { $match: { 'studyId': studyId, 'projectId': { $in: [projectId, null] }, 'users': user.id, 'life.deletedTime': null } }, // matches all the role documents where the study and project matches and has the user inside
    //         { $match: { [tag]: operation } }
    //     ]).toArray();
    //     if (roles.length === 0) {
    //         return false;
    //     }
    //     return true;
    // }

    // public async combineUserDataPermissions(userId: string, studyId: string, projectId: string | null, operation: atomicOperation): Promise<ICombinedPermissions> {
    //     /**
    //      *  Combine user data permissions from study and project.
    //      *
    //      * @param userId - The id of the user.
    //      * @param studyId - The id of the study.
    //      * @param projectId - The id of the project.
    //      * @param operation - The required operation, either READ or WRITE.
    //      *
    //      * @return ICombinedPermission - The object of ICombinedPermission
    //      */

    //     const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
    //     if (!user) {
    //         throw new GraphQLError('User does not exist).', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //     }

    //     const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
    //     if (!study) {
    //         throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //     }

    //     if (projectId) {
    //         const project = await db.collections!.projects_collection.findOne({ 'id': projectId, 'life.deletedTime': null });
    //         if (!project) {
    //             throw new GraphQLError('Project does not exist).', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //         }
    //     }

    //     const matchAnyString = '^.*$';
    //     if (user.type === enumUserTypes.ADMIN) {
    //         return {
    //             hasPriority: true,
    //             roleMatch: [],
    //             hasVersioned: true,
    //             dataRE: {
    //                 subjectIds: [matchAnyString],
    //                 visitIds: [matchAnyString],
    //                 fieldIds: [matchAnyString]
    //             }
    //         };
    //     }
    //     const roles = await db.collections!.roles_collection.aggregate([
    //         { $match: { studyId, 'projectId': { $in: [projectId, null] }, 'users': user.id, 'life.deletedTime': null } }, // matches all the role documents where the study and project matches and has the user inside
    //         { $match: { 'permissions.data.operations': operation } }
    //     ]).toArray();

    //     if (roles.length === 0) {
    //         return {
    //             hasPriority: false,
    //             roleMatch: [],
    //             hasVersioned: false,
    //             dataRE: {
    //                 subjectIds: [],
    //                 visitIds: [],
    //                 fieldIds: []
    //             }
    //         };
    //     }
    //     const combined: Record<string, string[]> = {
    //         subjectIds: [],
    //         visitIds: [],
    //         fieldIds: []
    //     };
    //     for (const role of roles) {
    //         combined.subjectIds.push(...new Set(combined.subjectIds.concat(role.permissions.data?.subjectIds || [])));
    //         combined.visitIds.push(...new Set(combined.visitIds.concat(role.permissions.data?.visitIds || [])));
    //         combined.fieldIds.push(...new Set(combined.fieldIds.concat(role.permissions.data?.fieldIds || [])));
    //     }
    //     return {
    //         hasPriority: true,
    //         roleMatch: [],
    //         hasVersioned: true,
    //         dataRE: {
    //             subjectIds: combined.subjectIds,
    //             visitIds: combined.visitIds,
    //             fieldIds: combined.fieldIds
    //         }
    //     };
    // }

    // public checkDataEntryValidFromPermission(combinedDataPermissions: ICombinedPermissions, fieldId: string, subjectId: string, visitId: string): boolean {
    //     /**
    //      * Check if user has permission to a data clip.
    //      *
    //      * @param combinedDataPermissions - The combined data permissions of multiple roles.
    //      * @param fieldId - The id of the field.
    //      * @param subjectId - The id of the subject.
    //      * @param visitId - The id of the visit.
    //      */

    //     return (
    //         combinedDataPermissions.dataRE.subjectIds.some((el: string) => (new RegExp(el)).test(subjectId))
    //         && combinedDataPermissions.dataRE.visitIds.some((el: string) => (new RegExp(el)).test(visitId))
    //         && combinedDataPermissions.dataRE.fieldIds.some((el: string) => (new RegExp(el)).test(fieldId))
    //     );
    // }

    // public checkFieldEntryValidFromPermission(combinedDataPermissions: ICombinedPermissions, fieldId: string): boolean {
    //     /**
    //      * Check if user has permission to a field.
    //      *
    //      * @param combinedDataPermissions - The combined data permissions of multiple roles.
    //      * @param fieldId - The id of the field.
    //      */

    //     return combinedDataPermissions.dataRE.fieldIds.some((el: string) => (new RegExp(el)).test(fieldId));
    // }

    // public async chekckDataEntryValidFromUser(userId: string, studyId: string, projectId: string | null, fieldId: string, subjectId: string, visitId: string, operation: atomicOperation) {
    //     /**
    //      * Check if a user has permission to a data clip. This is a wrapper of two individual functions, thus no data check needed.
    //      *
    //      * @param userId - The id of the user.
    //      * @param studyId - The id of the study.
    //      * @param projectId - The id of the project.
    //      * @param fieldId - The id of the field.
    //      * @param subjectId - The id of the subject.
    //      * @param visitId - The id of the visit.
    //      * @param operation - The required operation, either READ or WRITE.
    //      */

    //     const aggregatedPermissions: ICombinedPermissions = await this.combineUserDataPermissions(userId, studyId, projectId, operation);
    //     return this.checkDataEntryValidFromPermission(aggregatedPermissions, fieldId, subjectId, visitId);

    // }

    // public async chekckFieldEntryValidFromUser(userId: string, studyId: string, projectId: string | null, fieldId: string, operation: atomicOperation) {
    //     /**
    //      * Check if a user has permission to a field. This is a wrapper of two individual functions, thus no data check needed.
    //      *
    //      * @param userId - The id of the user.
    //      * @param studyId - The id of the study.
    //      * @param projectId - The id of the project.
    //      * @param fieldId - The id of the field.
    //      * @param operation - The required operation, either READ or WRITE.
    //      */

    //     const aggregatedPermissions: ICombinedPermissions = await this.combineUserDataPermissions(userId, studyId, projectId, operation);
    //     return this.checkFieldEntryValidFromPermission(aggregatedPermissions, fieldId);

    // }


    // public async userHasTheNeccessaryDataPermission(operation: atomicOperation, userId: string, studyId: string, projectId: string | null): Promise<ICombinedPermissions> {
    //     /**
    //      * Check user has data permissions.
    //      *
    //      * @param operation - The specific permissions, READ or WRITE.
    //      * @param userId - The id of the user.
    //      * @param studyId - The id of the study.
    //      * @param projectId - The id of the project.
    //      *
    //      * @return ICombinedPermissions - The object of ICombinedPermissions.
    //      */

    //     const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
    //     if (!user) {
    //         throw new GraphQLError('User does not exist).', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //     }

    //     const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
    //     if (!study) {
    //         throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //     }

    //     if (projectId) {
    //         const project = await db.collections!.projects_collection.findOne({ 'id': projectId, 'life.deletedTime': null });
    //         if (!project) {
    //             throw new GraphQLError('Project does not exist).', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //         }
    //     }

    //     /* Regular expression to match any string. */
    //     const matchAnyString = '^.*$';
    //     /* if user is an admin then return true if admin privileges includes needed permissions */
    //     if (user.type === enumUserTypes.ADMIN) {
    //         return {
    //             hasPriority: true,
    //             roleMatch: [],
    //             hasVersioned: true,
    //             dataRE: {
    //                 subjectIds: [matchAnyString],
    //                 visitIds: [matchAnyString],
    //                 fieldIds: [matchAnyString]
    //             }
    //         };
    //     }

    //     const roles = await db.collections!.roles_collection.aggregate([
    //         { $match: { 'studyId': studyId, 'projectId': { $in: [projectId, null] }, 'users': user.id, 'life.deletedTime': null } }, // matches all the role documents where the study and project matches and has the user inside
    //         { $match: { 'permissions.data.operations': operation } }
    //     ]).toArray();

    //     let hasVersioned = false;
    //     const roleObj: Array<{ key: string; op: string, parameter: boolean }>[] = [];
    //     const raw: Record<string, string[]> = {
    //         subjectIds: [],
    //         visitIds: [],
    //         fieldIds: []
    //     };
    //     for (const role of roles) {
    //         roleObj.push([{
    //             key: `role:${role.id}`,
    //             op: '=',
    //             parameter: true
    //         }]);
    //         raw.subjectIds = raw.subjectIds.concat(role.permissions.data?.subjectIds || []);
    //         raw.visitIds = raw.visitIds.concat(role.permissions.data?.visitIds || []);
    //         raw.fieldIds = raw.fieldIds.concat(role.permissions.data?.fieldIds || []);

    //         if (role.permissions.data?.hasVersioned) {
    //             hasVersioned = hasVersioned || role.permissions.data.hasVersioned;
    //         }
    //     }
    //     if (Object.keys(roleObj).length === 0) {
    //         return {
    //             hasPriority: false,
    //             roleMatch: [],
    //             hasVersioned: false,
    //             dataRE: {
    //                 subjectIds: [],
    //                 visitIds: [],
    //                 fieldIds: []
    //             }
    //         };
    //     }
    //     return {
    //         hasPriority: false,
    //         roleMatch: roleObj,
    //         hasVersioned: hasVersioned,
    //         dataRE: {
    //             subjectIds: raw.subjectIds,
    //             visitIds: raw.visitIds,
    //             fieldIds: raw.fieldIds
    //         }
    //     };
    // }

    // // public combineMultiplePermissions(permissions: any[]): any {
    // //     const res = {
    // //         matchObj: [],
    // //         hasVersioned: false,
    // //         raw: {
    // //             subjectIds: [],
    // //             visitIds: [],
    // //             fieldIds: []
    // //         }
    // //     };
    // //     for (const permission of permissions) {
    // //         if (!permission) {
    // //             continue;
    // //         }
    // //         res.raw.subjectIds = res.raw.subjectIds.concat(permission.raw?.subjectIds || []);
    // //         res.raw.visitIds = res.raw.visitIds.concat(permission.raw?.visitIds || []);
    // //         res.raw.fieldIds = res.raw.fieldIds.concat(permission.raw?.fieldIds || []);
    // //         res.matchObj = res.matchObj.concat(permission.matchObj || []);
    // //         res.hasVersioned = res.hasVersioned || permission.hasVersioned;
    // //     }
    // //     return res;
    // // }

    // public async createRole(requester: string, studyId: string, projectId: string | null, roleName: string, description: string | null): Promise<IRole> {
    //     /**
    //      * Create a role of a study or project.
    //      *
    //      * @param requester - The id of the requester.
    //      * @param studyId - The id of the study.
    //      * @param projectId - The id of the project.
    //      * @param roleName - The name of the role.
    //      *
    //      * @return IRole - The object of IRole.
    //      */

    //     const role: IRole = {
    //         id: uuid(),
    //         studyId: studyId,
    //         projectId: projectId,
    //         name: roleName,
    //         permissions: {
    //             data: {
    //                 subjectIds: [],
    //                 visitIds: [],
    //                 fieldIds: [],
    //                 hasVersioned: false,
    //                 operations: []
    //             },
    //             manage: {
    //                 [IPermissionManagementOptions.own]: [atomicOperation.READ],
    //                 [IPermissionManagementOptions.role]: [],
    //                 [IPermissionManagementOptions.job]: [],
    //                 [IPermissionManagementOptions.query]: [],
    //                 [IPermissionManagementOptions.ontologyTrees]: [atomicOperation.READ]
    //             }
    //         },
    //         description: description,
    //         users: []
    //     };
    //     const updateResult = await db.collections!.roles_collection.insertOne(role);
    //     if (updateResult.acknowledged) {
    //         return role;
    //     } else {
    //         throw new GraphQLError('Database error.', { extensions: { code: errorCodes.DATABASE_ERROR } });
    //     }
    // }

    // public async deleteRole(requester: string, roleId: string): Promise<IGenericResponse> {
    //     /**
    //      * Delete a role of a study or project.
    //      *
    //      * @param requester - The id of the requester.
    //      * @param roleId - The id of the role.
    //      *
    //      * @return IGenericResponse - The object of IGenericResponse.
    //      */

    //     const updateResult = await db.collections!.roles_collection.findOneAndUpdate({ 'id': roleId, 'life.deletedTime': null }, { $set: { 'life.deletedTime': Date.now(), 'life.deletedUser': requester } });
    //     if (updateResult.ok === 1) {
    //         return makeGenericReponse(roleId, true, undefined, `Role ${roleId} has been deleted.`);
    //     } else {
    //         throw new GraphQLError('Cannot delete role.', { extensions: { code: errorCodes.DATABASE_ERROR } });
    //     }
    // }

    // public async editRole(roleId: string, name: string | null, description: string | null, permissionChanges: IPermissionChanges | null, userChanges: { add: string[], remove: string[] } | null): Promise<IGenericResponse> {
    //     /**
    //      * Edit an existing role.
    //      *
    //      * @param roleId - The id of the role.
    //      * @param name - The name of the role.
    //      * @param description - The description of the role.
    //      * @param permissionChanges - The object of permission changes.
    //      * @param userChanges - The object of user changes.
    //      *
    //      * @return IGenericResponse - The object of IGenericResponse.
    //      */

    //     const role = await db.collections!.roles_collection.findOne({ id: roleId });
    //     if (!role) {
    //         throw new GraphQLError('Role does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //     }

    //     if (!permissionChanges) {
    //         permissionChanges = {
    //             data: { subjectIds: [], visitIds: [], fieldIds: [], hasVersioned: false, operations: [], filters: [] },
    //             manage: {
    //                 [IPermissionManagementOptions.own]: [atomicOperation.READ],
    //                 [IPermissionManagementOptions.role]: [],
    //                 [IPermissionManagementOptions.job]: [],
    //                 [IPermissionManagementOptions.query]: [],
    //                 [IPermissionManagementOptions.ontologyTrees]: [atomicOperation.READ]
    //             }
    //         };
    //     }
    //     if (!userChanges) {
    //         userChanges = { add: [], remove: [] };
    //     }

    //     const bulkop = db.collections!.roles_collection.initializeUnorderedBulkOp();
    //     bulkop.find({ id: roleId }).updateOne({ $set: { permissions: permissionChanges }, $addToSet: { users: { $each: userChanges.add } } });
    //     bulkop.find({ id: roleId }).updateOne({ $set: { permissions: permissionChanges }, $pullAll: { users: userChanges.remove } });
    //     if (name) {
    //         bulkop.find({ id: roleId }).updateOne({ $set: { name } });
    //     }
    //     if (description) {
    //         bulkop.find({ id: roleId }).updateOne({ $set: { description } });
    //     }


    //     // filters
    //     // We send back the filtered fields values
    //     let validSubjects: Array<string | RegExp> = [];
    //     if (permissionChanges.data.filters.length > 0) {
    //         const subqueries = this.translateCohort(permissionChanges.data.filters);
    //         validSubjects = (await db.collections!.data_collection.aggregate([{
    //             $match: { $and: subqueries }
    //         }]).toArray()).map(el => el.m_subjectId);
    //     }

    //     const session = db.client!.startSession();
    //     session.startTransaction();
    //     try {
    //         const result: BulkWriteResult = await bulkop.execute();

    //         // update the data and field records
    //         const dataBulkOp = db.collections!.data_collection.initializeUnorderedBulkOp();
    //         const filters: Record<string, string[]> = {
    //             subjectIds: permissionChanges.data.subjectIds || [],
    //             visitIds: permissionChanges.data.visitIds || [],
    //             fieldIds: permissionChanges.data.fieldIds || []
    //         };
    //         if (!validSubjects.length) {
    //             validSubjects = filters.subjectIds.map((el: string) => new RegExp(el));
    //         }
    //         const dataTag = `metadata.${'role:'.concat(roleId)}`;
    //         dataBulkOp.find({
    //             m_studyId: role.studyId,
    //             m_versionId: { $exists: true, $ne: null },
    //             $and: [{
    //                 m_subjectId: { $in: filters.subjectIds.map((el: string) => new RegExp(el)) }
    //             }, {
    //                 m_subjectId: { $in: validSubjects }
    //             }],
    //             m_visitId: { $in: filters.visitIds.map((el: string) => new RegExp(el)) },
    //             m_fieldId: { $in: filters.fieldIds.map((el: string) => new RegExp(el)) }
    //         }).update({
    //             $set: { [dataTag]: true }
    //         });
    //         dataBulkOp.find({
    //             m_studyId: role.studyId,
    //             m_versionId: { $exists: true, $ne: null },
    //             $or: [
    //                 { m_subjectId: { $nin: validSubjects } },
    //                 { m_subjectId: { $nin: filters.subjectIds.map((el: string) => new RegExp(el)) } },
    //                 { m_visitId: { $nin: filters.visitIds.map((el: string) => new RegExp(el)) } },
    //                 { m_fieldId: { $nin: filters.fieldIds.map((el: string) => new RegExp(el)) } }
    //             ]
    //         }).update({
    //             $set: { [dataTag]: false }
    //         });
    //         const fieldBulkOp = db.collections!.field_dictionary_collection.initializeUnorderedBulkOp();
    //         const fieldIds = permissionChanges.data?.fieldIds || [];
    //         const fieldTag = `metadata.${'role:'.concat(roleId)}`;
    //         fieldBulkOp.find({
    //             studyId: role.studyId,
    //             dataVersion: { $exists: true, $ne: null },
    //             fieldId: { $in: fieldIds.map((el: string) => new RegExp(el)) }
    //         }).update({
    //             $set: { [fieldTag]: true }
    //         });
    //         fieldBulkOp.find({
    //             studyId: role.studyId,
    //             dataVersion: { $exists: true, $ne: null },
    //             fieldId: { $nin: fieldIds.map((el: string) => new RegExp(el)) }
    //         }).update({
    //             $set: { [fieldTag]: false }
    //         });
    //         await dataBulkOp.execute();
    //         await fieldBulkOp.execute();

    //         await session.commitTransaction();
    //         session.endSession();

    //         return makeGenericReponse(roleId, true, undefined, `Role ${roleId} has been edited.`);
    //     } catch (error) {
    //         // If an error occurred, abort the whole transaction and
    //         // undo any changes that might have happened
    //         await session.abortTransaction();
    //         session.endSession();
    //         throw new GraphQLError(`${JSON.stringify(error)}`, { extensions: { code: errorCodes.DATABASE_ERROR } });
    //     }
    // }

    // public translateCohort(cohort: any) {
    //     const queries: any[] = [];
    //     cohort.forEach(function (select: any) {
    //         const match: any = {
    //             m_fieldId: select.field
    //         };
    //         switch (select.op) {
    //             case '=':
    //                 // select.value must be an array
    //                 match['value'] = { $in: [select.value] };
    //                 break;
    //             case '!=':
    //                 // select.value must be an array
    //                 match['value'] = { $nin: [select.value] };
    //                 break;
    //             case '<':
    //                 // select.value must be a float
    //                 match['value'] = { $lt: parseFloat(select.value) };
    //                 break;
    //             case '>':
    //                 // select.value must be a float
    //                 match['value'] = { $gt: parseFloat(select.value) };
    //                 break;
    //             case 'derived': {
    //                 // equation must only have + - * /
    //                 const derivedOperation = select.value.split(' ');
    //                 if (derivedOperation[0] === '=') {
    //                     match['value'] = { $eq: parseFloat(select.value) };
    //                 }
    //                 if (derivedOperation[0] === '>') {
    //                     match['value'] = { $gt: parseFloat(select.value) };
    //                 }
    //                 if (derivedOperation[0] === '<') {
    //                     match['value'] = { $lt: parseFloat(select.value) };
    //                 }
    //                 break;
    //             }
    //             case 'exists':
    //                 // We check if the field exists. This is to be used for checking if a patient
    //                 // has an image
    //                 match['value'] = { $exists: true };
    //                 break;
    //             case 'count': {
    //                 // counts can only be positive. NB: > and < are inclusive e.g. < is <=
    //                 const countOperation = select.value.split(' ');
    //                 const countfield = select.field + '.count';
    //                 if (countOperation[0] === '=') {
    //                     (match as any)[countfield] = { $eq: parseInt(countOperation[1], 10) };
    //                 }
    //                 if (countOperation[0] === '>') {
    //                     (match as any)[countfield] = { $gt: parseInt(countOperation[1], 10) };
    //                 }
    //                 if (countOperation[0] === '<') {
    //                     (match as any)[countfield] = { $lt: parseInt(countOperation[1], 10) };
    //                 }
    //                 break;
    //             }
    //             default:
    //                 break;
    //         }
    //         queries.push(match);
    //     }
    //     );
    //     return queries;
    // }

    // new functions
    public async updateDataClipPermission(roleId: string, dataPermisisons: IDataPermission[]) {
        const roleTag = `metadata.role:${roleId}`;
        for (const dataPermission of dataPermisisons) {
            // update the data
            // Constructing the query filter
            const filters: any = {
                $and: [
                    { $or: dataPermission.fields.map((regex) => ({ fieldId: { $regex: regex } })) },
                    ...Object.entries(dataPermission.dataProperties).map(([property, regexArr]) => ({
                        $or: regexArr.map((regex) => ({ [`properties.${property}`]: { $regex: regex } }))
                    }))
                ]
            };

            // Your updateMany calls follow here...

            // Step 1: Set permissions for documents where the permissions field does not yet exist
            await db.collections!.data_collection.updateMany({
                'life.deletedTime': null,
                ...filters,
                [`${roleTag}`]: { $exists: false }
            }, {
                $set: {
                    [`${roleTag}`]: dataPermission.permission
                }
            });

            // Step 2: Merge permissions for documents where the permissions field already exists
            await db.collections!.data_collection.updateMany({
                'life.deletedTime': null,
                ...filters,
                [`${roleTag}`]: { $exists: true }
            }, {
                $bit: {
                    [`${roleTag}`]: { or: dataPermission.permission } as any
                }
            });
        }
    }
    public async createRole(requester: string, studyId: string, name: string, description: string, dataPermisisons: IDataPermission[], studyRole: enumStudyRoles): Promise<IRole> {
        /**
         * Create a Role.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param name - The name of the role.
         * @param description - The description of the role.
         * @param dataPermisisons - The data permissions of the role.
         * @param studyRole - The study role of the role.
         */

        const roleEntry: IRole = {
            id: uuid(),
            studyId: studyId,
            name: name,
            description: description,
            dataPermissions: dataPermisisons,
            studyRole: studyRole,
            users: [],
            groups: [],
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };
        await db.collections!.roles_collection.insertOne(roleEntry);
        if (studyRole === enumStudyRoles.STUDY_USER && dataPermisisons) {
            await this.updateDataClipPermission(roleEntry.id, dataPermisisons);
        }
        return roleEntry;
    }

    public async editRole(roleId: string, name: string | null, description: string | null, dataPermisisons: IDataPermission[] | null, studyRole: enumStudyRoles | null, users: string[] | null, groups: string[] | null): Promise<IGenericResponse> {
        /**
         * Edit a Role.
         *
         * @param roleId - The id of the role.
         * @param name - The name of the role.
         * @param description - The description of the role.
         * @param dataPermisisons - The data permissions of the role.
         * @param studyRole - The study role of the role.
         * @param users - The users of this role.
         * @param groups - The user groups of this role
         */

        const role = await db.collections!.roles_collection.findOne({ 'id': roleId, 'life.deletedTime': null });
        if (!role) {
            throw new GraphQLError(`Role ${roleId} does not exist.`, { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        await db.collections!.roles_collection.findOneAndUpdate({ id: roleId }, {
            $set: {
                name: name ?? role.name,
                description: description ?? role.description,
                dataPermissions: dataPermisisons ?? role.dataPermissions,
                studyRole: studyRole ?? role.studyRole,
                users: users ?? role.users,
                groups: groups ?? role.groups
            }
        });
        if (dataPermisisons) {
            await this.updateDataClipPermission(roleId, dataPermisisons);
        }

        return makeGenericReponse(roleId, true, undefined, `Role ${roleId} ${role.name} has been edited.`);
    }

    public async deleteRole(requester: string, roleId: string): Promise<IGenericResponse> {
        /**
         * Delete a role.
         *
         * @param requester - The id of the requester.
         * @param roleId - The id of the role.
         */
        const role = await db.collections!.roles_collection.findOne({ 'id': roleId, 'life.deletedTime': null });
        if (!role) {
            throw new GraphQLError(`Role ${roleId} does not exist.`, { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        await db.collections!.roles_collection.findOneAndUpdate({ id: roleId }, {
            $set: {
                'life.deletedTime': Date.now(),
                'life.deletedUser': requester
            }
        });

        return makeGenericReponse(roleId, true, undefined, `Role ${roleId} ${role.name} has been deleted.`);
    }

    public async getRoles(studyId: string, roleId: string | null): Promise<IRole[]> {
        /**
         * Get the roles of a study or a roleId.
         *
         * @param studyId - The id of the study.
         */
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError(`Study ${studyId} does not exist.`, { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        if (roleId) {
            const role = await db.collections!.roles_collection.findOne({ 'studyId': studyId, 'id': roleId, 'life.deletedTime': null });
            if (!role) {
                throw new GraphQLError(`Role ${roleId} does not exist.`, { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
            return [role];
        } else {
            return await db.collections!.roles_collection.find({ 'studyId': studyId, 'life.deletedTime': null }).toArray();
        }


    }

    /**
     * Check whether a dataclip is allowed by a group of permissions. Used for multiple permissions in one role.
     *
     * @param dataPermissions - The list of data permissions.
     * @param dataclip - The data clip.
     * @return boolean
     */
    public checkDataPermissionByRole(role: IRole, dataclip: any): boolean {
        for (const dataPermission of role.dataPermissions ?? []) {
            let fieldCheck = false;
            let propertyCheck = true;  // assume true initially
            // Check if at least one regex matches the fieldId
            for (const regex of dataPermission.fields) {
                const regExp = new RegExp(regex);
                if (regExp.test(dataclip.fieldId)) {
                    fieldCheck = true;
                    break;
                }
            }

            // If fieldCheck is false, move to next dataPermission
            if (!fieldCheck) continue;

            // Check properties
            if (dataclip.properties) {
                for (const property in dataPermission.dataProperties) {
                    // Updated line to address ESLint error
                    if (Object.prototype.hasOwnProperty.call(dataclip.properties, property)) {
                        let propertyRegexCheck = false;
                        for (const regex of dataPermission.dataProperties[property]) {
                            const regExp = new RegExp(regex);
                            if (regExp.test(dataclip.properties[property])) {
                                propertyRegexCheck = true;
                                break;
                            }
                        }
                        // If any property fails to match the regex, set propertyCheck to false
                        if (!propertyRegexCheck) {
                            propertyCheck = false;
                            break;
                        }
                    }
                }
            }
            // If both field and properties check are true, return true
            if (fieldCheck && propertyCheck) return true;
        }

        return false;  // If none of the dataPermissions validate the dataclip, return false
    }

    /**
     * Check whether a dataclip is allowed by a group of roles. Used for multiple roles for a user.
     * When check a list of dataclips, use getUserRoles to fetch the list of roles, then call this function.
     *
     * @param dataPermissions - The list of data permissions.
     * @param dataclip - The data clip.
     * @return boolean
     */
    public async checkDataPermissionByUser(userId: string, dataClip: any) {
        const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
        if (!user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }
        if (user.type === enumUserTypes.ADMIN) {
            return true;
        }
        const roles = await this.getUserRoles(userId);
        for (const role of roles) {
            if (role.studyRole === enumStudyRoles.STUDY_MANAGER) {
                return true;
            }
            if (this.checkDataPermissionByRole(role, dataClip)) {
                return true;
            }
        }
        throw new TRPCError({
            code: enumTRPCErrorCodes.BAD_REQUEST,
            message: errorCodes.NO_PERMISSION_ERROR
        });
    }

    /**
     * Check user has permission based on roles.
     *
     * @param userId - The id of the user.
     * @param requiredRoles - The list of roles required.
     * @returns boolean
     */
    public async checkOperationPermissionByUser(userId: string, studyId: string, requiredRole?: enumStudyRoles) {
        const user = await db.collections!.users_collection.findOne({ 'id': userId, 'life.deletedTime': null });
        if (!user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }
        if (user.type === enumUserTypes.ADMIN) {
            return true;
        }
        const roles = await this.getUserRoles(userId, studyId);
        if (roles.length === 0) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'No roles found.'
            });
        }
        if (!requiredRole) {
            return true;
        }
        if (requiredRole === roles[0].studyRole) {
            return true;
        } else {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }
    }

    public async getUserRoles(userId: string, studyId?: string): Promise<IRole[]> {
        /**
         * Get the roles of a user.
         *
         * @param userId - The id of the user.
         * @param studyId - The id of the study.
         */
        const userGroups = await this.getUserGroups(userId);
        const groupIds = userGroups.map(el => el.id);
        return studyId ? await db.collections!.roles_collection.find({ 'studyId': studyId, '$or': [{ users: userId }, { groups: groupIds }], 'life.deletedTime': null }).toArray() :
            await db.collections!.roles_collection.find({ '$or': [{ users: userId }, { groups: groupIds }], 'life.deletedTime': null }).toArray();
    }

    public async getUserGroups(userId: string): Promise<IGroupNode[]> {
        /**
         * Get the roles of a user.
         *
         * @param userId - The id of the user.
         */
        return await db.collections!.groups_collection.find({ children: userId }).toArray();
    }
}

export const permissionCore = Object.freeze(new PermissionCore());


