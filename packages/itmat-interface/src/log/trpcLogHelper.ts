import { t } from '../server/tRPCRouter';
import { ILog, enumAPIResolver, enumEventStatus, enumEventType } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../database/database';

export const baseProcedure = t.procedure.use(async (opts: any) => {
    const startTime = Date.now();

    // Move on to the next middleware or procedure
    const result = await opts.next();

    const endTime = Date.now();
    const executionTime = endTime - startTime;
    if (opts.ctx.req) {
        const listEvents = parseBatchedUrl(opts.ctx.req.url, executionTime);
        const logs: ILog[] = [];
        for (const event of listEvents) {
            const logContent = {
                id: uuid(),
                requester: opts.ctx.req.user?.id ?? 'NA',
                type: enumEventType.API_LOG,
                apiResolver: enumAPIResolver.tRPC,
                event: event.apiName,
                parameters: event.parameters,
                status: enumEventStatus.SUCCESS,
                errors: undefined,
                timeConsumed: event.executionTime,
                life: {
                    createdTime: Date.now(),
                    createdUser: 'SYSTEMAGENT',
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            };
            logs.push(logContent);

        }
        logs.length && await db.collections!.log_collection.insertMany(logs);
        return result;
    }
    else {
        // await db.collections!.log_collection.insertOne({
        //     id: uuid(),
        //     requester: opts.ctx.req.user?.id ?? 'NA',
        //     type: enumEventType.API_LOG,
        //     apiResolver: enumAPIResolver.tRPC,
        //     event: opts.path,
        //     parameters: opts.rawInput,
        //     status: enumEventStatus.SUCCESS,
        //     errors: [],
        //     timeConsumed: executionTime,
        //     life: {
        //         createdTime: Date.now(),
        //         createdUser: 'SYSTEMAGENT',
        //         deletedTime: null,
        //         deletedUser: null
        //     },
        //     metadata: {}
        // });
        return result;
    }
});




function parseBatchedUrl(url: string, executionTime: number): any[] {
    const [path, queryString] = url.split('?');

    const apiCalls = path.split(',');

    const queryParams = new URLSearchParams(queryString);
    const inputParam = queryParams.get('input');
    if (!inputParam) {
        return [];
    }
    if (!inputParam) {
        throw new Error('Missing \'input\' key in query parameters');
    }

    const apiParams: { [key: string]: any } = JSON.parse(decodeURIComponent(inputParam));

    const result: any[] = apiCalls.map((apiCall, idx) => {
        return {
            apiName: apiCall.replace('/', ''),
            parameters: apiParams[idx + 1] || {},
            executionTime: executionTime
        };
    });

    return result;
}