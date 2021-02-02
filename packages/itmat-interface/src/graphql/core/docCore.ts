import { db } from '../../database/database';
import { ApolloError } from 'apollo-server-core';
import { DOC_TYPE, IDocWithoutData, IDoc, DOC_STATUS, attachment} from 'itmat-commons';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../errors';

export class DocCore {
    public async createDoc(title: string, docType: DOC_TYPE, data: string, user: string, attachments: attachment[]) {
        if (title === '' || data === '') {
            throw new ApolloError('Fields can not be empty');
        }
        const time = Date.now();
        const entry: IDoc = {
            id: uuid(),
            title: title,
            docType: docType,
            data: data,
            createdAt: time,
            lastModifiedAt: time,
            lastModifiedBy: user,
            status: DOC_STATUS.DEACTIVATED,
            attachments: attachments
        };
        const result = await db.collections!.docs_collection.insertOne(entry);
        if (result.result.ok === 1) {
            const cleared: IDocWithoutData = {
                id: entry.id,
                title: entry.title,
                docType: entry.docType,
                createdAt: entry.createdAt,
                lastModifiedAt: entry.lastModifiedAt,
                lastModifiedBy: entry.lastModifiedBy,
                status: entry.status
            };
            return cleared;
        } else {
            throw new ApolloError('Database error', errorCodes.DATABASE_ERROR);
        }
    }

    public async editDoc(id: string, title: string, data: string, user: string, status: DOC_STATUS, attachments: attachment[]) {
        if (title === '' || data === '') {
            throw new ApolloError('Fields can not be empty');
        }
        const time = Date.now();
        const fieldsToUpdate = {
            data: data,
            title: title,
            lastModifiedAt: time,
            lastModifiedBy: user,
            status: status,
            attachments: attachments
        };
        const result = await db.collections!.docs_collection.findOneAndUpdate({ id }, { $set: fieldsToUpdate }, { returnOriginal: false });
        if (result.ok === 1) {
            return fieldsToUpdate;
        } else {
            throw new ApolloError('Database error', errorCodes.DATABASE_ERROR);
        }
    }
}

export const docCore = Object.freeze(new DocCore());
