import { initTRPC } from '@trpc/server';
import { z } from 'zod';
export const t = initTRPC.create();
// export const appRouter = t.router({
//     // getUser: t.procedure.input(z.object({
//     //     z.string()
//     // }).query((opts: any) => {
//     //     opts.input; // string
//     //     return { id: opts.input, name: 'Bilbo' };
//     // })
//     getUser: t.procedure.input(z.object({
//         id: z.string()
//     })).query((opts: any) => {
//         opts.input; // string
//         return 'a';
//     })
// });
// // export type definition of API
// export type AppRouter = typeof appRouter;