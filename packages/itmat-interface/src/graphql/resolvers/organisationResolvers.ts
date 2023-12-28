import { IOrganisation } from '@itmat-broker/itmat-types';
import { db } from '../../database/database';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../errors';

export const organisationResolvers = {
    Query: {
        getOrganisations: async (__unused__parent: Record<string, unknown>, args): Promise<IOrganisation[]> => {
            if (!db.collections) {
                throw new GraphQLError(errorCodes.DATABASE_ERROR);
            }
            // everyone is allowed to see all organisations in the app.
            const queryObj = args.organisationId === undefined ? { deleted: null } : { deleted: null, id: args.organisationId };
            const cursor = db.collections.organisations_collection.find<IOrganisation>(queryObj, { projection: { _id: 0 } });
            return cursor.toArray();
        }
    },
    Mutation: {},
    Subscription: {}
};
