import { IBase } from './base';
import type * as mongodb from 'mongodb';
export interface IJob extends IBase {
    name: string;
    nextExecutionTime: number; // when creating jobs, set it to now for immediate executed jobs or a further time; do not be confused if this time is older than the current time.
    period: number | null; // null for oneoff jobs
    type: enumJobType;
    executor: IExecutor;
    data: JSON;
    parameters: JSON;
    priority: number;
    history: IJobHistory[]; // by default we will only keep the latest history
    status: enumJobStatus;
}

export interface IJobHistory {
    time: number;
    status: enumJobHistoryStatus;
    errors: string[];
}

export enum enumJobType {
    DMPAPI = 'DMPAPI',
    AE = 'AE'
}

export enum enumJobStatus {
    PENDING = 'PENDING', // oneoff jobs will always be PENDING
    CANCELLED = 'CANCELLED',
    FINISHED = 'FINISHED', // period should be null
}

export enum enumJobHistoryStatus {
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED'
}

export interface IExecutor {
    id: string;
    path: string; // for DMPAPI, use the trpc router path
    type: string | null;
}


// Job Executor
export interface IJobPollerConfig {
    identity: string; // a string identifying the server; this is just to keep track in mongo
    jobType?: string; // if undefined, matches all jobs
    jobCollection: mongodb.Collection<IJob>; // collection to poll
    pollingInterval: number; // in ms
    action: (document: any) => any; // gets called every time there is new document,
    jobSchedulerConfig: any
}

export interface IJobSchedulerConfig {
    strategy: enumJobSchedulerStrategy,
    usePriority: boolean,
    // for errored jobs
    reExecuteFailedJobs: boolean,
    failedJobDelayTime: number, // unit timestamps
    maxAttempts: number, // the number of attempts should be stored in history
    jobCollection?: mongodb.Collection<IJob>; // collection to poll
}

export enum enumJobSchedulerStrategy {
    FIFO = 'FIFO'
}