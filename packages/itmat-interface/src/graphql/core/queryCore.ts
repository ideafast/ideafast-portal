import { IQueryEntry, ICohortSelection, INewFieldSelection } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../../database/database';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../errors';

export interface QueryObjInput {
    userId: string;
    queryString: {
        data_requested: string[];
        cohort: ICohortSelection[][];
        new_fields: INewFieldSelection[];
        format: string;
    };
    studyId: string;
    projectId?: string;
}

export class QueryCore {
    public async createQuery(args: { query: QueryObjInput }): Promise<IQueryEntry> {
        if (!db.collections) {
            throw new GraphQLError(errorCodes.DATABASE_ERROR);
        }
        const query: IQueryEntry = {
            requester: args.query.userId,
            id: uuid(),
            queryString: args.query.queryString,
            studyId: args.query.studyId,
            projectId: args.query.projectId,
            status: 'QUEUED',
            error: null,
            cancelled: false,
            data_requested: args.query.queryString.data_requested,
            cohort: args.query.queryString.cohort,
            new_fields: args.query.queryString.new_fields
        };
        await db.collections.queries_collection.insertOne(query);
        return query;
    }

    public async getUsersQuery_NoResult(userId: string): Promise<IQueryEntry[]> {
        if (!db.collections) {
            throw new GraphQLError(errorCodes.DATABASE_ERROR);
        }
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        return db.collections.queries_collection.find<IQueryEntry>({ requester: userId }, { projection: { _id: 0, claimedBy: 0, queryResult: 0 } }).toArray();
    }

}

export const queryCore = Object.freeze(new QueryCore());
