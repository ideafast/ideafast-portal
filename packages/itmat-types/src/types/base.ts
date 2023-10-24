import { z } from 'zod';

export const ZLifeCircle = z.object({
    createdTime: z.number(),
    createdUser: z.string(),
    deletedTime: z.union([z.number(), z.null()]),
    deletedUser: z.union([z.string(), z.null()])
});
export type TLifeCircle = z.infer<typeof ZLifeCircle>;
export interface ILifeCircle {
    createdTime: number;
    createdUser: string;
    deletedTime: number | null;
    deletedUser: string | null;
}

export const ZBase = z.object({
    id: z.string(),
    life: ZLifeCircle,
    metadata: z.any()
});
export type TBase = z.infer<typeof ZBase>;
export interface IBase {
    id: string;
    life: ILifeCircle;
    metadata: Record<string, any>;
}
