import { IJobEntry } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../../database/database';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../errors';

export class JobCore {
    public async createJob(userId: string, jobType: string, files: string[], studyId: string, projectId?: string, jobId?: string): Promise<IJobEntry<unknown>> {
        // check database collections existence
        if (!db.collections) {
            throw new GraphQLError(errorCodes.DATABASE_ERROR);
        }
        const job: IJobEntry<unknown> = {
            requester: userId,
            id: jobId || uuid(),
            studyId,
            jobType,
            projectId,
            requestTime: new Date().valueOf(),
            receivedFiles: files,
            status: 'QUEUED',
            error: null,
            cancelled: false
        };
        await db.collections.jobs_collection.insertOne(job);
        return job;
    }
}

export const jobCore = Object.freeze(new JobCore());
