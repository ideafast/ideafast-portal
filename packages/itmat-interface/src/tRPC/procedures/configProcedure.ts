import { enumConfigType } from '@itmat-broker/itmat-types';
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { configCore } from '../../core/configCore';
import { baseProcedure } from '../../log/trpcLogHelper';

const createContext = () => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const configRouter = t.router({
    /**
     * Get the config.
     *
     * @param configType - The type of the config..
     * @param key - The key of the config. studyid, userid, or null for system.
     * @param useDefault - Whether to use the default config if not found.
     *
     * @return IConfig
     */
    getConfig: baseProcedure.input(z.object({
        configType: z.nativeEnum(enumConfigType),
        key: z.union([z.string(), z.null()]),
        useDefault: z.boolean()
    })).query(async (opts: any) => {
        return await configCore.getConfig(opts.input.configType, opts.input.key, opts.input.useDefault);
    })
});