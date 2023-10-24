import { IResetPasswordRequest, IStudy, IUser, enumDocTypes, enumFileCategories, enumFileTypes, enumGroupNodeTypes, enumUserTypes } from '@itmat-broker/itmat-types';
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { custom, z } from 'zod';
import { userCore } from '../../graphql/core/userCore';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../../graphql/errors';
import { makeGenericReponse } from '../../graphql/responses';
import bcrypt from 'bcrypt';
import * as mfa from '../../utils/mfa';
import { mailer } from '../../emailer/emailer';
import { decryptEmail, encryptEmail, makeAESIv, makeAESKeySalt } from '../../encryption/aes';
import config from '../../utils/configManager';
import { Logger } from '@itmat-broker/itmat-commons';
import { v4 as uuid } from 'uuid';
import { Readable } from 'stream';
import QRCode from 'qrcode';
import tmp from 'tmp';
import { FileUpload } from 'graphql-upload-minimal';
import { type } from 'os';
import { fileCore } from '../../graphql/core/fileCore';
import { docCore } from '../../graphql/core/docCore';
import { studyCore } from '../../graphql/core/studyCore';
import { baseProcedure } from '../../log/trpcLogHelper';
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
        studyId: z.union([z.string(), z.null()])
    })).query(async (opts: any) => {
        const requester: IUser = opts.ctx.req.user;

        const studies = await studyCore.getStudies(opts.input.studyId);

        const filteredStudies: any[] = [];
        for (const study of studies) {
            filteredStudies.push({
                id: study.id,
                name: study.name,
                description: study.description,
                currentDataVersion: study.currentDataVersion,
                dataVersions: study.dataVersions,
                profile: study.profile
            });
        }
        return filteredStudies;
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
        studyId: z.string(),
        name: z.string(),
        description: z.string(),
        profile: z.union([z.array(z.object({
            fileBuffer: z.instanceof(Buffer),
            filename: z.string(),
            mimetype: z.string(),
            size: z.number()
            // ... other validation ...
        })), z.null()])
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.req.user;
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
        }
        let profile_ = null;
        if (opts.input.profile) {
            profile_ = await opts.input.profile[0];
        }
        /* create study */
        const study = await studyCore.createStudy(requester.id, opts.input.name, opts.input.description, profile_);
        return study;
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
        name: z.string(),
        description: z.string(),
        profile: z.union([z.array(z.object({
            fileBuffer: z.instanceof(Buffer),
            filename: z.string(),
            mimetype: z.string(),
            size: z.number()
            // ... other validation ...
        })), z.null()])
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.req.user;
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
        }
        let profile_ = null;
        if (opts.input.profile) {
            profile_ = await opts.input.profile[0];
        }
        const study = await studyCore.editStudy(requester.id, opts.input.studyId, opts.input.name, opts.input.description, profile_);
        return study;
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
        const requester: IUser = opts.req.user;

        /* check privileges */
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
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
        const requester = opts.req.user;

        const decimalRegex = /^[0-9]+(\.[0-9]+)?$/;

        if (!decimalRegex.test(opts.input.dataVersion)) {
            throw new GraphQLError('Version must be a float number.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const response = await studyCore.createDataVersion(requester, opts.input.studyId, opts.input.tag, opts.input.dataVersion);
        return response;
    }),
    setDataversionAsCurrent: baseProcedure.input(z.object({
        studyId: z.string(),
        dataVersionId: z.string()
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.req.user;

        if (requester.type !== enumUserTypes.ADMIN) {
            throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
        }

        const response = await studyCore.setDataVersion(opts.input.studyId, opts.input.dataVersionId);

        return response;
    })
});