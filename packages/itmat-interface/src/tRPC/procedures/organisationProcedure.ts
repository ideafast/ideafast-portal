import { IUser, enumUserTypes, enumTRPCErrorCodes } from '@itmat-broker/itmat-types';
import { TRPCError, inferAsyncReturnType, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { organisationCore } from '../../core/organisationCore';
import { baseProcedure } from '../../log/trpcLogHelper';
import { errorCodes } from '../../graphql/errors';
import fs from 'fs';
const createContext = () => ({}); // no context
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
        orgId: z.optional(z.string())
    })).query(async (opts: any) => {
        return organisationCore.getOrganisations(opts.input.orgId);
    }),
    /**
     * Create an organisation.
     *
     * @param name - The name of the organisation.
     * @param shortname - The shortname of the organisation. Could be null.
     * @param location - The location of the organisation.
     * @param profile - The image of the file. Could be null.
     *
     * @return IOrganisation - The object of the organisation.
     */
    createOrganisation: baseProcedure.input(z.object({
        name: z.string(),
        shortname: z.optional(z.string()),
        location: z.optional(z.array(z.number())),
        profile: z.optional(z.array(z.object({
            path: z.any(),
            filename: z.string(),
            mimetype: z.optional(z.string()),
            size: z.number()
            // ... other validation ...
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
            return await organisationCore.createOrganisation(
                requester.id,
                opts.input.name,
                opts.input.shortname,
                opts.input.location,
                opts.input.profile[0]
            );
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
     * Delete an organisation.
     *
     * @param organisationId - The id of the organisation.
     * @param name - The name of the organisation.
     * @param location - The location of the organisation.
     * @param shortname - The shortname of the organisation.
     * @param profile - The profile of the organisation.
     *
     * @return IOrganisation - The object of the organisation.
     */
    editOrganisation: baseProcedure.input(z.object({
        organisationId: z.string(),
        name: z.optional(z.string()),
        location: z.optional(z.array(z.number())),
        shortname: z.optional(z.string()),
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
        try {
            return await organisationCore.editOrganisation(
                requester.id,
                opts.input.organisationId,
                opts.input.name,
                opts.input.shortname,
                opts.input.location,
                opts.input.profile[0]
            );
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
     * Delete an organisation.
     *
     * @param organisationId - The id of the organisation.
     *
     * @return IOrganisation - The object of the organisation.
     */
    deleteOrganisation: baseProcedure.input(z.object({
        organisationId: z.string()
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.ctx.req?.user ?? opts.ctx.user;
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }
        return await organisationCore.deleteOrganisation(requester.id, opts.input.organisationId);
    })
});