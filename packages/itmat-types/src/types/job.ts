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
    history: IJobHistory[];
    error: JSON;
}

export interface IJobHistory extends IBase {
    status: enumJobStatus;
    time: number;
}

export enum enumJobType {
    DMPAPI = 'DMPAPI',
    AE = 'AE'
}

export enum enumJobStatus {
    SUCCESS = 'SUCCESS',
    FAIL = 'FAIL',
    PENDING = 'PENDING',
    CANCELLED = 'CANCELLED'
}

export interface IExecutor extends IBase {
    id: string;
}
