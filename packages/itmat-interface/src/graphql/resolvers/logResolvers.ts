import { db } from '../../database/database';
import { ILogEntry, IUser, LOG_ACTION, userTypes } from '@itmat-broker/itmat-types';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../errors';

interface LogObjInput {
    requesterName?: string;
    requesterType?: userTypes;
    logType?: LOG_TYPE;
    actionType?: LOG_ACTION;
    status?: LOG_STATUS
}

export const logResolvers = {
    Query: {
        getLogs: async (__unused_parent: Record<string, unknown>, args: LogObjInput, context: any): Promise<ILogEntry[]> => {
            if (!db.collections) {
                throw new GraphQLError(errorCodes.DATABASE_ERROR);
            }
            const requester: IUser = context.req.user;

            /* only admin can access this field */
            if (!(requester.type === userTypes.ADMIN) && !(requester.metadata?.logPermission === true)) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }

            const queryObj: Record<string, unknown> = {};
            for (const prop of (Object.keys(args) as Array<keyof LogObjInput>)) {
                if (args[prop] !== undefined) {
                    queryObj[prop] = args[prop];
                }
            }
            const logData = await db.collections.log_collection.find<ILogEntry>(queryObj, { projection: { _id: 0 } }).limit(1000).sort('time', -1).toArray();
            // log information decoration
            for (const i in logData) {
                logData[i].actionData = JSON.stringify(await logDecorationHelper(logData[i].actionData, logData[i].actionType));
            }

            return logData;
        }
    }
};

// fields that carry sensitive information will be hidden
export const hiddenFields = {
    LOGIN_USER: ['password', 'totp'],
    UPLOAD_FILE: ['file', 'description']
};

async function logDecorationHelper(actionData: string, actionType: string) {
    if (!db.collections) {
        throw new GraphQLError(errorCodes.DATABASE_ERROR);
    }
    const obj: Record<string, any> = JSON.parse(actionData) ?? {};
    if (Object.keys(hiddenFields).includes(actionType)) {
        for (let i = 0; i < hiddenFields[actionType as keyof typeof hiddenFields].length; i++) {
            delete obj[hiddenFields[actionType as keyof typeof hiddenFields][i]];
        }
    }
    if (actionType === LOG_ACTION.getStudy) {
        const studyId = obj['studyId'];
        const study = await db.collections.studies_collection.findOne({ id: studyId, deleted: null })!;
        if (study === null || study === undefined) {
            obj['name'] = '';
        }
        else {
            obj['name'] = study.name;
        }
    }
    return obj;
}
