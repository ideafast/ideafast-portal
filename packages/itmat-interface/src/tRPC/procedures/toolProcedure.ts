import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import { baseProcedure } from '../../log/trpcLogHelper';

const createContext = () => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const toolRouter = t.router({
    getCurrentSubPath: baseProcedure.query(async (opts: any) => {
        const subpath = opts.ctx.req.body.referer.split('/')[3] || '';
        return subpath;
    })
});