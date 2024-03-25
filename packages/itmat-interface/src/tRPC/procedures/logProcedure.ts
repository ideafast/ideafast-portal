import { enumAPIResolver, enumEventStatus, enumEventType } from '@itmat-broker/itmat-types';
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { baseProcedure } from '../../log/trpcLogHelper';
import { logCore } from '../../core/logCore';

const createContext = () => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const logRouter = t.router({
    /**
     * Get the list of logs.
     *
     * @param caller - The caller of the event.
     * @param type - The type of the event.
     * @param apiResolver - The resolver of the event.
     * @param event - The event.
     * @param status - The status of the event.
     * @param range - The range of the indexes.
     *
     * @return IOrganisation[] - The list of objects of IOrganisation.
     */
    getLogs: baseProcedure.input(z.object({
        caller: z.optional(z.string()),
        type: z.optional(z.array(z.nativeEnum(enumEventType)), z.null()),
        apiResolver: z.optional(z.array(z.nativeEnum(enumAPIResolver)), z.null()),
        event: z.optional(z.array(z.string()), z.null()),
        status: z.optional(z.array(z.nativeEnum(enumEventStatus)), z.null()),
        indexRange: z.optional(z.array(z.number()), z.null()),
        timeRange: z.optional(z.array(z.number()), z.null())
    })).query(async (opts: any) => {
        return await logCore.getLogs(opts.input.caller, opts.input.type, opts.input.apiResolver, opts.input.event, opts.input.status, opts.input.indexRange, opts.input.timeRange);
    }),
    getLogsSummary: baseProcedure.query(async () => {
        return await logCore.getLogsSummary();
    })
});