import { ZBase, enumDocTypes, enumUserTypes } from '@itmat-broker/itmat-types';
import { TRPCError, inferAsyncReturnType, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { docCore } from '../../core/docCore';
import { baseProcedure } from '../../log/trpcLogHelper';
import fs from 'fs';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';
import { errorCodes } from '../../graphql/errors';
const createContext = () => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const ZDoc = z.object({
    title: z.string(),
    type: z.nativeEnum(enumDocTypes),
    description: z.union([z.string(), z.null()]),
    tag: z.union([z.string(), z.null()]),
    studyId: z.union([z.string(), z.null()]),
    contents: z.union([z.string(), z.null()]),
    priority: z.number(),
    attachmentFileIds: z.array(z.string())
}).merge(ZBase);

export const docRouter = t.router({
    /**
     * Get the docs.
     *
     * @param docId - The id of the doc.
     * @param studyId - The id of the study or null.
     * @param docType - The types of the doc
     * @param verbose - Whether to return the contents.
     *
     * @return Partial<IDoc>[]
     */
    getDocs: baseProcedure.input(z.object({
        docId: z.optional(z.string()),
        studyId: z.union([z.string(), z.null()]),
        docTypes: z.optional(z.array(z.nativeEnum(enumDocTypes))),
        verbose: z.boolean()
    })).query(async (opts: any) => {
        return await docCore.getDocs(
            opts.input.studyId,
            opts.input.verbose,
            opts.input.docId,
            opts.input.docTypes
        );
    }),
    /**
     * Create a doc.
     *
     * @param requester - The id of the requester.
     * @param title - The title of the doc.
     * @param studyId - The id of the study.
     * @param description - The description of the study.
     * @param type - The type of the doc.
     * @param tag - The tag of the doc.
     * @param contents - The contents of the doc.
     * @param priority - The priority of the doc. By default is 0.
     * @param attachments - The attachments of the doc.
     *
     * @return IDoc
     */
    createDoc: baseProcedure.input(z.object({
        title: z.string(),
        type: z.nativeEnum(enumDocTypes),
        description: z.optional(z.string()),
        tag: z.optional(z.string()),
        studyId: z.optional(z.string()),
        priority: z.optional(z.number()),
        attachments: z.optional(z.array(z.object({
            path: z.any(),
            filename: z.string(),
            mimetype: z.optional(z.string()),
            size: z.number()
            // ... other validation ...
        }))),
        contents: z.optional(z.string())
    })).mutation(async (opts: any) => {
        const requester = opts.ctx.req?.user ?? opts.ctx.user;
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }

        try {
            const doc = await docCore.createDoc(
                requester.id,
                opts.input.title,
                opts.input.type,
                opts.input.studyId,
                opts.input.description,
                opts.input.tag,
                opts.input.contents,
                opts.input.priority,
                opts.input.attachments);
            return doc;
        } finally {
            // Cleanup: Delete the temporary file from the disk
            if (opts.input.attachments) {
                for (let i = 0; i < opts.input.attachments.length; i++) {
                    const filePath = opts.input.attachments[i].path;
                    if (fs.existsSync(filePath)) {
                        fs.unlink(filePath, (err) => {
                            if (err) {
                                console.error('Error deleting temporary file:', filePath, err);
                            }
                        });
                    }
                }
            }
        }
    }),
    /**
         * Edit a doc.
         *
         * @param docId - The id of the doc.
         * @param contents - The contents of the doc.
         * @param title - The title of the doc.
         * @param tag - The tag of the doc.
         * @param description - The description of the doc.
         * @param priority - The priority of the doc.
         * @param addAttachments - Attachments to add to the doc.
         * @param removeAttachments - Attachments to remove from the doc.
         *
         * @return IDoc
         */
    editDoc: baseProcedure.input(z.object({
        docId: z.string(),
        contents: z.optional(z.string()),
        title: z.optional(z.string()),
        tag: z.optional(z.string()),
        description: z.union([z.string(), z.null()]),
        priority: z.optional(z.number()),
        addAttachments: z.optional(z.array(z.object({
            path: z.any(),
            filename: z.string(),
            mimetype: z.optional(z.string()),
            size: z.number()
            // ... other validation ...
        }))),
        removeAttachments: z.optional(z.array(z.string()))
    })).mutation(async (opts: any) => {
        const requester = opts.ctx.req?.user ?? opts.ctx.user;
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }
        try {
            const doc = await docCore.editDoc(requester.id, opts.input.docId, opts.input.contents, opts.input.title, opts.input.tag, opts.input.description, opts.input.priority, opts.input.addAttachments, opts.input.removeAttachments);
            return doc;
        } finally {
            // Cleanup: Delete the temporary file from the disk
            if (opts.input.attachments) {
                for (let i = 0; i < opts.input.attachments.length; i++) {
                    const filePath = opts.input.attachments[i].path;
                    if (fs.existsSync(filePath)) {
                        fs.unlink(filePath, (err) => {
                            if (err) {
                                console.error('Error deleting temporary file:', filePath, err);
                            }
                        });
                    }
                }
            }
        }
    }),
    /**
             * Delete a doc.
             *
             * @param docId - The id of the doc.
             *
             * @return IGenericResponse
             */
    deleteDoc: baseProcedure.input(z.object({
        docId: z.string()
    })).mutation(async (opts: any) => {
        const requester = opts.ctx.req?.user ?? opts.ctx.user;
        if (requester.type !== enumUserTypes.ADMIN) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: errorCodes.NO_PERMISSION_ERROR
            });
        }
        return await docCore.deleteDoc(requester.id, opts.input.docId);
    })
});