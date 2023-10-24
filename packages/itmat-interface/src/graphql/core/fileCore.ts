import { db } from '../../database/database';
import { GraphQLError } from 'graphql';
import { enumConfigType, IFile, defaultSettings, enumFileTypes, enumFileCategories, IGenericResponse } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../errors';
import { FileUpload } from 'graphql-upload-minimal';
import crypto from 'crypto';
import { objStore } from '../../objStore/objStore';
import { makeGenericReponse } from '../responses';
import { use } from 'passport';

export class FileCore {
    public async uploadFile(requester: string, studyId: string | null, userId: string | null, fileUpload: any, description: string | null, fileType: enumFileTypes, fileCategory: enumFileCategories, properties: Record<string, any> | null): Promise<IFile> {
        /**
         * Upload a file to storage.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study. Could be null for non-study files.
         * @param userId - The id of the user.
         * @param fileUpload - The file to upload.
         * @param description - The description of the file.
         * @param fileType - The type of the file.
         * @param fileCategory - The category of the file.
         * @param properties - The properties of the file. Note if the data is attached to a field, the fieldproperties will be used.
         *
         * @return IFile - The object of IFile.
         */

        // if (studyId) {
        //     const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        //     if (!study) {
        //         throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        //     }
        // }
        const file = fileUpload;
        // fetch the config file. study file or user file or system file
        let fileConfig: any;
        let userRepoRemainingSpace = 0;
        let fileSizeLimit: number;
        if (fileCategory === enumFileCategories.STUDY_DATA_FILE || fileCategory === enumFileCategories.STUDY_PROFILE_FILE) {
            // study file config
            fileConfig = await db.collections!.configs_collection.findOne({ type: enumConfigType.STUDYCONFIG, key: studyId });
            if (!fileConfig) {
                fileConfig = defaultSettings.studyConfig;
            }
            if (fileCategory === enumFileCategories.STUDY_PROFILE_FILE) {
                fileSizeLimit = fileConfig.defaultMaximumProfileSize;
            } else {
                fileSizeLimit = fileConfig.defaultMaximumFileSize;
            }
        } else if (fileCategory === enumFileCategories.USER_REPO_FILE || fileCategory === enumFileCategories.USER_PROFILE_FILE) {
            // user file config
            fileConfig = await db.collections!.configs_collection.findOne({ type: enumConfigType.USERCONFIG, key: requester });
            if (!fileConfig) {
                fileConfig = defaultSettings.userConfig;
            }
            if (fileCategory === enumFileCategories.USER_PROFILE_FILE) {
                fileSizeLimit = fileConfig.defaultMaximumProfileSize;
            } else {
                const totalSize: number = (await db.collections!.files_collection.aggregate([{
                    $match: { 'userId': requester, 'life.deletedTime': null }
                }, {
                    $group: { _id: '$userId', totalSize: { $sum: '$fileSize' } }
                }]) as any).totalSize;
                userRepoRemainingSpace = fileConfig.defaultMaximumFileRepoSize - totalSize;
                fileSizeLimit = Math.max(fileConfig.defaultMaximumFileSize, userRepoRemainingSpace);
            }
        } else if (fileCategory === enumFileCategories.ORGANISATION_PROFILE_FILE) {
            fileConfig = await db.collections!.configs_collection.findOne({ type: enumConfigType.ORGANISATIONCONFIG, key: null });
            if (!fileConfig) {
                fileConfig = defaultSettings.organisationConfig;
            }
        } else if (fileCategory === enumFileCategories.DOC_FILE) {
            fileConfig = await db.collections!.configs_collection.findOne({ type: enumConfigType.DOCCONFIG, key: null });
            if (!fileConfig) {
                fileConfig = defaultSettings.docConfig;
            }
        } else if (fileCategory === enumFileCategories.CACHE) {
            fileConfig = await db.collections!.configs_collection.findOne({ type: enumConfigType.CACHECONFIG, key: null });
            if (!fileConfig) {
                fileConfig = defaultSettings.cacheConfig;
            }
        } else {
            throw new GraphQLError('Config file missing.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }
        return new Promise<IFile>((resolve, reject) => {
            (async () => {
                try {
                    const buffer = fileUpload.fileBuffer; // Directly access the buffer from your fileUpload object.
                    const fileUri = uuid();
                    const hash = crypto.createHash('sha256');

                    // Validate against the file size limit
                    if (buffer.length > fileSizeLimit) {
                        reject(new GraphQLError('File should not be larger than 8GB', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } }));
                        return;
                    }

                    hash.update(buffer); // Update the hash directly using the buffer.

                    // Assuming objStore.uploadFile can accept a buffer.
                    await objStore.uploadFile(buffer, studyId ? studyId : fileConfig.defaultFileBucketId, fileUri);

                    const hashString = hash.digest('hex');

                    const fileEntry: IFile = {
                        id: uuid(),
                        studyId: studyId,
                        userId: userId,
                        fileName: fileUpload.filename, // Access filename directly from the fileUpload object.
                        fileSize: buffer.length, // Use buffer's length for file size.
                        description: description,
                        uri: fileUri,
                        hash: hashString,
                        fileType: fileType,
                        fileCategory: fileCategory,
                        properties: properties,
                        sharedUsers: [],
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