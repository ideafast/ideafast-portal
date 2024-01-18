import { IField, enumDataTypes, IUser, IDoc, enumDocTypes, enumFileTypes, enumFileCategories, IFile, IGenericResponse } from '@itmat-broker/itmat-types';
import { db } from '../database/database';
import { v4 as uuid } from 'uuid';
import { FileUpload } from 'graphql-upload-minimal';
import { fileCore } from './fileCore';
import { makeGenericReponse } from '../graphql/responses';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../graphql/errors';
import { TRPCError } from '@trpc/server';
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';

export class DocCore {
    public async getDocs(studyId: string | null, verbose: boolean, docId?: string, type?: enumDocTypes[]): Promise<IDoc[]> {
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
        const docs = await db.collections!.docs_collection.find({
            'id': docId ? docId : { $in: [new RegExp('^.*$')] },
            'studyId': studyId,
            'type': { $in: type ?? [new RegExp('^.*$')] },
            'life.deletedTime': null
        }).toArray();

        if (!verbose) {
            const nonVerbose: Partial<IDoc>[] = [...docs];
            for (const item of nonVerbose) {
                if ('contents' in item) {
                    item.contents = '';
                }
            }
        }

        // retrive the attachemnts if possible
        for (const doc of docs) {
            if (doc.attachmentFileIds) {
                doc.metadata = { docs: await db.collections!.files_collection.find({ id: { $in: doc.attachmentFileIds } }).toArray() };
            }
        }

        return docs as IDoc[];
    }

    public async createDoc(requester: string, title: string, type: enumDocTypes, studyId?: string, description?: string, tag?: string, contents?: string, priority?: number, attachments?: any): Promise<IDoc> {
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

        if (studyId) {
            const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
            if (!study) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Study does not exist.'
                });
            }
        }

        const doc: IDoc = {
            id: uuid(),
            title: title,
            studyId: studyId ?? null,
            type: type,
            tag: tag,
            description: description,
            contents: contents,
            priority: priority ?? 0,
            attachmentFileIds: [],
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };
        const attachmentsFileIds: string[] = [];
        if (attachments) {
            for (const attachment of attachments) {
                if (!Object.keys(enumFileTypes).includes((attachment?.filename?.split('.').pop() as string).toUpperCase())) {
                    throw new GraphQLError('Profile file does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
                }

                const file = await fileCore.uploadFile(requester, null, null, attachment, null, enumFileTypes[(attachment.filename.split('.').pop() as string).toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.DOC_FILE, []);
                attachmentsFileIds.push(file.id);
            }
            doc.attachmentFileIds = attachmentsFileIds;
        }
        await db.collections!.docs_collection.insertOne(doc);

        return doc;
    }

    public async editDoc(requester: string, docId: string, contents?: string, title?: string, tag?: string, description?: string, priority?: number, addAttachments?: any, removeAttachments?: string[]): Promise<Partial<IDoc>> {
        /**
         * Edit a doc.
         *
         * @param requester - The id of the requester.
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

        const doc = await db.collections!.docs_collection.findOne({ 'id': docId, 'life.deletedTime': null });
        if (!doc) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Document does not exist.'
            });
        }

        let attachmentsFileIds: string[] = doc.attachmentFileIds ? [...doc.attachmentFileIds] : [];
        if (addAttachments) {
            for (const attachment of addAttachments) {
                if (!Object.keys(enumFileTypes).includes((attachment.filename?.split('.').pop() as string).toUpperCase())) {
                    throw new GraphQLError('Profile file does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
                }

                const file = await fileCore.uploadFile(requester, null, null, attachment, null, enumFileTypes[(attachment.filename.split('.').pop() as string).toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.DOC_FILE, []);
                attachmentsFileIds.push(file.id);
            }
        }

        if (removeAttachments) {
            for (const attachement of removeAttachments) {
                attachmentsFileIds = attachmentsFileIds.filter(el => el !== attachement);
            }
        }

        const res = await db.collections!.docs_collection.findOneAndUpdate({ id: docId }, {
            $set: {
                title: title ?? doc.title,
                contents: contents ?? doc.contents,
                tag: tag ?? doc.tag,
                description: description ?? doc.description,
                priority: priority ?? doc.priority,
                attachmentFileIds: attachmentsFileIds
            }
        }, {
            returnDocument: 'after'
        });

        if (res.ok && res.value) {
            return res.value;
        } else {
            throw new GraphQLError(`${JSON.stringify(res.lastErrorObject)}`, { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async deleteDoc(requeser: string, docId: string): Promise<IGenericResponse> {
        /**
         * Delete a doc.
         *
         * @param requeser - The id of the requester.
         * @param docId - The id of the doc.
         */

        await db.collections!.docs_collection.findOneAndUpdate({ id: docId }, {
            $set: {
                'life.deletedTime': Date.now(),
                'life.deletedUser': requeser
            }
        });
        return makeGenericReponse(docId, true, undefined, `Document ${docId} has been deleted.`);
    }
}

export const docCore = Object.freeze(new DocCore());
