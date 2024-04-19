import { IUser, enumConfigType, enumTRPCErrorCodes, enumUserTypes } from '@itmat-broker/itmat-types';
import { TRPCError, inferAsyncReturnType, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { configCore } from '../../core/configCore';
import { baseProcedure } from '../../log/trpcLogHelper';
import { errorCodes } from '../../graphql/errors';

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
    })).query(async (opts) => {
        return await configCore.getConfig(opts.input.configType, opts.input.key, opts.input.useDefault);
    }),
    editConfig: baseProcedure.input(z.object({
        configId: z.string(),
        configOptions: z.any()
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user ?? opts.ctx.user;
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }
        return await configCore.editConfig(opts.input.configId, opts.input.configOptions);
    })
});