import { db } from '../database/database';
import { v4 as uuid } from 'uuid';
import { enumEventOperation, enumEventType, enumEventStatus, enumAPIResolver, enumUserTypes } from '@itmat-broker/itmat-types';

// only requests in white list will be recorded
export const logActionRecordWhiteList = Object.keys(enumEventOperation);

// only requests in white list will be recorded
export const logActionShowWhiteList = Object.keys(enumEventOperation);

export class LogPlugin {
    public async serverWillStartLogPlugin(): Promise<null> {
        /**
         * Log helpers for server start.
         */
        // const id = uuid();
        // await db.collections!.log_collection.insertOne({
        //     id: id,
        //     requester: 'SYSTEM',
        //     // userAgent: enumUserAgent.OTHER,
        //     type: enumEventType.SYSTEM_LOG,
        //     operationName: enumEventOperation.startSERVER,
        //     parameters: {},
        //     status: enumEventStatus.SUCCESS,
        //     errors: [],
        //     life: {
        //         createdTime: Date.now(),
        //         createdUser: 'SYSTEM',
        //         deletedTime: null,
        //         deletedUser: null
        //     },
        //     metadata: {}
        // });
        return null;
    }

    public async requestDidStartLogPlugin(requestContext: any, time: number): Promise<null> {
        if (!logActionRecordWhiteList.includes(requestContext.operationName)) {
            return null;
        }
        if (!(enumEventOperation as any)[requestContext.operationName]) {
            return null;
        }
        await db.collections!.log_collection.insertOne({
            id: uuid(),
            requester: requestContext.contextValue?.req?.user?.id ?? 'NA',
            type: enumEventType.API_LOG,
            apiResolver: enumAPIResolver.GraphQL,
            event: requestContext.operationName,
            parameters: JSON.stringify(ignoreFieldsHelper(requestContext.request.variables, requestContext.operationName)),
            status: requestContext.errors ? enumEventStatus.FAIL : enumEventStatus.SUCCESS,
            errors: requestContext.errors ? undefined : requestContext[0]?.message,
            timeConsumed: time,
            life: {
                createdTime: Date.now(),
                createdUser: enumUserTypes.SYSTEM,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        });
        return null;
    }
}

function ignoreFieldsHelper(dataObj: any, operationName: string) {
    if (operationName === 'login') {
        delete dataObj['password'];
        delete dataObj['totp'];
    } else if (operationName === 'createUser') {
        delete dataObj['user']['password'];
    } else if (operationName === 'registerPubkey') {
        delete dataObj['signature'];
    } else if (operationName === 'issueAccessToken') {
        delete dataObj['signature'];
    } else if (operationName === 'editUser') {
        delete dataObj['user']['password'];
    } else if (operationName === 'uploadDataInArray') {
        if (Array.isArray(dataObj['data'])) {
            for (let i = 0; i < dataObj['data'].length; i++) {
                // only keep the fieldId
                delete dataObj['data'][i].value;
                delete dataObj['data'][i].file;
                delete dataObj['data'][i].metadata;
            }
        }
    } else if (operationName === 'uploadFile') {
        delete dataObj['file'];
    }
    return dataObj;
}

export const logPlugin = Object.freeze(new LogPlugin());

