import { IJob, enumJobStatus, enumJobType } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../../database/database';

export class JobCore {
    // public async createJob(userId: string, jobType: string, files: string[], studyId: string, projectId?: string, jobId?: string): Promise<IJob> {
    //     const job: IJob = {
    //         requester: userId,
    //         id: jobId || uuid(),
    //         studyId,
    //         jobType,
    //         projectId,
    //         requestTime: new Date().valueOf(),
    //         receivedFiles: files,
    //         status: 'QUEUED',
    //         error: null,
    //         cancelled: false
    //     };
    //     await db.collections!.jobs_collection.insertOne(job);
    //     return job;
    // }
    public async createJob(requester: string, name: string, startTime: number | null, period: number | null, type: enumJobType, executor: any, data: any, parameters: any, priority: number): Promise<IJob> {
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

        const jobEntry: IJob = {
            id: uuid(),
            name: name,
            startTime: startTime,
            period: period,
            type: type,
            executor: executor,
            data: data,
            parameters: parameters,
            priority: priority,
            history: [],
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {},
            status: enumJobStatus.PENDING
        };

        await db.collections!.jobs_collection.insertOne(jobEntry);
        return jobEntry;
    }
}

export const jobCore = Object.freeze(new JobCore());
