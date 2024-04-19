import { TRPCError, inferAsyncReturnType, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { baseProcedure } from '../../log/trpcLogHelper';
import { domainCore } from '../../core/domainCore';
import { IUser, enumUserTypes, enumTRPCErrorCodes } from '@itmat-broker/itmat-types';
import { errorCodes } from '../../graphql/errors';
import fs from 'fs';
const createContext = () => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const domainRouter = t.router({
    getDomains: baseProcedure.input(z.object({
        domainId: z.optional(z.string()),
        domainName: z.optional(z.string()),
        domainPath: z.optional(z.string())
    })).query(async (opts: any) => {
        // const requester: IUser = opts.ctx.req?.user ?? opts.ctx.user;
        // if (!opts.input.domainId && !opts.input.domainName && !opts.input.domainPath) {
        //     throw new TRPCError({
        //         code: enumTRPCErrorCodes.BAD_REQUEST,
        //         message: errorCodes.NO_PERMISSION_ERROR
        //     });
        // }
        return domainCore.getDomains(opts.input.domainId, opts.input.domainName, opts.input.domainPath);
    }),
    createDomain: baseProcedure.input(z.object({
        domainName: z.string(),
        domainPath: z.string(),
        profile: z.optional(z.array(z.object({
            path: z.any(),
            filename: z.string(),
            mimetype: z.optional(z.string()),
            size: z.number()
        }))),
        color: z.optional(z.string())
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user ?? opts.ctx.user;
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }
        try {
            return await domainCore.createDomain(
                requester.id,
                opts.input.domainName,
                opts.input.domainPath,
                opts.input.profile[0],
                opts.input.color
            );
        } finally {
            // Cleanup: Delete the temporary file from the disk
            if (opts.input.profile) {
                const filePath = opts.input.profile[0].path;
                if (fs.existsSync(filePath)) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error('Error deleting temporary file:', filePath, err);
                        }
                    });
                }
            }
        }
    }),
    deleteDomain: baseProcedure.input(z.object({
        domainId: z.string()
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user ?? opts.ctx.user;
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }
        return await domainCore.deleteDomain(requester.id, opts.input.domainId);
    })
});