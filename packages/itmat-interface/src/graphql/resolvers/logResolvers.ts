import { ILog, IUser, enumUserTypes } from '@itmat-broker/itmat-types';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../errors';
import { logCore } from '../core/logCore';

export const logResolvers = {
    Query: {
        getLogs: async (__unused__parent: Record<string, unknown>, { requesterId, userAgent, type, operationName, status, startIndex, endIndex }: { requesterId: string[] | null, userAgent: string[] | null, type: string[] | null, operationName: string[] | null, status: string[] | null, startIndex: number | null, endIndex: number | null }, context: any): Promise<Partial<ILog>[]> => {
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

            const user: IUser = context.req.user;

            if (user.type !== enumUserTypes.ADMIN && user.type !== enumUserTypes.OBSERVER) {
                throw new GraphQLError('You have no permissions to view logs.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
            }
            return [];
            // const logs = await logCore.getLogs(requesterId, userAgent, type, operationName, status, startIndex, endIndex);
            // return logs;
        }
    }
};


