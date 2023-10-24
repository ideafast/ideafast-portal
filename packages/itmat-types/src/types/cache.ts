import { IBase } from './base';

/** We store large data as json in minio as a cache. */
export interface ICache extends IBase {
    keyHash: string;
    keys: Record<string, any>,
    uri: string;
    status: enumCacheStatus
}

export enum enumCacheStatus {
    OUTDATED = 'OUTDATED',
    INUSE = 'INUSE'
}