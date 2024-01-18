import { IOrganisation, enumConfigType, enumStudyRoles } from '@itmat-broker/itmat-types';
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { custom, z } from 'zod';
import { configCore } from '../../core/configCore';
import { organisationCore } from '../../core/organisationCore';
import { permissionCore } from '../../core/permissionCore';
import { userInfo } from 'os';
import { baseProcedure } from '../../log/trpcLogHelper';

const createContext = ({
    req,
    res
}: trpcExpress.CreateExpressContextOptions) => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const ZDrivePermission = z.object({
    userId: z.string(),
    read: z.boolean(),
    write: z.boolean(),
    delete: z.boolean()
});

export const ZDataPermission = z.object({
    fields: z.array(z.string()),
    dataProperties: z.record(z.array(z.string())),
    permission: z.number()
});

export const permissionRouter = t.router({
    /**
     * Create a Role.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     * @param name - The name of the role.
     * @param description - The description of the role.
     * @param dataPermissions - The data permissions of the role.
     * @param studyRole - The study role of the role.
     */
    createRole: baseProcedure.input(z.object({
        studyId: z.string(),
        name: z.string(),
        description: z.string(),
        dataPermissions: z.union([z.array(ZDataPermission), z.null()]),
        studyRole: z.nativeEnum(enumStudyRoles)
    })).mutation(async (opts: any) => {
        const requester = opts.ctx.req.user;
        return await permissionCore.createRole(
            requester.id,
            opts.input.studyId,
            opts.input.name,
            opts.input.description,
            opts.input.dataPermissions,
            opts.input.studyRole
        );
    }),
    /**
     * Edit a Role.
     *
     * @param roleId - The id of the role.
     * @param name - The name of the role.
     * @param description - The description of the role.
     * @param dataPermisisons - The data permissions of the role.
     * @param studyRole - The study role of the role.
     * @param users - The users of this role.
     */
    editRole: baseProcedure.input(z.object({
        roleId: z.string(),
        name: z.union([z.null(), z.string()]),
        description: z.union([z.null(), z.string()]),
        dataPermissions: z.union([z.array(ZDataPermission), z.null()]),
        studyRole: z.union([z.null(), z.nativeEnum(enumStudyRoles)]),
        users: z.union([z.null(), z.array(z.string())]),
        groups: z.union([z.null(), z.array(z.string())])
    })).mutation(async (opts: any) => {
        return await permissionCore.editRole(
            opts.input.roleId,
            opts.input.name,
            opts.input.description,
            opts.input.dataPermisisons,
            opts.input.studyRole,
            opts.input.users,
            opts.input.groups
        );
    }),
    /**
     * Delete a role.
     *
     * @param roleId - The id of the role.
     */
    deleteRole: baseProcedure.input(z.object({
        roleId: z.string()
    })).mutation(async (opts: any) => {
        const user = opts.ctx.req.user;
        return await permissionCore.deleteRole(
            user.id,
            opts.input.roleId
        );
    }),
    /**
     * Get the roles of a study or a roleId.
     *
     * @param studyId - The id of the study.
     */
    getRoles: baseProcedure.input(z.object({
        studyId: z.string(),
        roleId: z.union([z.null(), z.string()])
    })).query(async (opts: any) => {
        return await permissionCore.getRoles(opts.input.studyId, opts.input.roleId);
    }),
    /**
     * Get the roles of a user.
     *
     * @param studyId - The id of the study.
     */
    getUserRoles: baseProcedure.input(z.object({
        userId: z.string()
    })).query(async (opts: any) => {
        return await permissionCore.getUserRoles(opts.input.userId);
    })
});