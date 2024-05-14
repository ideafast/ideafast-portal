import { TRPCError, initTRPC } from '@trpc/server';
import { z } from 'zod';
import lxdManager from '../../lxd/lxdManager';
import { baseProcedure } from '../../log/trpcLogHelper';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';
import { db } from '../../database/database';
import { Logger } from '@itmat-broker/itmat-commons';
import { LXDInstanceState } from '@itmat-broker/itmat-types';

// Assuming createContext has been defined elsewhere and properly sets up the context including user information
const t = initTRPC.create();

export const lxdRouter = t.router({

    getResources: baseProcedure.query(async (opts: any ) => {
        if (!opts.ctx.req?.user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        return await lxdManager.getResources();
    }),

    getInstances: baseProcedure.query(async (opts: any) => {
        if (!opts.ctx.req?.user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        // Only admin can get all instances
        return await lxdManager.getInstances();
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

    getInstanceConsoleLog: baseProcedure.input(z.object({
        container: z.string()
    })).mutation(async (opts: any) => {
        if (!opts.ctx.req?.user)  {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        return await lxdManager.getInstanceConsoleLog(opts.input.container);
    }),

    createInstance: baseProcedure.input(z.object({
        name: z.string(),
        architecture: z.literal('x86_64'), // now we fix it to x86_64
        config: z.record(z.any()),
        source: z.object({
            type: z.string(),
            alias: z.string()
        }),
        profiles: z.array(z.string()), // Assuming profiles is an array of strings
        type: z.union([z.literal('virtual-machine'), z.literal('container')])
    })).mutation(async (opts: any) => {
        if (!opts.ctx.req?.user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        return await lxdManager.createInstance({
            ...opts.input
        });
    }),
    updateInstance: baseProcedure.input(z.object({
        instanceName: z.string(),
        payload: z.any()
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
    }),

    getInstanceJupyterUrl: baseProcedure.input(z.object({
        instanceName: z.string()
    })).mutation(async (opts: any) => {
        if (!opts.ctx.req?.user)  {
            throw new TRPCError({
                code: enumTRPCErrorCodes.UNAUTHORIZED,
                message: 'User must be authenticated.'
            });
        }
        const response = await lxdManager.getInstanceState(opts.input.instanceName);

        if (response.error || !response.data) {
            Logger.error('Unable to retrieve instance state:' + opts.input.instanceName);
            throw new TRPCError({
                code: enumTRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: 'Unable to retrieve instance state.'
            });
        }
        const instanceState = response.data as LXDInstanceState;
        // // assign the data of return to the name instanceState , the return is {data: LXDInstanceState}
        // const { data: instanceState }: { data: LXDInstanceState } = await lxdManager.getInstanceState(opts.input.instanceName);
        if (!instanceState.network || !instanceState.network.eth0) {
            Logger.error('Unable to retrieve network details for instance.' + opts.input.instanceName);
            throw new TRPCError({
                code: enumTRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: 'Unable to retrieve network details for instance.'
            });
        }

        const ipv4Address = instanceState.network.eth0.addresses
            .filter(addr => addr.family === 'inet')
            .map(addr => addr.address)[0];

        if (!ipv4Address) {
            Logger.error('No IPv4 address found for instance:' + opts.input.instanceName);
            throw new TRPCError({
                code: enumTRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: 'No IPv4 address found for instance.'
            });
        }

        const instance = await db.collections?.instance_collection.findOne({ name: opts.input.instanceName });

        if (!instance) {
            Logger.error('Instance does not exist:' + opts.input.instanceName);
            throw new TRPCError({
                code: enumTRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: 'Instance does not exist.'
            });
        }

        const notebookToken = instance.notebookToken;

        if (!notebookToken) {
            Logger.error('Notebook token does not exist for instance:' + opts.input.instanceName);
            throw new TRPCError({
                code: enumTRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: 'Notebook token does not exist.'
            });
        }

        const port = 8888;  // The port may need to be retrieved from the instance details
        const jupyterUrl = `http://${ipv4Address}:${port}/?token=${notebookToken}`;

        return {
            jupyterUrl
        };
    })



});

