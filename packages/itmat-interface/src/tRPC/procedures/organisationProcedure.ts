import { IOrganisation, enumConfigType } from '@itmat-broker/itmat-types';
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { custom, z } from 'zod';
import { configCore } from '../../graphql/core/configCore';
import { organisationCore } from '../../graphql/core/organisationCore';
import { baseProcedure } from '../../log/trpcLogHelper';

const createContext = ({
    req,
    res
}: trpcExpress.CreateExpressContextOptions) => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const organisationRouter = t.router({
    /**
     * Get the info of organisations.
     *
     * @param orgId - The id of the organisation.
     *
     * @return IOrganisation[] - The list of objects of IOrganisation.
     */
    getOrganisations: baseProcedure.input(z.object({
        orgId: z.union([z.string(), z.null()])
    })).query(async (opts: any) => {
        return organisationCore.getOrganisations(opts.input.orgId);
    })
});