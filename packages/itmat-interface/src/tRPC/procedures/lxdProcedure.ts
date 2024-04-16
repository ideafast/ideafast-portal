import { TRPCError, initTRPC } from '@trpc/server';
import { z } from 'zod';
import lxdManager from '../../lxd/lxdManager';
import { baseProcedure } from '../../log/trpcLogHelper';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';

// Assuming createContext has been defined elsewhere and properly sets up the context including user information
const t = initTRPC.create();

export const lxdRouter = t.router({
    getResources: baseProcedure.input(z.object({
    })).query(async (opts: any ) => {
        if (!opts.ctx.req?.user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        return await lxdManager.getResources();
    }),

    getInstanceState: baseProcedure.input(z.object({
        container: z.string()
    })).query(async (opts: any) => {
        if (!opts.ctx.req?.user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        return await lxdManager.getInstanceState(opts.input.container);
    }),

    getOperations: baseProcedure.input(z.object({

    })).query(async (opts: any) => {
        if (!opts.ctx.req?.user)  {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        return await lxdManager.getOperations();
    }),

    getOperationStatus: baseProcedure.input(z.object({
        operationId: z.string()
    })).query(async (opts: any) => {
        if (!opts.ctx.req?.user)  {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        return await lxdManager.getOperationStatus(`/1.0/operations/${opts.input.operationId}`);
    }),

    getInstanceConsole: baseProcedure.input(z.object({
        container: z.string(),
        options: z.object({
            height: z.number(),
            width: z.number(),
            type: z.string()
        })
    })).mutation(async (opts: any) => {
        if (!opts.ctx.req?.user)  {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        return await lxdManager.getInstanceConsole(opts.input.container, opts.input.options);
    }),

    createInstance: baseProcedure.input(z.object({
        name: z.string(),
        architecture: z.literal('x86_64'), // Assuming architecture is fixed for this example
        config: z.record(z.any()), // Use z.record(z.any()) if the config structure is flexible or z.object for a fixed structure
        source: z.object({
            type: z.string(),
            alias: z.string()
        }),
        profiles: z.array(z.string()), // Assuming profiles is an array of strings
        type: z.union([z.literal('virtual-machine'), z.literal('container')])
    })).mutation(async (opts: any) => {
        if (!opts.ctx.req?.user) {
            throw new TRPCError({
                code: 'UNAUTHORIZED',
                message: 'User must be authenticated.'
            });
        }
        // Adjust this call to match how your lxdManager or equivalent service expects to receive the data
        return await lxdManager.createInstance({
            ...opts.input
        });
    }),
    updateInstance: baseProcedure.input(z.object({
        instanceName: z.string(),
        payload: z.any() // Define the schema for update payload as needed
    })).mutation(async (opts: any) => {
        if (!opts.ctx.req?.user)  {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        return await lxdManager.updateInstance(opts.input.instanceName, opts.input.payload);
    }),

    startStopInstance: baseProcedure.input(z.object({
        instanceName: z.string(),
        action: z.enum(['start', 'stop'])
    })).mutation(async (opts: any) => {
        if (!opts.ctx.req?.user)  {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        return await lxdManager.startStopInstance(opts.input.instanceName, opts.input.action);
    }),

    deleteInstance: baseProcedure.input(z.object({
        instanceName: z.string()
    })).mutation(async (opts: any) => {
        if (!opts.ctx.req?.user)  {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        return await lxdManager.deleteInstance(opts.input.instanceName);
    })


});

