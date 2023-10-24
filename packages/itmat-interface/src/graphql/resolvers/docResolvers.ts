import { ApolloServerErrorCode } from '@apollo/server/errors';
import { GraphQLError } from 'graphql';
import bcrypt from 'bcrypt';
import { mailer } from '../../emailer/emailer';
import { IUser, IGenericResponse, IResetPasswordRequest, enumUserTypes, IOrganisation, enumConfigType, IConfig, enumDocTypes, IDoc } from '@itmat-broker/itmat-types';
import { Logger } from '@itmat-broker/itmat-commons';
import { v4 as uuid } from 'uuid';
import config from '../../utils/configManager';
import { userCore } from '../core/userCore';
import { errorCodes } from '../errors';
import { makeGenericReponse } from '../responses';
import QRCode from 'qrcode';
import tmp from 'tmp';
import { decryptEmail, encryptEmail, makeAESIv, makeAESKeySalt } from '../../encryption/aes';
import * as mfa from '../../utils/mfa';
import { configCore } from '../core/configCore';
import { FileUpload } from 'graphql-upload-minimal';
import { docCore } from '../core/docCore';

export const docResolvers = {
    Query: {
        getDocs: async (__unused__parent: Record<string, unknown>, { docId, studyId, docTypes, verbose }: { docId: string | null, studyId: string | null, docTypes: enumDocTypes[] | null, verbose: boolean }): Promise<Partial<IDoc>[]> => {
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

            return await docCore.getDocs(docId, studyId, docTypes, verbose);
        }
    },
    Mutation: {
        createDoc: async (__unused__parent: Record<string, unknown>, { title, type, description, tag, studyId, priority, attachments, contents }: { title: string, type: enumDocTypes, description: string | null, tag: string | null, studyId: string | null, priority: number, attachments: any | null, contents: string }, context: any): Promise<Partial<IDoc>> => {
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

            const requester = context.req.user;
            const attachements_: any[] = [];
            if (attachments) {
                for (const attachment of attachments) {
                    attachements_.push(await attachment);
                }
            }
            const doc = await docCore.createDoc(requester.id, title, studyId, description, type, tag, contents, priority, attachments ? attachements_ : null);
            return doc;
        },
        editDoc: async (__unused__parent: Record<string, unknown>, { docId, contents, title, tag, description, priority, addAttachments, removeAttachments }: { docId: string, contents: string | null, title: string, tag: string | null, description: string | null, priority: number | null, addAttachments: any | null, removeAttachments: string[] | null }, context: any): Promise<Partial<IDoc>> => {
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
            const requester = context.req.user;

            const attachements_: any[] = [];
            if (addAttachments) {
                for (const attachment of addAttachments) {
                    attachements_.push(await attachment);
                }
            }
            const doc = await docCore.editDoc(requester.id, docId, contents, title, tag, description, priority, addAttachments ? attachements_ : null, removeAttachments);
            return doc;
        },
        deleteDoc: async (__unused__parent: Record<string, unknown>, { docId }: { docId: string }, context: any): Promise<IGenericResponse> => {
            /**
             * Delete a doc.
             *
             * @param docId - The id of the doc.
             *
             * @return IGenericResponse
             */

            const requester = context.req.user;

            const response = await docCore.deleteDoc(requester.id, docId);
            return response;
        }

    }
};