import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { z } from 'zod';
import { driveCore } from '../../graphql/core/driveCore';
import { userCore } from '../../graphql/core/userCore';
import { IDrivePermission } from '@itmat-broker/itmat-types';
import { baseProcedure } from '../../log/trpcLogHelper';
import { convertSerializedBufferToBuffer, isSerializedBuffer } from '../../utils/file';

const createContext = ({
    req,
    res
}: trpcExpress.CreateExpressContextOptions) => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const ZDrivePermission = z.object({
    iid: z.string(),
    read: z.boolean(),
    write: z.boolean(),
    delete: z.boolean()
});

export const driveRouter = t.router({
    /**
     * Create a drive folder.
     *
     * @param folderName - The name of the folder.
     * @param parentId - The id of the parent. Null for default root node.
     * @param description - The description of the folder.
     *
     * @return IDriveNode - The drive node to return.
     */
    createDriveFolder: baseProcedure.input(z.object({
        folderName: z.string(),
        parentId: z.union([z.string(), z.null()]),
        description: z.union([z.string(), z.null()])
    })).mutation(async (opts: any) => {
        const requester = opts.ctx.req?.user ?? opts.ctx.user;
        return await driveCore.createDriveFolderNode(requester.id, opts.input.folderName, opts.input.parentId, false, opts.input.description);
    }),
    /**
     * Create a drive file.
     *
     * @param parentId - The id of the parent node.
     */
    createDriveFile: baseProcedure.input(z.object({
        parentId: z.string(),
        description: z.union([z.string(), z.null()]),
        file: z.array(z.object({
            path: z.any(),
            filename: z.string(),
            mimetype: z.optional(z.string()),
            size: z.number()
            // ... other validation ...
        }))
    })).mutation(async (opts: any) => {
        console.log(opts.input.file);
        const requester = opts.ctx.req?.user ?? opts.ctx.user;
        const file_ = await opts.input.file[0];
        return await driveCore.createDriveFileNode(requester.id, opts.input.parentId, opts.input.description, file_.filename.split('.')[1].toUpperCase(), opts.input.file[0]);
    }),
    /**
     * Get the drive nodes of a user, including own drives and shared drives.
     *
     * @param userId - The id of the user.
     * @param rootId - The id of the root drive if specified.
     *
     * @return Record<string, IDriveNode[] - An object where key is the user Id and value is the list of drive nodes.
     */
    getDrives: baseProcedure.input(z.object({
        userId: z.string(),
        rootId: z.optional(z.string())
    })).query(async (opts: any) => {
        return driveCore.getDriveNodes(opts.input.userId, opts.input.rootId);
    }),
    /**
     * Edit a drive node.
     *
     * @param requester - The id of the requester.
     * @param driveId - The id of the driver.
     * @param managerId - The id of the manager.
     * @param name - The name of the drive.
     * @param description - The description of the drive.
     * @param parentId - The id of the parent node.
     * @param children - The ids of the childeren.
     * @param sharedUsers - Shared users.
     * @param sharedGroups - Shared user groups.
     *
     * @return driveIds - The list of drive ids influenced.
     */
    editDrive: baseProcedure.input(z.object({
        driveId: z.string(),
        managerId: z.optional(z.string()),
        name: z.optional(z.string()),
        description: z.optional(z.string()),
        parentId: z.optional(z.string()),
        children: z.optional(z.array(z.string())),
        sharedUsers: z.optional(z.array(ZDrivePermission)),
        sharedGroups: z.optional(z.array(ZDrivePermission))
    })).mutation(async (opts: any) => {
        return await driveCore.editDriveNodes(
            opts.ctx?.req?.user?.id ?? opts.ctx?.user?.id,
            opts.input.driveId,
            opts.input.managerId,
            opts.input.name,
            opts.input.description,
            opts.input.parentId,
            opts.input.children,
            opts.input.sharedUsers,
            opts.input.sharedGroups
        );
    }),
    /**
     * Share a drive to a user via email. The children drives will also be influenced.
     *
     * @param userEmails - The emails of the users.
     * @param driveId - The id of the drive.
     * @param permissions - The permission object.
     *
     * @return driveIds - The list of drive ids influenced.
     */
    shareDriveToUserViaEmail: baseProcedure.input(z.object({
        userEmails: z.array(z.string()),
        driveId: z.string(),
        permissions: z.object({
            read: z.boolean(),
            write: z.boolean(),
            delete: z.boolean()
        })
    })).mutation(async (opts: any) => {
        const userIds: IDrivePermission[] = [];
        for (const email of opts.input.userEmails) {
            const user = (await userCore.getUser(undefined, undefined, email))[0];
            userIds.push({
                iid: user.id,
                read: opts.input.permissions.read,
                write: opts.input.permissions.write,
                delete: opts.input.permissions.delete
            });
        }
        const drive = (await driveCore.getDriveNodes(opts.ctx.req.user.id, opts.input.driveId))[opts.ctx.req.user.id].filter(el => el.id === opts.input.driveId)[0];
        for (const user of drive.sharedUsers) {
            userIds.push(user);
        }
        return await driveCore.editDriveNodes(opts.ctx.req.user.id, opts.input.driveId, undefined, undefined, undefined, undefined, undefined, userIds, undefined);
    }),
    /**
     * Share drive to a user group.
     *
     * @param groupId - The id of the group.
     * @param driveId - The id of the group.
     * @param permission - The permission object.
     *
     * @return driveIds - The list of drives influenced.
     */
    shareDriveToGroupById: baseProcedure.input(z.object({
        groupId: z.string(),
        driveId: z.string(),
        permissions: z.object({
            read: z.boolean(),
            write: z.boolean(),
            delete: z.boolean()
        })
    })).mutation(async (opts: any) => {
        return await driveCore.editDriveNodes(opts.ctx.req.user.id, opts.input.driveId, undefined, undefined, undefined, undefined, undefined, undefined, [{ iid: opts.input.groupId, ...opts.input.permissions }]);
    }),
    /**
     * Delete a drive node.
     *
     * @param driveId - The id of the drive.
     *
     * @return IDriveNode - The deleted root node. (Children nodes will not be returned)
     */
    deleteDrive: baseProcedure.input(z.object({
        driveId: z.string()
    })).mutation(async (opts: any) => {
        const user = opts.ctx.req?.user ?? opts.ctx.user;
        return driveCore.deleteDriveNode(user.id, opts.input.driveId);
    })
});

