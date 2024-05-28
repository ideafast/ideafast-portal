import { IBase } from './base';
import { IUser } from './user';
import { LXDInstanceState } from './lxd';

export interface IInstance extends IBase{
    id: string;
    name: string;
    userId: IUser['id'];
    username: IUser['username'];
    status: enumInstanceStatus;
    type: 'virtual-machine' | 'container';  // instance type VM or container
    appType: enumAppType; // the application type, jupyter or matlab
    createAt: number; // instance creation time
    lifeSpan: number; // instance's life span, exp. 10 hours
    instanceToken: string; // instance cert token
    notebookToken?: string; // cert token for notebook service
    project?: string |'default'; // the lxd project of the this instance
    webDavToken?: string; // webDav cert token
    config: Record<string, any>;
    lxdState?: LXDInstanceState; // Optional field for LXD instance state details
}

export enum enumInstanceStatus {
    PENDING = 'PENDING', // first creation will be pending
    FAILED = 'FAILED',
    STARTING = 'STARTING',
    STOPPING = 'STOPPING',
    RUNNING = 'RUNNING',
    STOPPED = 'STOPPED',
    DELETED = 'DELETED',
}

export enum enumAppType {
    JUPYTER = 'Jupyter',
    MATLAB = 'Matlab'
}

// operation for instance
export enum enumOpeType {
    CREATE = 'create',
    UPDATE = 'update',
    STOP = 'stop',
    START = 'start',
    DELETE = 'delete'
}

//monitor operation for instances
export enum enumMonitorType {
    STATE = 'state',
}

export enum enumInstanceType {
    SMALL = 'small',
    MIDDLE ='middle',
    LARGE = 'large'
}

