import { enumUserTypes, IGenericResponse, IOrganisation, IUser } from '@itmat-broker/itmat-types';
import { GraphQLError } from 'graphql';
import { db } from '../../database/database';
import { organisationCore } from '../core/organisationCore';
import { errorCodes } from '../errors';
import { makeGenericReponse } from '../responses';

export const organisationResolvers = {
    Query: {
        getOrganisations: async (__unused__parent: Record<string, unknown>, { orgId }: { orgId: string | null }): Promise<IOrganisation[]> => {
            /**
             * Get the info of organisations.
             *
             * @param orgId - The id of the organisation.
             *
             * @return IOrganisation[] - The list of objects of IOrganisation.
             */
            const queryObj = orgId === null ? { deleted: null } : { deleted: null, id: orgId };
            const cursor = db.collections!.organisations_collection.find<IOrganisation>(queryObj, { projection: { _id: 0 } });
            return cursor.toArray();
        }
    },
    Mutation: {
        createOrganisation: async (__unused__parent: Record<string, unknown>, { name, shortname, location }: { name: string, shortname: string, location: number[] | null }, context: any): Promise<IOrganisation> => {
            /**
             * Create an organisation.
             *
             * @param name - The name of the organisation.
             * @param shortname - The shortname of the organisation.
             * @param location - The location of the organisation.
             *
             * @return IOrganisation - The object of IOrganisation.
             */
            const requester: IUser = context.req.user;

            /* check privileges */
            if (requester.type !== enumUserTypes.ADMIN) {
                throw new GraphQLError('Only admins can create organisations.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
            }
            const organisation = await organisationCore.createOrganisation(requester.id, name, shortname, location, null);

            return organisation;
        },
        deleteOrganisation: async (__unused__parent: Record<string, unknown>, { orgId }: { orgId: string }, context: any): Promise<IGenericResponse> => {
            /**
             * Delete an organisation.
             *
             * @param orgId - The id of the organisation.
             *
             * @return IGenericResponse - The object of IGenericResponse.
             */

            const requester: IUser = context.req.user;

            /* check privileges */
            if (requester.type !== enumUserTypes.ADMIN) {
                throw new GraphQLError('Only admins can delete organisations.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
            }

            await organisationCore.deleteOrganisation(requester.id, orgId);

            return makeGenericReponse(orgId, true, undefined, `Organisation ${orgId} has been deleted.`);
        },
        editOrganisation: async (__unused__parent: Record<string, unknown>, { orgId, name, shortname, location, profile }: { orgId: string, name: string | null, shortname: string | null, location: number[] | null, profile: string | null }, context: any): Promise<IGenericResponse> => {
            /**
             * Edit an organisation. Note, if value is null, it will user the old value.
             *
             * @param orgId - The id of the organisation.
             * @param name - The name of the organisation.
             * @param shortname - The shortname of the organisation.
             * @param location - The location of the organisation.
             * @param profile - The profile of the organisation.
             *
             * @return IGenericResponse - The object of IGenericResponse.
             */

            const requester: IUser = context.req.user;

            /* check privileges */
            if (requester.type !== enumUserTypes.ADMIN) {
                throw new GraphQLError('Only admins can edit organisations.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
            }

            await organisationCore.editOrganisation(orgId, name, shortname, location, profile);

            return makeGenericReponse(orgId, true, undefined, `Organisation ${orgId} has been edited.`);
        }
    },
    Subscription: {}
};
