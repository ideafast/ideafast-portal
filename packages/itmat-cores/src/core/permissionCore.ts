import { GraphQLError } from 'graphql';
import { atomicOperation, IDataEntry, IDataPermission, IManagementPermission, IPermissionManagementOptions, IRole, IUserWithoutToken, userTypes } from '@itmat-broker/itmat-types';
import { BulkWriteResult, Document, Filter } from 'mongodb';
import { v4 as uuid } from 'uuid';
import { DBType } from '../database/database';
import { errorCodes } from '../utils/errors';
import { makeGenericReponse } from '../utils/responses';

export interface ICombinedPermissions {
    subjectIds: string[],
    visitIds: string[],
    fieldIds: string[]
}

export interface QueryMatcher {
    key: string,
    op: string,
    parameter: number | string | boolean
}

export class PermissionCore {
    db: DBType;
    constructor(db: DBType) {
        this.db = db;
    }

    public async getGrantedPermissions(requester: IUserWithoutToken | undefined, studyId?: string, projectId?: string) {
        if (!requester) {
            throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
        }
        const matchClause: Filter<IRole> = { users: requester.id };
        if (studyId)
            matchClause.studyId = studyId;
        if (projectId)
            matchClause.projectId = { $in: [projectId, undefined] };
        const aggregationPipeline = [
            { $match: matchClause }
            // { $group: { _id: requester.id, arrArrPrivileges: { $addToSet: '$permissions' } } },
            // { $project: { arrPrivileges: { $reduce: { input: '$arrArrPrivileges', initialValue: [], in: { $setUnion: ['$$this', '$$value'] } } } } }
        ];

        const grantedPermissions = {
            studies: await this.db.collections.roles_collection.aggregate(aggregationPipeline).toArray(),
            projects: await this.db.collections.roles_collection.aggregate(aggregationPipeline).toArray()
        };
        return grantedPermissions;
    }

    public async getUsersOfRole(role: IRole) {
        const listOfUsers = role.users;
        return await (this.db.collections.users_collection.find({ id: { $in: listOfUsers } }, { projection: { _id: 0, password: 0, email: 0 } }).toArray());

    }

    public async getAllRolesOfStudyOrProject(studyId: string, projectId?: string): Promise<IRole[]> {
        return await this.db.collections.roles_collection.find({ studyId, projectId }).toArray();
    }

    public async userHasTheNeccessaryManagementPermission(type: string, operation: string, user: IUserWithoutToken, studyId: string, projectId?: string) {
        if (user === undefined) {
            return false;
        }

        /* if user is an admin then return true if admin privileges includes needed permissions */
        if (user.type === userTypes.ADMIN) {
            return true;
        }
        const tag = `permissions.manage.${type}`;
        const roles = await this.db.collections.roles_collection.aggregate([
            { $match: { studyId, projectId: { $in: [projectId, null] }, users: user.id, deleted: null } }, // matches all the role documents where the study and project matches and has the user inside
            { $match: { [tag]: operation } }
        ]).toArray();
        if (roles.length === 0) {
            return false;
        }
        return true;
    }

    public async combineUserDataPermissions(operation: string, user: IUserWithoutToken, studyId: string, projectId?: string) {
        if (user.type === userTypes.ADMIN) {
            const matchAnyString = '^.*$';
            return {
                subjectIds: [matchAnyString],
                visitIds: [matchAnyString],
                fieldIds: [matchAnyString]
            };
        }
        const roles = await this.db.collections.roles_collection.aggregate<IRole>([
            { $match: { studyId, projectId: { $in: [projectId, null] }, users: user.id, deleted: null } }, // matches all the role documents where the study and project matches and has the user inside
            { $match: { 'permissions.data.operations': operation } }
        ]).toArray();
        if (roles.length === 0) {
            return false;
        }
        const combined: ICombinedPermissions = {
            subjectIds: [],
            visitIds: [],
            fieldIds: []
        };
        for (const role of roles) {
            combined.subjectIds.push(...new Set(combined.subjectIds.concat(role.permissions.data?.subjectIds || [])));
            combined.visitIds.push(...new Set(combined.visitIds.concat(role.permissions.data?.visitIds || [])));
            combined.fieldIds.push(...new Set(combined.fieldIds.concat(role.permissions.data?.fieldIds || [])));
        }
        return combined;
    }

    public checkDataEntryValid(combinedDataPermissions: ICombinedPermissions | false, fieldId: string, subjectId?: string, visitId?: string): boolean {
        if (!combinedDataPermissions) {
            return false;
        }
        if (!subjectId || !visitId) {
            return combinedDataPermissions.fieldIds.some((el: string) => (new RegExp(el)).test(fieldId));
        } else {
            return (
                combinedDataPermissions.subjectIds.some((el: string) => (new RegExp(el)).test(subjectId))
                && combinedDataPermissions.visitIds.some((el: string) => (new RegExp(el)).test(visitId))
                && combinedDataPermissions.fieldIds.some((el: string) => (new RegExp(el)).test(fieldId))
            );
        }
    }

    public async userHasTheNeccessaryDataPermission(operation: string, user: IUserWithoutToken, studyId: string, projectId?: string) {
        if (user === undefined) {
            return false;
        }
        const matchAnyString = '^.*$';
        /* if user is an admin then return true if admin privileges includes needed permissions */
        if (user.type === userTypes.ADMIN) {
            return {
                matchObj: [],
                hasVersioned: true,
                raw: {
                    subjectIds: [matchAnyString],
                    visitIds: [matchAnyString],
                    fieldIds: [matchAnyString]
                },
                uploaders: [],
                roles: [],
                roleraw: []
            };
        }

        const roles = await this.db.collections.roles_collection.aggregate<IRole>([
            { $match: { studyId, projectId: { $in: [projectId, null] }, users: user.id, deleted: null } }, // matches all the role documents where the study and project matches and has the user inside
            { $match: { 'permissions.data.operations': operation } }
        ]).toArray();
        let hasVersioned = false;
        const roleObj: Array<{ key: string; op: string, parameter: boolean }>[] = [];
        const raw: ICombinedPermissions = {
            subjectIds: [],
            visitIds: [],
            fieldIds: []
        };
        const roleraw: { subjectIds: string[], visitIds: string[], fieldIds: string[], uploaders: string[], hasVersioned: boolean }[] = [];
        let uploaders: string[] = [];
        for (const role of roles) {
            roleObj.push([{
                key: `role:${role.id}`,
                op: '=',
                parameter: true
            }]);
            raw.subjectIds = raw.subjectIds.concat(role.permissions.data?.subjectIds || []);
            raw.visitIds = raw.visitIds.concat(role.permissions.data?.visitIds || []);
            raw.fieldIds = raw.fieldIds.concat(role.permissions.data?.fieldIds || []);
            if (role.permissions.data?.uploaders) {
                uploaders = uploaders.concat(role.permissions.data?.uploaders || []);
            }
            if (role.permissions.data?.hasVersioned) {
                hasVersioned = hasVersioned || role.permissions.data.hasVersioned;
            }
            roleraw.push({
                subjectIds: role.permissions.data?.subjectIds || [],
                visitIds: role.permissions.data?.visitIds || [],
                fieldIds: role.permissions.data?.fieldIds || [],
                uploaders: role.permissions.data?.uploaders || [],
                hasVersioned: role.permissions.data?.hasVersioned || false
            });
        }
        if (Object.keys(roleObj).length === 0) {
            return false;
        }
        return { matchObj: roleObj, hasVersioned: hasVersioned, uploaders: uploaders, raw: raw, roleraw: roleraw };
    }

    public combineMultiplePermissions(permissions) {
        const res: { matchObj: QueryMatcher[][], hasVersioned: boolean, raw: ICombinedPermissions } = {
            matchObj: [],
            hasVersioned: false,
            raw: {
                subjectIds: [],
                visitIds: [],
                fieldIds: []
            }
        };
        for (const permission of permissions) {
            if (!permission) {
                continue;
            }
            res.raw.subjectIds = res.raw.subjectIds.concat(permission.raw?.subjectIds || []);
            res.raw.visitIds = res.raw.visitIds.concat(permission.raw?.visitIds || []);
            res.raw.fieldIds = res.raw.fieldIds.concat(permission.raw?.fieldIds || []);
            res.matchObj = res.matchObj.concat(permission.matchObj || []);
            res.hasVersioned = res.hasVersioned || permission.hasVersioned;
        }
        return res;
    }

    public async removeRole(requester: IUserWithoutToken | undefined, roleId: string) {
        if (!requester) {
            throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
        }

        const role = await this.db.collections.roles_collection.findOne({ id: roleId, deleted: null });
        if (role === null) {
            throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
        }

        /* check permission */
        const hasPermission = await this.userHasTheNeccessaryManagementPermission(
            IPermissionManagementOptions.role,
            atomicOperation.WRITE,
            requester,
            role.studyId,
            role.projectId
        );
        if (!hasPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }
        const updateResult = await this.db.collections.roles_collection.findOneAndUpdate({ id: roleId, deleted: null }, { $set: { deleted: new Date().valueOf() } });
        if (updateResult) {
            return makeGenericReponse(roleId);
        } else {
            throw new GraphQLError('Cannot delete role.', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async removeRoleFromStudyOrProject({ studyId, projectId }: { studyId: string, projectId?: string } | { studyId?: string, projectId: string }): Promise<void> {
        if (studyId === undefined && projectId === undefined) {
            throw new GraphQLError('Neither studyId nor projectId is provided');
        }
        let queryObj = {};
        if (studyId !== undefined && projectId !== undefined) {
            queryObj = { studyId, projectId, deleted: null };
        } else if (studyId !== undefined) {
            queryObj = { studyId, deleted: null };
        } else if (projectId !== undefined) {
            queryObj = { projectId, deleted: null };
        }
        const updateResult = await this.db.collections.roles_collection.updateMany(queryObj, { $set: { deleted: new Date().valueOf() } });
        if (updateResult.acknowledged) {
            return;
        } else {
            throw new GraphQLError('Cannot delete role(s).', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }
    }

    public async editRole(requester: IUserWithoutToken | undefined, roleId: string, name?: string, description?: string, permissionChanges?: { data?: IDataPermission, manage?: IManagementPermission }, userChanges?: { add: string[], remove: string[] }): Promise<IRole> {
        if (!requester) {
            throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
        }
        const role = await this.db.collections.roles_collection.findOne({ id: roleId, deleted: null });
        if (role === null) {
            throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
        }

        /* check the requester has privilege */
        const hasPermission = await this.userHasTheNeccessaryManagementPermission(
            IPermissionManagementOptions.role,
            atomicOperation.WRITE,
            requester,
            role.studyId,
            role.projectId
        );
        if (!hasPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }

        /* check whether all the permissions are valid in terms of regular expressions */
        if (permissionChanges) {
            if (permissionChanges.data) {
                if (permissionChanges.data.subjectIds) {
                    for (const subjectId of permissionChanges.data.subjectIds) {
                        this.checkReExpIsValid(subjectId);
                    }
                }
                if (permissionChanges.data.visitIds) {
                    for (const visitId of permissionChanges.data.visitIds) {
                        this.checkReExpIsValid(visitId);
                    }
                }
                if (permissionChanges.data.fieldIds) {
                    for (const fieldId of permissionChanges.data.fieldIds) {
                        this.checkReExpIsValid(fieldId);
                    }
                }
            }
        }

        /* check whether all the users exists */
        if (userChanges) {
            const allRequestedUserChanges: string[] = [...userChanges.add, ...userChanges.remove];
            const testedUser: string[] = [];
            for (const each of allRequestedUserChanges) {
                if (!testedUser.includes(each)) {
                    const user = await this.db.collections.users_collection.findOne({ id: each, deleted: null });
                    if (user === null) {
                        throw new GraphQLError(errorCodes.CLIENT_MALFORMED_INPUT);
                    } else {
                        testedUser.push(each);
                    }
                }
            }
        }
        if (permissionChanges === undefined) {
            permissionChanges = {
                data: { subjectIds: [], visitIds: [], fieldIds: [], uploaders: ['^.*$'], hasVersioned: false, operations: [] },
                manage: {
                    [IPermissionManagementOptions.own]: [atomicOperation.READ],
                    [IPermissionManagementOptions.role]: [],
                    [IPermissionManagementOptions.job]: [],
                    [IPermissionManagementOptions.query]: [],
                    [IPermissionManagementOptions.ontologyTrees]: [atomicOperation.READ]
                }
            };
        }

        if (userChanges === undefined) { userChanges = { add: [], remove: [] }; }

        const bulkop = this.db.collections.roles_collection.initializeUnorderedBulkOp();
        bulkop.find({ id: roleId, deleted: null }).updateOne({ $set: { permissions: permissionChanges }, $addToSet: { users: { $each: userChanges.add } } });
        bulkop.find({ id: roleId, deleted: null }).updateOne({ $set: { permissions: permissionChanges }, $pullAll: { users: userChanges.remove } });
        if (name) {
            bulkop.find({ id: roleId, deleted: null }).updateOne({ $set: { name } });
        }
        if (description) {
            bulkop.find({ id: roleId, deleted: null }).updateOne({ $set: { description } });
        }
        const result: BulkWriteResult = await bulkop.execute();
        const resultingRole = await this.db.collections.roles_collection.findOne({ id: roleId, deleted: null });
        if (!resultingRole) {
            throw new GraphQLError('Role does not exist', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        // filters
        // We send back the filtered fields values
        let validSubjects: Array<string | RegExp> = [];
        if (permissionChanges.data?.filters) {
            if (permissionChanges.data.filters.length > 0) {
                const subqueries = translateCohort(permissionChanges.data.filters);
                validSubjects = (await this.db.collections.data_collection.aggregate<IDataEntry>([{
                    $match: { $and: subqueries }
                }]).toArray()).map(el => el.m_subjectId);
            }
        }


        // update the data and field records
        const dataBulkOp = this.db.collections.data_collection.initializeUnorderedBulkOp();
        const filters: ICombinedPermissions = {
            subjectIds: permissionChanges.data?.subjectIds || [],
            visitIds: permissionChanges.data?.visitIds || [],
            fieldIds: permissionChanges.data?.fieldIds || []
        };
        if (!validSubjects.length) {
            validSubjects = filters.subjectIds.map((el: string) => new RegExp(el));
        }
        const dataTag = `metadata.${'role:'.concat(roleId)}`;
        dataBulkOp.find({
            m_studyId: resultingRole.studyId,
            m_versionId: { $exists: true, $ne: null },
            $and: [{
                m_subjectId: { $in: filters.subjectIds.map((el: string) => new RegExp(el)) }
            }, {
                m_subjectId: { $in: validSubjects }
            }],
            m_visitId: { $in: filters.visitIds.map((el: string) => new RegExp(el)) },
            m_fieldId: { $in: filters.fieldIds.map((el: string) => new RegExp(el)) }
        }).update({
            $set: { [dataTag]: true }
        });
        dataBulkOp.find({
            m_studyId: resultingRole.studyId,
            m_versionId: { $exists: true, $ne: null },
            $or: [
                { m_subjectId: { $nin: validSubjects } },
                { m_subjectId: { $nin: filters.subjectIds.map((el: string) => new RegExp(el)) } },
                { m_visitId: { $nin: filters.visitIds.map((el: string) => new RegExp(el)) } },
                { m_fieldId: { $nin: filters.fieldIds.map((el: string) => new RegExp(el)) } }
            ]
        }).update({
            $set: { [dataTag]: false }
        });
        const fieldBulkOp = this.db.collections.field_dictionary_collection.initializeUnorderedBulkOp();
        const fieldIds = permissionChanges.data?.fieldIds || [];
        const fieldTag = `metadata.${'role:'.concat(roleId)}`;
        fieldBulkOp.find({
            studyId: resultingRole.studyId,
            dataVersion: { $exists: true, $ne: null },
            fieldId: { $in: fieldIds.map((el: string) => new RegExp(el)) }
        }).update({
            $set: { [fieldTag]: true }
        });
        fieldBulkOp.find({
            studyId: resultingRole.studyId,
            dataVersion: { $exists: true, $ne: null },
            fieldId: { $nin: fieldIds.map((el: string) => new RegExp(el)) }
        }).update({
            $set: { [fieldTag]: false }
        });
        await dataBulkOp.execute();
        await fieldBulkOp.execute();
        if (result.ok === 1 && resultingRole) {
            return resultingRole;
        } else {
            throw new GraphQLError('Cannot edit role.', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async addRole(requester: IUserWithoutToken | undefined, studyId: string, projectId: string | undefined, roleName: string) {
        if (!requester) {
            throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
        }
        /* check whether user has at least provided one id */
        if (studyId === undefined && projectId === undefined) {
            throw new GraphQLError('Please provide either study id or project id.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* check the requester has privilege */
        const hasPermission = await this.userHasTheNeccessaryManagementPermission(
            IPermissionManagementOptions.role,
            atomicOperation.WRITE,
            requester,
            studyId,
            projectId
        );
        if (!hasPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }

        /* check whether the target study or project exists */
        if (studyId && projectId) {  // if both study id and project id are provided then just make sure they belong to each other
            const result = await this.db.collections.projects_collection.findOne({ id: projectId, deleted: null });
            if (!result || result.studyId !== studyId) {
                throw new GraphQLError('The project provided does not belong to the study provided', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        } else if (studyId) {  // if only study id is provided
            const study = await this.db.collections.studies_collection.findOne({ id: studyId, deleted: null });
            if (!study) {
                throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        } else if (projectId) {
            const study = await this.db.collections.projects_collection.findOne({ id: projectId, deleted: null });
            if (!study) {
                throw new GraphQLError('Project does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        }

        const opt = { createdBy: requester.id, studyId, projectId, roleName };
        /* add user role */
        const role: IRole = {
            id: uuid(),
            name: opt.roleName,
            permissions: {
                data: {
                    subjectIds: [],
                    visitIds: [],
                    fieldIds: [],
                    hasVersioned: false,
                    operations: [],
                    uploaders: ['^.*$']
                },
                manage: {
                    [IPermissionManagementOptions.own]: [atomicOperation.READ],
                    [IPermissionManagementOptions.role]: [],
                    [IPermissionManagementOptions.job]: [],
                    [IPermissionManagementOptions.query]: [],
                    [IPermissionManagementOptions.ontologyTrees]: [atomicOperation.READ]
                }
            },
            description: '',
            users: [],
            studyId: opt.studyId,
            projectId: opt.projectId,
            createdBy: opt.createdBy,
            metadata: {},
            deleted: null
        };
        const updateResult = await this.db.collections.roles_collection.insertOne(role);
        if (updateResult.acknowledged) {
            return role;
        } else {
            throw new GraphQLError('Cannot create role.', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public checkReExpIsValid(pattern: string) {
        try {
            new RegExp(pattern);
        } catch {
            throw new GraphQLError(`${pattern} is not a valid regular expression.`, { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }
    }
}

export function translateCohort(cohort) {
    const queries: Document[] = [];
    cohort.forEach(function (select) {
        const match = {
            m_fieldId: select.field
        };
        switch (select.op) {
            case '=':
                // select.value must be an array
                match['value'] = { $in: [select.value] };
                break;
            case '!=':
                // select.value must be an array
                match['value'] = { $nin: [select.value] };
                break;
            case '<':
                // select.value must be a float
                match['value'] = { $lt: parseFloat(select.value) };
                break;
            case '>':
                // select.value must be a float
                match['value'] = { $gt: parseFloat(select.value) };
                break;
            case 'derived': {
                // equation must only have + - * /
                const derivedOperation = select.value.split(' ');
                if (derivedOperation[0] === '=') {
                    match['value'] = { $eq: parseFloat(select.value) };
                }
                if (derivedOperation[0] === '>') {
                    match['value'] = { $gt: parseFloat(select.value) };
                }
                if (derivedOperation[0] === '<') {
                    match['value'] = { $lt: parseFloat(select.value) };
                }
                break;
            }
            case 'exists':
                // We check if the field exists. This is to be used for checking if a patient
                // has an image
                match['value'] = { $exists: true };
                break;
            case 'count': {
                // counts can only be positive. NB: > and < are inclusive e.g. < is <=
                const countOperation = select.value.split(' ');
                const countfield = select.field + '.count';
                if (countOperation[0] === '=') {
                    match[countfield] = { $eq: parseInt(countOperation[1], 10) };
                }
                if (countOperation[0] === '>') {
                    match[countfield] = { $gt: parseInt(countOperation[1], 10) };
                }
                if (countOperation[0] === '<') {
                    match[countfield] = { $lt: parseInt(countOperation[1], 10) };
                }
                break;
            }
            default:
                break;
        }
        queries.push(match);
    }
    );
    return queries;
}
