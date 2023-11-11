import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { z } from 'zod';
import { driveCore } from '../../graphql/core/driveCore';
import { userCore } from '../../graphql/core/userCore';
import { IDrivePermission } from '@itmat-broker/itmat-types';
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

export const driveRouter = t.router({
    createDriveFolder: baseProcedure.input(z.object({
        folderName: z.string(),
        parentId: z.union([z.string(), z.null()]),
        description: z.union([z.string(), z.null()])
    })).mutation(async (opts: any) => {
        const requester = opts.ctx.req.user;
        return await driveCore.createDriveFolderNode(requester.id, opts.input.folderName, opts.input.parentId, false, opts.input.description);
    }),
    createDriveFile: baseProcedure.input(z.object({
        parentId: z.string(),
        description: z.union([z.string(), z.null()]),
        file: z.array(z.object({
            fileBuffer: z.any(),
            filename: z.string(),
            mimetype: z.string(),
            size: z.number()
            // ... other validation ...
        }))
    })).mutation(async (opts: any) => {
        const requester = opts.ctx.req.user;
        const file_ = await opts.input.file[0];
        // if (file_.fileBuffer.data) {
        //     file_.fileBuffer = file_.fileBuffer.data;
        // }
        let fileBuffer: Buffer = await file_.fileBuffer;
        if (isSerializedBuffer(file_.fileBuffer)) {
            fileBuffer = convertSerializedBufferToBuffer(file_.fileBuffer);
        } else {
            fileBuffer = file_.fileBuffer;  // Assume it's already a Buffer
        }
        file_.fileBuffer = fileBuffer;
        return await driveCore.createDriveFileNode(requester.id, opts.input.parentId, opts.input.description, file_.filename.split('.')[1].toUpperCase(), file_);
    }),
    getDrives: baseProcedure.input(z.object({
        userId: z.string(),
        rootId: z.union([z.string(), z.null()])
    })).query(async (opts: any) => {
        return driveCore.getDriveNodes(opts.input.userId, opts.input.rootId);
    }),
    editDrive: baseProcedure.input(z.object({
        driveId: z.string(),
        managerId: z.union([z.string(), z.null()]),
        name: z.union([z.string(), z.null()]),
        description: z.union([z.string(), z.null()]),
        parentId: z.union([z.string(), z.null()]),
        children: z.union([z.array(z.string()), z.null()]),
        sharedUsers: z.union([z.array(ZDrivePermission), z.null()]),
        sharedGroups: z.union([z.array(ZDrivePermission), z.null()])
    })).mutation(async (opts: any) => {
        return await driveCore.editDriveNodes(
            opts.ctx.req.user.id,
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
            const user = (await userCore.getUser(null, null, email))[0];
            user && userIds.push({
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
        return await driveCore.editDriveNodes(opts.ctx.req.user.id, opts.input.driveId, null, null, null, null, null, userIds, null);
    }),
    shareDriveToGroupById: baseProcedure.input(z.object({
        groupId: z.string(),
        driveId: z.string(),
        permissions: z.object({
            read: z.boolean(),
            write: z.boolean(),
            delete: z.boolean()
        })
    })).mutation(async (opts: any) => {
        return await driveCore.editDriveNodes(opts.ctx.req.user.id, opts.input.driveId, null, null, null, null, null, null, { iid: opts.input.groupId, ...opts.input.permissions });
    }),
    deleteDrive: baseProcedure.input(z.object({
        driveId: z.string()
    })).mutation(async (opts: any) => {
        return driveCore.deleteDriveNode(opts.ctx.req.user.id, opts.input.driveId);
    })
});

interface SerializedBuffer {
    type: string;
    data: number[];
}

function isSerializedBuffer(obj: any): obj is SerializedBuffer {
    return obj && obj.type === 'Buffer' && Array.isArray(obj.data);
}



function convertSerializedBufferToBuffer(serializedBuffer: SerializedBuffer): Buffer {
    return Buffer.from(serializedBuffer.data);
}