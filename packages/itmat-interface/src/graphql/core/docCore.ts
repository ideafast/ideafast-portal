import { IField, enumDataTypes, IUser, IDoc, enumDocTypes, enumFileTypes, enumFileCategories, IFile } from '@itmat-broker/itmat-types';
import { db } from '../../database/database';
import { v4 as uuid } from 'uuid';
import { FileUpload } from 'graphql-upload-minimal';
import { fileCore } from './fileCore';
import { makeGenericReponse } from '../responses';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../errors';

export class DocCore {
    public async getDocs(id: string[] | null, type: enumDocTypes[] | null): Promise<Partial<IDoc>[]> {
        /**
         * Get the docs.
         *
         * @param id - The ids of the doc.
         * @param type - The types of the doc
         *
         * @return Partial<IDoc>[]
         */

        const docs = await db.collections!.docs_collection.find({
            'id': { $in: id ?? [new RegExp('^.*$')] },
            'type': { $in: type ?? [new RegExp('^.*$')] },
            'life.deletedTime': null
        }).toArray();

        return docs as Partial<IDoc>[];
    }

    public async createDoc(requester: string, title: string, type: enumDocTypes, tag: string, contents: Promise<FileUpload>, priority: number | null, attachments: Promise<FileUpload>[]): Promise<IDoc> {
        /**
         * Create a doc.
         *
         * @param requester - The id of the requester.
         * @param title - The title of the doc.
         * @param type - The type of the doc.
         * @param tag - The tag of the doc.
         * @param contents - The contents of the doc.
         * @param priority - The priority of the doc. By default is 0.
         * @param attachments - The attachments of the doc.
         *
         * @return IDoc
         */

        const session = db.client!.startSession();
        session.startTransaction();
        try {
            const doc: IDoc = {
                id: uuid(),
                title: title,
                type: type,
                tag: tag,
                fileId: '',
                priority: priority ?? 0,
                attachments: [],
                life: {
                    createdTime: Date.now(),
                    createdUser: requester,
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            };

            const contentFile = await fileCore.uploadFile(requester, null, contents, {}, enumFileTypes.MARKDOWN, enumFileCategories.DOCFILE);
            const attachmentsFileIds: string[] = [];
            for (const attachment of attachments) {
                const file = await fileCore.uploadFile(requester, null, attachment, {}, enumFileTypes.MARKDOWN, enumFileCategories.DOCFILE);
                attachmentsFileIds.push(file.id);
            }
            doc.fileId = contentFile.id;
            doc.attachments = attachmentsFileIds;
            await db.collections!.docs_collection.insertOne(doc);

            await session.commitTransaction();
            session.endSession();
            return doc;
        } catch (error) {
            // If an error occurred, abort the whole transaction and
            // undo any changes that might have happened
            await session.abortTransaction();
            session.endSession();
            throw new GraphQLError(`${JSON.stringify(error)}`, { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }
}

export const docCore = Object.freeze(new DocCore());
