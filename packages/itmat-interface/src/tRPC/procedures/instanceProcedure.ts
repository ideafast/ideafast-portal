import { TRPCError, inferAsyncReturnType, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { baseProcedure } from '../../log/trpcLogHelper';
import { IUser, enumAppType, enumInstanceStatus } from '@itmat-broker/itmat-types';
import { instanceCore } from '../../core/instanceCore';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';

const createContext = () => ({}); // Simplified context creation for this example
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const instanceRouter = t.router({
    /**
     * create a instance
     */
    createInstance: baseProcedure.input(z.object({
        name: z.string(),
        type: z.union([z.literal('virtual-machine'), z.literal('container')]),
        appType: z.nativeEnum(enumAppType),
        lifeSpan: z.number(),
        project: z.optional(z.string()),
        cpuLimit: z.number().optional(), // Optional CPU limit field
        memoryLimit: z.string().optional() // Optional memory limit field
    })).mutation(async (opts: any) => {
        const { name, type, appType, lifeSpan, project, cpuLimit, memoryLimit } = opts.input;
        const userId = opts.ctx.req.user.id;
        if (!userId) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        return await instanceCore.createInstance(userId, opts.ctx.req.user.username, name, type, appType, lifeSpan, project, cpuLimit, memoryLimit);
    }),

    /**
     * start or stop instance
     */
    startStopInstance: baseProcedure
        .input(z.object({
            instanceId: z.string(),
            action: z.enum(['start', 'stop'])
        }))
        .mutation(async (opts: any) => {
            const userId = opts.ctx.req.user.id;
            if (!userId) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.UNAUTHORIZED,
                    message: 'User must be authenticated.'
                });
            }

            const { instanceId, action } = opts.input;
            return await instanceCore.startStopInstance(userId, instanceId, action);
        }),

    getInstances: baseProcedure.query(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user;
        if (requester.type !== 'ADMIN') {
            throw new TRPCError({
                code: enumTRPCErrorCodes.FORBIDDEN,
                message: 'Insufficient permissions.'
            });
        }
        return await instanceCore.getInstances(requester.id);
    }),

    editInstance: baseProcedure.input(z.object({
        instanceId: z.string().optional(),
        instanceName: z.string().optional(),
        updates: z.object({
            name: z.string().optional(),
            type: z.union([z.literal('virtual-machine'), z.literal('container')]).optional(),
            appType: z.nativeEnum(enumAppType).optional(),
            lifeSpan: z.number().optional(),
            project: z.string().optional(),
            status: z.nativeEnum(enumInstanceStatus).optional(),
            // Add new fields for CPU and memory limits
            cpuLimit: z.number().optional(),
            memoryLimit: z.string().optional()
        }).nonstrict()
    })).mutation(async (opts: any) => {
        const userId = opts.ctx.req.user.id; // Using context's user object
        if (!userId) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        const requester: IUser = opts.ctx.req.user;
        console.log(requester);
        const { instanceId, instanceName, updates } = opts.input;
        return await instanceCore.editInstance(requester, instanceId, instanceName, updates);
    }),

    deleteInstance: baseProcedure.input(z.object({
        instanceId: z.string()
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user;
        if (requester.type !== 'ADMIN') {
            throw new TRPCError({
                code: enumTRPCErrorCodes.FORBIDDEN,
                message: 'Insufficient permissions.'
            });
        }
        return await instanceCore.deleteInstance(requester.id, opts.input.instanceId);
    })

});
