import { TRPCError, inferAsyncReturnType, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { IUser, enumJobType, enumUserTypes, enumTRPCErrorCodes } from '@itmat-broker/itmat-types';
import { baseProcedure } from '../../log/trpcLogHelper';
import { jobCore } from '../../core/jobCore';
import { errorCodes } from '../../graphql/errors';

const createContext = () => ({}); // no context
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
    createJob: baseProcedure.input(z.object({
        name: z.string(),
        startTime: z.union([z.number(), z.null()]),
        period: z.union([z.number(), z.null()]),
        type: z.nativeEnum(enumJobType),
        executor: z.optional(z.object({
            path: z.string()
        })),
        data: z.any(),
        parameters: z.any(),
        priority: z.number()
    })).mutation((async (opts: any) => {
        return await jobCore.createJob(opts.ctx.req.user.id, opts.input.name, opts.input.type, opts.input.startTime, opts.input.period,
            opts.input.executor, opts.input.data, opts.input.parameters, opts.input.priority);
    })),
    getJobs: baseProcedure.input(z.object({

    })).query(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user ?? opts.ctx.user;
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }
        return await jobCore.getJobs();
    }),
    editJob: baseProcedure.input(z.object({
        jobId: z.string(),
        priority: z.optional(z.number()),
        nextExecutionTime: z.union([z.number(), z.null()]),
        period: z.union([z.number(), z.null()])
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user ?? opts.ctx.user;
        return await jobCore.editJob(
            requester.id,
            opts.input.jobId,
            opts.input.priority,
            opts.input.nextExecutionTime,
            opts.input.period
        );
    })
});

