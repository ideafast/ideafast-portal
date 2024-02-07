import { IOrganisation } from '@itmat-broker/itmat-types';
import { organisationCore } from '../../core/organisationCore';

export const organisationResolvers = {
    Query: {
        /**
         * Get the info of organisations.
         *
         * @param orgId - The id of the organisation.
         *
         * @return IOrganisation[] - The list of objects of IOrganisation.
         */
        getOrganisations: async (__unused__parent: Record<string, unknown>, { orgId }: { orgId?: string }): Promise<IOrganisation[]> => {
            return organisationCore.getOrganisations(orgId);
        }
    },
    Mutation: {},
    Subscription: {}
};
