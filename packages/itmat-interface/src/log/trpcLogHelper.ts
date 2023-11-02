import { z } from 'zod';
import { t } from '../server/tRPCRouter';
import { TRPCError } from '@trpc/server';
import { exec } from 'child_process';
import { ILog, enumAPIResolver, enumEventStatus, enumEventType, enumUserAgent } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../database/database';
type LogInput = {
    name: string;
    input: unknown;
    executionTime: number;
};
import jwt from 'jsonwebtoken';
import { GraphQLError } from 'graphql';
import { ApolloServerErrorCode } from '@apollo/server/dist/esm/errors';
import { userRetrieval } from '../authentication/pubkeyAuthentication';

async function saveLogToDatabase(log: LogInput) {
    // Implement the logic to save log to your database
}

function loggerMiddleware({ input, type, path }: any) {
    return async (next: any) => {
        const startTime = Date.now();

        // Proceed with the original procedure
        const result = await next(input);

        const endTime = Date.now();
        const executionTime = endTime - startTime;

        // Save log details to the database
        saveLogToDatabase({
            name: path,
            input,
            executionTime
        });

        return result;
    };
}

const publicProcedure = t.procedure;
// export const baseProcedure = publicProcedure.use(async (opts: any) => {
//     const url = opts.ctx.req.url;
//     const listCalls = parseBatchedUrl(url);
//     console.log(listCalls);
//     return opts.next();
// });

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
            logs.push({
                id: uuid(),
                requester: opts.ctx.req.user?.id ?? 'NA',
                type: enumEventType.API_LOG,
                apiResolver: enumAPIResolver.tRPC,
                event: event.apiName,
                parameters: event.parameters,
                status: enumEventStatus.SUCCESS,
                errors: [],
                timeConsumed: event.executionTime,
                life: {
                    createdTime: Date.now(),
                    createdUser: 'SYSTEMAGENT',
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            });
        }
        await db.collections!.log_collection.insertMany(logs);
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