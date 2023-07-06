import { db } from '../../database/database';
import { GraphQLError } from 'graphql';
import { IOrganisation, IGenericResponse, ILog, enumUserAgent } from '@itmat-broker/itmat-types';
import { makeGenericReponse } from '../responses';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../errors';

export class LogCore {
    public async getLogs(requesterId: string[] | null, userAgent: string[] | null, type: string[] | null, operationName: string[] | null, status: string[] | null, startIndex: number | null, endIndex: number | null): Promise<ILog[]> {
        /**
         * Get logs.
         *
         * @param requesterId - The id of the requester.
         * @param userAgent - The user agents.
         * @param type - The type of the log.
         * @param operationName - The name of the operation.
         * @param status - The status of the operation.
         * Note that if parameters set to null, no restrictions will be applied.
         *
         * @return ILog[]
         */

        const filters: any = {};
        if (requesterId) {
            filters.requesterId = { $in: requesterId };
        }
        if (userAgent) {
            filters.userAgent = { $in: userAgent };
        }
        if (type) {
            filters.type = { $in: type };
        }
        if (operationName) {
            filters.operationName = { $in: operationName };
        }
        if (status) {
            filters.status = { $in: status };
        }
        let logs;
        if (startIndex && endIndex) {
            logs = await db.collections!.log_collection.find(filters).skip(startIndex).limit(endIndex - startIndex).toArray();
        } else {
            logs = await db.collections!.log_collection.find(filters).toArray();
        }
        return logs;
    }
}

export const logCore = Object.freeze(new LogCore());
