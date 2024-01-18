import { Request, Response } from 'express';
import { db } from '../database/database';
import { objStore } from '../objStore/objStore';
import { permissionCore } from '../core/permissionCore';
import { enumDocTypes, enumFileCategories, IUser } from '@itmat-broker/itmat-types';
import jwt from 'jsonwebtoken';
import { userRetrieval } from '../authentication/pubkeyAuthentication';
import { ApolloServerErrorCode } from '@apollo/server/errors';
import { GraphQLError } from 'graphql';

export const fileDownloadController = async (req: Request, res: Response): Promise<void> => {
    const requester = req.user as IUser;
    const requestedFile = req.params.fileId;
    const token = req.headers.authorization || '';
    let associatedUser = requester;
    const file = await db.collections!.files_collection.findOne({ 'id': requestedFile, 'life.deletedTime': null })!;
    if (!file) {
        res.status(404).json({ error: 'File not found or you do not have the necessary permission.' });
        return;
    }

    // if the file is HOMEPAGE file, skip permission check
    const doc = await db.collections!.docs_collection.find({ 'attachmentFileIds': requestedFile, 'life.deletedTime': null, 'type': enumDocTypes.HOMEPAGE });
    if (!doc) {

        if ((token !== '') && (req.user === undefined)) {
            // get the decoded payload ignoring signature, no symmetric secret or asymmetric key needed
            const decodedPayload = jwt.decode(token);
            // obtain the public-key of the robot user in the JWT payload
            const pubkey = (decodedPayload as any).publicKey;
            // verify the JWT
            jwt.verify(token, pubkey, function (error: any) {
                if (error) {
                    throw new GraphQLError('JWT verification failed.', { extensions: { code: ApolloServerErrorCode.BAD_USER_INPUT, error } });
                }
            });
            associatedUser = await userRetrieval(pubkey);
        } else if (!requester) {
            res.status(403).json({ error: 'Please log in.' });
            return;
        }
    }
    try {
        let bucket = '';
        if (file.fileCategory === enumFileCategories.DOC_FILE) {
            bucket = 'doc';
        } else if (file.studyId && (file.fileCategory === enumFileCategories.STUDY_DATA_FILE || file.fileCategory === enumFileCategories.STUDY_PROFILE_FILE)) {
            bucket = file.studyId;
        } else if (file.fileCategory === enumFileCategories.USER_REPO_FILE || file.fileCategory === enumFileCategories.USER_PROFILE_FILE) {
            bucket = 'user';
        } else if (file.fileCategory === enumFileCategories.ORGANISATION_PROFILE_FILE) {
            bucket = 'organisation';
        }
        const stream = await objStore.downloadFile(bucket, file.uri);
        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Type', 'application/download');
        res.set('Content-Disposition', `attachment; filename="${file.fileName}"`);
        stream.pipe(res, { end: true });
        return;
    } catch (e) {
        res.status(500).json(e);
        return;
    }
};
