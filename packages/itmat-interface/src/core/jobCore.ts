import { IJob, enumJobStatus, enumJobType, enumUserTypes } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../database/database';
import { TRPCError } from '@trpc/server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';
import { errorCodes } from '../graphql/errors';

export class JobCore {
    /**
     * Create a job.
     *
     * @param requester - The id of the requester.
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
    public async createJob(requester: string, name: string, type: enumJobType, nextExecutionTime?: number, period?: number, executor?: any, data?: any, parameters?: any, priority?: number, metadata?: Record<string, any>): Promise<IJob> {
        const jobEntry: IJob = {
            id: uuid(),
            name: name,
            nextExecutionTime: nextExecutionTime ?? Date.now(),
            period: period ?? null,
            type: type,
            executor: executor ?? null,
            data: data ?? null,
            parameters: parameters ?? null,
            priority: priority ?? 0,
            history: [],
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            counter: 0,
            metadata: metadata ?? {},
            status: enumJobStatus.PENDING
        };

        await db.collections!.jobs_collection.insertOne(jobEntry);
        return jobEntry;
    }
    public async getJobs(): Promise<IJob[]> {
        return await db.collections!.jobs_collection.find({}).toArray();
    }

    public async editJob(requester: string, jobId: string, priority?: number | null, nextExecutionTime?: number | null, period?: number | null): Promise<IJob> {
        const job = await db.collections!.jobs_collection.findOne({ id: jobId });
        if (!job) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Job does not exist.'
            });
        }

        const user = await db.collections!.users_collection.findOne({ 'id': requester, 'life.deletedTime': null });
        if (!user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'User does not exist.'
            });
        }

        if (user.type !== enumUserTypes.ADMIN || user.id !== requester) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }

        const setObj: any = {};
        if (priority !== undefined) {
            setObj.priority = priority;
        }

        if (nextExecutionTime !== undefined) {
            setObj.nextExecutionTime = nextExecutionTime;
            setObj.status = enumJobStatus.PENDING;
        }

        if (period !== undefined) {
            setObj.period = period;
        }

        const result = await db.collections!.jobs_collection.findOneAndUpdate({ id: jobId }, {
            $set: setObj
        }, {
            returnDocument: 'after'
        });
        if (!result || !result.value) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.DATABASE_ERROR
            });
        }
        return result.value;
    }
}

export const jobCore = Object.freeze(new JobCore());
