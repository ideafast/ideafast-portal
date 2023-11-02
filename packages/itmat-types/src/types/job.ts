import { IBase } from './base';

export interface IJob extends IBase {
    name: string;
    startTime: number | null; // null for ready to execute if available
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
    errors: string[];
}

export enum enumJobType {
    DMPAPI = 'DMPAPI',
    AE = 'AE'
}

export enum enumJobStatus {
    PENDING = 'PENDING',
    CANCELLED = 'CANCELLED',
    FINISHED = 'FINISHED'
}

export interface IExecutor {
    id: string;
    path: string; // for DMPAPI, use the trpc router path
    type: string | null;
}
