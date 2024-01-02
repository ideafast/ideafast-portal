import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { z } from 'zod';
import { driveCore } from '../../graphql/core/driveCore';
import { userCore } from '../../graphql/core/userCore';
import { IDrivePermission, enumJobType } from '@itmat-broker/itmat-types';
import { baseProcedure } from '../../log/trpcLogHelper';
import { jobCore } from '../../graphql/core/jobCore';

const createContext = ({
    req,
    res
}: trpcExpress.CreateExpressContextOptions) => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();


export const jobRouter = t.router({
    /**
     * Create a job.
     *
     * @param name - The name of the job.
     * @param startTime - The time to execute the job. Null for immediate execution.
     * @param period - The period of the job if it is a repeated job.
     * @param type - The type of the job.
     * @param executor - The executor of the job.
     * @param data - The input data of the job.
     * @param parameters - The parameters of the job.
     * @param priority - The priority of the job.
     *
     * @return IJob
     */
    createJob: t.procedure.input(z.object({
        name: z.string(),
        startTime: z.union([z.number(), z.null()]),
        period: z.union([z.number(), z.null()]),
        type: z.nativeEnum(enumJobType),
        executor: z.object({
            path: z.string()
        }),
        data: z.any(),
        parameters: z.any(),
        priority: z.number()
    })).mutation((async (opts: any) => {
        return await jobCore.createJob(opts.ctx.req.user.id, opts.input.name, opts.input.startTime, opts.input.period, opts.input.type,
            opts.input.executor, opts.input.data, opts.input.parameters, opts.input.priority);
    }))
});

