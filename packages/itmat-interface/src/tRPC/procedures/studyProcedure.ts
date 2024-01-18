import { IUser, enumStudyRoles, enumUserTypes } from '@itmat-broker/itmat-types';
import { TRPCError, inferAsyncReturnType, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { z } from 'zod';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../../graphql/errors';
import { studyCore } from '../../core/studyCore';
import { baseProcedure } from '../../log/trpcLogHelper';
import { BufferSchema } from './type';
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';
import { convertSerializedBufferToBuffer, isSerializedBuffer } from '../../utils/file';
import fs from 'fs';
import path from 'path';
import { permissionCore } from '../../core/permissionCore';
const createContext = ({
    req,
    res
}: trpcExpress.CreateExpressContextOptions) => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const studyRouter = t.router({
    /**
     * Get the info of studies.
     *
     * @param studyId - The if of the study.
     *
     * @return Partial<IStudy>
     */
    getStudies: baseProcedure.input(z.object({
        studyId: z.optional(z.string())
    })).query(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user ?? opts.ctx.user;
        if (opts.input.studyId) {
            await permissionCore.checkOperationPermissionByUser(requester.id, opts.input.studyId);
        }
        return await studyCore.getStudiesByUser(requester.id, opts.input.studyId);
    }),
    /**
     * Create a study.
     *
     * @param name - The name of the study.
     * @param description - The description of the study.
     * @param profile - The profile of the study.
     *
     * @return IStudy
     */
    createStudy: baseProcedure.input(z.object({
        name: z.string(),
        description: z.optional(z.string()),
        profile: z.array(z.object({
            path: z.any(),
            filename: z.string(),
            mimetype: z.optional(z.string()),
            size: z.number()
            // ... other validation ...
        }))
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user ?? opts.ctx.user;
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }
        /* create study */
        try {
            const study = await studyCore.createStudy(requester.id, opts.input.name, opts.input.description, opts.input.profile[0]);
            return study;
        } finally {
            // Cleanup: Delete the temporary file from the disk
            if (opts.input.profile) {
                const filePath = opts.input.profile[0].path;
                if (fs.existsSync(filePath)) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error('Error deleting temporary file:', filePath, err);
                        }
                    });
                }
            }
        }
    }),
    /**
     * Edit a study.
     *
     * @param studyId - The id of the study.
     * @param name - The name of the study.
     * @param description - The description of the study.
     * @param profile - The profile of the user.
     *
     * @return Partial<IStudy>
     */
    editStudy: baseProcedure.input(z.object({
        studyId: z.string(),
        name: z.optional(z.string()),
        description: z.optional(z.string()),
        profile: z.optional(z.array(z.object({
            path: z.any(),
            filename: z.string(),
            mimetype: z.optional(z.string()),
            size: z.number()
        })))
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user ?? opts.ctx.user;
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }
        try {
            const study = await studyCore.editStudy(requester.id, opts.input.studyId, opts.input.name, opts.input.description, opts.input.profile[0]);
            return study;
        } finally {
            // Cleanup: Delete the temporary file from the disk
            if (opts.input.profile) {
                const filePath = opts.input.profile[0].path;
                if (fs.existsSync(filePath)) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error('Error deleting temporary file:', filePath, err);
                        }
                    });
                }
            }
        }
    }),
    /**
     * Delete a study.
     *
     * @param studyId - The id of the study.
     *
     * @return IGenericResponse - The obejct of IGenericResponse.
     */
    deleteStudy: baseProcedure.input(z.object({
        studyId: z.string()
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user ?? opts.ctx.user;

        /* check privileges */
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }

        const response = studyCore.deleteStudy(requester.id, opts.input.studyId);

        return response;
    }),
    /**
     * Create a new data version of the study.
     *
     * @param studyId - The id of the study.
     * @param tag - The tag of the study.
     * @param dataVersion - The new version of the study. User float number.
     *
     * @return IGenericResponse - The object of IGenericResponse.
     */
    createDataVersion: baseProcedure.input(z.object({
        studyId: z.string(),
        dataVersion: z.string(),
        tag: z.string()
    })).mutation(async (opts: any) => {
        const requester = opts.ctx.req.user;
        await permissionCore.checkOperationPermissionByUser(requester.id, opts.input.studyId, enumStudyRoles.STUDY_MANAGER);
        const response = await studyCore.createDataVersion(requester, opts.input.studyId, opts.input.tag, opts.input.dataVersion);
        return response;
    }),
    /**
     * Set a data version as the current data version of a  study.
     *
     * @param studyId - The id of the study.
     * @param dataVersionId - The id of the data version.
     *
     * @return IGenreicResponse
     */
    setDataversionAsCurrent: baseProcedure.input(z.object({
        studyId: z.string(),
        dataVersionId: z.string()
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user ?? opts.ctx.user;
        await permissionCore.checkOperationPermissionByUser(requester.id, opts.input.studyId, enumStudyRoles.STUDY_MANAGER);
        const response = await studyCore.setDataVersion(opts.input.studyId, opts.input.dataVersionId);
        return response;
    })
});