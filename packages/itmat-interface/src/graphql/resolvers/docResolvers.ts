import { IDoc, IDocWithoutData, Models, userTypes, DOC_STATUS } from 'itmat-commons';
import { docCore } from '../core/docCore';
import {ApolloError} from 'apollo-server-errors';
import {errorCodes} from '../errors';
import {db} from '../../database/database';

export const docResolvers = {
    Query: {
        getDocs: async (__unused_parent: Record<string, unknown>, args: any, context: any): Promise<IDoc[]> => {
            const requester: Models.UserModels.IUser = context.req.user;
            const queryObj = {};
            for (const prop in args) {
                if (args[prop] !== undefined) {
                    if (prop === 'docId') {
                        queryObj['id'] = args[prop];
                    } else {
                        queryObj[prop] = args[prop];
                    }
                }
            }
            /* return all docs to admin but only activated docs to general users */
            if (requester.type !== userTypes.ADMIN) {
                queryObj['status'] = DOC_STATUS.ACTIVATED;
            }
            const docData = await db.collections!.docs_collection.find<IDoc>(queryObj, {projection: {_id: 0}}).sort('createdAt', -1).toArray();
            return docData;
        }
    },
    Mutation: {
        createDoc: async (__unused__parent: Record<string, unknown>, args: any, context: any): Promise<IDocWithoutData> => {
            const requester: Models.UserModels.IUser = context.req.user;
            /* only admin can access this field */
            if (requester.type !== userTypes.ADMIN) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }
            const result = await docCore.createDoc(
                args.title,
                args.docType,
                args.data,
                args.user,
                args.attachments
            );
            return result;
        },
        editDoc: async (__unused__parent: Record<string, unknown>, args: any, context: any): Promise<any> => {
            const requester: Models.UserModels.IUser = context.req.user;
            /* only admin can access this field */
            if (requester.type !== userTypes.ADMIN) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }
            const result = await docCore.editDoc(
                args.id,
                args.docType,
                args.title,
                args.data,
                args.user,
                args.status,
                args.attachments
            );
            return result;
        },
    }
};
