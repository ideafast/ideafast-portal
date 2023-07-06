import { db } from '../../database/database';
import { GraphQLError } from 'graphql';
import { enumConfigType, IFile, defaultSettings, enumFileTypes, enumFileCategories, IGenericResponse } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../errors';
import { FileUpload } from 'graphql-upload-minimal';
import crypto from 'crypto';
import { objStore } from '../../objStore/objStore';
import { makeGenericReponse } from '../responses';

export class FileCore {
    public async uploadFile(requester: string, studyId: string | null, fileUpload: Promise<FileUpload>, description: Record<string, any>, fileType: enumFileTypes, fileCategory: enumFileCategories): Promise<IFile> {
        /**
         * Upload a file to storage.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study. Could be null for non-study files.
         * @param isSystemFile - Whether the file is a system file.
         * @param fileName - The name of the file.
         * @param file - The file to upload.
         * @param description - The description of the file.
         * @param fileType - The type of the file.
         * @param fileCategory - The category of the file.
         *
         * @return IFile - The object of IFile.
         */

        if (studyId) {
            const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
            if (!study) {
                throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        }
        const file = await fileUpload;

        // fetch the config file. study file or user file or system file
        let fileConfig: any;
        if (fileCategory === enumFileCategories.SYSTEMFILE) {
            // system file config
            fileConfig = defaultSettings.systemConfig;
        } else if (fileCategory === enumFileCategories.STUDYDATAFILE) {
            // study file config
            fileConfig = await db.collections!.configs_collection.findOne({ type: enumConfigType.STUDYCONFIG, key: studyId });
            if (!fileConfig) {
                fileConfig = defaultSettings.studyConfig;
            }
        } else if (fileCategory === enumFileCategories.USERFILE) {
            // user file config
            fileConfig = await db.collections!.configs_collection.findOne({ type: enumConfigType.USERCONFIG, key: requester });
            if (!fileConfig) {
                fileConfig = defaultSettings.userConfig;
            }
        }

        let userRepoRemainingSpace = 0;
        if (fileConfig.type === enumConfigType.USERCONFIG) {
            const totalSize: number = (await db.collections!.files_collection.aggregate([{
                $match: { 'userId': requester, 'life.deletedTime': null }
            }, {
                $group: { _id: '$userId', totalSize: { $sum: '$fileSize' } }
            }]) as any).totalSize;
            userRepoRemainingSpace = fileConfig.defaultMaximumFileRepoSize - totalSize;
        }

        const fileSizeLimit: number = fileConfig === enumConfigType.USERCONFIG ? Math.max(fileConfig.defaultMaximumFileSize, userRepoRemainingSpace) : fileConfig.defaultMaximumFileSize;

        return new Promise<IFile>((resolve, reject) => {
            (async () => {
                try {
                    const stream = file.createReadStream();
                    const fileUri = uuid();
                    const hash = crypto.createHash('sha256');
                    let readBytes = 0;

                    stream.pause();

                    /* if the client cancelled the request mid-stream it will throw an error */
                    stream.on('error', (e) => {
                        reject(new GraphQLError('Upload resolver file stream failure', { extensions: { code: errorCodes.FILE_STREAM_ERROR, error: e } }));
                        return;
                    });

                    stream.on('data', (chunk) => {
                        readBytes += chunk.length;
                        if (readBytes > fileSizeLimit) {
                            stream.destroy();
                            reject(new GraphQLError('File should not be larger than 8GB', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } }));
                            return;
                        }
                        hash.update(chunk);
                    });

                    await objStore.uploadFile(stream, studyId ? studyId : fileConfig.defaultFileBucketId, fileUri);

                    const hashString = hash.digest('hex');
                    const fileEntry: IFile = {
                        id: uuid(),
                        studyId: studyId,
                        userId: fileCategory === enumFileCategories.USERFILE ? requester : null,
                        fileName: file.filename,
                        fileSize: readBytes,
                        description: description,
                        uri: fileUri,
                        hash: hashString,
                        fileType: fileType,
                        fileCategory: fileCategory,
                        sharedUsers: fileCategory === enumFileCategories.USERFILE ? [] : null,
                        life: {
                            createdTime: Date.now(),
                            createdUser: requester,
                            deletedTime: null,
                            deletedUser: null
                        },
                        metadata: {}
                    };
                    const insertResult = await db.collections!.files_collection.insertOne(fileEntry as IFile);
                    if (insertResult.acknowledged) {
                        resolve(fileEntry as IFile);
                    } else {
                        throw new GraphQLError(errorCodes.DATABASE_ERROR);
                    }

                } catch (error) {
                    reject(new GraphQLError('General upload error', { extensions: { code: errorCodes.UNQUALIFIED_ERROR, error } }));
                }
            })();
        });
    }

    public async deleteFile(requester: string, fileId: string): Promise<IGenericResponse> {
        /**
         * Delete a file.
         *
         * @param requester - The id of the requester.
         * @param fileId - The id of the file.
         *
         * @return IGenericResponse - The object of IGenericResponse.
         */
        const file = await db.collections!.files_collection.findOne({ 'id': fileId, 'life.deletedTime': null });
        if (!file) {
            throw new GraphQLError('File does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }
        try {
            await db.collections!.files_collection.findOneAndUpdate({ id: fileId }, { $set: { 'life.deletedTime': Date.now().valueOf(), 'life.deletedUser': requester } });
            return makeGenericReponse(fileId, undefined, undefined, 'File has been deleted.');
        } catch {
            throw new GraphQLError('Database error.', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }
}

export const fileCore = Object.freeze(new FileCore());
