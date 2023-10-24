import { ZBase, enumDocTypes } from '@itmat-broker/itmat-types';
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { z } from 'zod';
import { docCore } from '../../graphql/core/docCore';
import { baseProcedure } from '../../log/trpcLogHelper';

const createContext = ({
    req,
    res
}: trpcExpress.CreateExpressContextOptions) => ({}); // no context
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
        docId: z.union([z.string(), z.null()]),
        studyId: z.union([z.string(), z.null()]),
        docTypes: z.union([z.array(z.nativeEnum(enumDocTypes)), z.null()]),
        verbose: z.boolean()
    })).output(z.array(ZDoc)).query(async (opts: any) => {
        return await docCore.getDocs(opts.input.docId, opts.input.studyId, opts.input.docTypes, opts.input.verbose);
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
        description: z.union([z.string(), z.null()]),
        tag: z.union([z.string(), z.null()]),
        studyId: z.union([z.string(), z.null()]),
        priority: z.number(),
        attachments: z.union([z.array(z.object({
            fileBuffer: z.instanceof(Buffer),
            filename: z.string(),
            mimetype: z.string(),
            size: z.number()
            // ... other validation ...
        })), z.null()]),
        contents: z.string()
    })).mutation(async (opts: any) => {
        const requester = opts.ctx.req.user;
        const attachements_: any[] = [];
        if (opts.input.attachments) {
            for (const attachment of opts.input.attachments) {
                attachements_.push(await attachment);
            }
        }
        const doc = await docCore.createDoc(requester.id, opts.input.title, opts.input.studyId, opts.input.description, opts.input.type, opts.input.tag, opts.input.contents, opts.input.priority, opts.input.attachments ? attachements_ : null);
        return doc;
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
        contents: z.union([z.string(), z.null()]),
        title: z.string(),
        tag: z.union([z.string(), z.null()]),
        description: z.union([z.string(), z.null()]),
        priority: z.union([z.number(), z.null()]),
        addAttachments: z.union([z.array(z.object({
            fileBuffer: z.instanceof(Buffer),
            filename: z.string(),
            mimetype: z.string(),
            size: z.number()
            // ... other validation ...
        })), z.null()]),
        removeAttachments: z.union([z.array(z.string()), z.null()])
    })).mutation(async (opts: any) => {
        const requester = opts.req.user;

        const attachements_: any[] = [];
        if (opts.input.addAttachments) {
            for (const attachment of opts.input.addAttachments) {
                attachements_.push(await attachment);
            }
        }
        const doc = await docCore.editDoc(requester.id, opts.input.docId, opts.input.contents, opts.input.title, opts.input.tag, opts.input.description, opts.input.priority, opts.input.addAttachments ? attachements_ : null, opts.input.removeAttachments);
        return doc;
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
        const user = opts.ctc.req.user;
        return await docCore.deleteDoc(user.id, opts.input.docId);
    })
});