import { db } from '../database/database';
import { GraphQLError } from 'graphql';
import { enumConfigType, IFile, defaultSettings, enumFileTypes, enumFileCategories, IGenericResponse, IStudyConfig } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../graphql/errors';
import { FileUpload } from 'graphql-upload-minimal';
import crypto, { BinaryLike } from 'crypto';
import { objStore } from '../objStore/objStore';
import { makeGenericReponse } from '../graphql/responses';
import { use } from 'passport';
import { config } from 'process';
import { configCore } from './configCore';
import { studyCore } from './studyCore';
import { TRPCError } from '@trpc/server';
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';
import { IUser } from 'webdav-server';
import fs from 'fs';

export class FileCore {
    public async uploadFile(requester: string, studyId: string | null, userId: string | null, fileUpload: any, description: string | undefined, fileType: enumFileTypes, fileCategory: enumFileCategories, properties: Record<string, any> | null): Promise<IFile> {
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
        let study: any;
        if (studyId) {
            study = (await studyCore.getStudies(studyId))[0];
            if (!study) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Study does not exist.'
                });
            }
        }
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
        if (fileConfig.properties) {
            fileConfig = fileConfig.properties;
        }

        const fileUri = uuid();
        const hash = crypto.createHash('sha256');
        const filePath = fileUpload.path;

        // Create a read stream for the file
        const fileStream = fs.createReadStream(filePath);

        return new Promise<IFile>((resolve, reject) => {
            let fileSize = 0;

            fileStream.on('data', (chunk: BinaryLike) => {
                hash.update(chunk);
                fileSize += (chunk as Buffer).length; // Asserting the chunk as Buffer for length property
            });

            fileStream.on('end', async () => {
                try {
                    // Check file size limit
                    if (fileSize > fileSizeLimit) {
                        throw new Error('File size exceeds the limit.');
                    }

                    const hashString = hash.digest('hex');

                    // Create a new read stream for the file upload
                    const uploadStream = fs.createReadStream(filePath);

                    // Upload the file to the storage
                    await objStore.uploadFile(uploadStream, studyId ? studyId : fileConfig.defaultFileBucketId, fileUri);

                    const path: any[] = [];
                    if (studyId) {
                        const pathLabels = fileConfig.defaultFileDirectoryStructure.pathLabels;
                        path.push(study.name);
                        if (properties) {
                            for (let i = 0; i < pathLabels.length; i++) {
                                if (properties[pathLabels[i]]) {
                                    path.push(properties[pathLabels[i]]);
                                }
                            }
                        }
                    }
                    const fileEntry: IFile = {
                        id: uuid(),
                        studyId: studyId,
                        userId: userId,
                        fileName: fileUpload.filename, // Access filename directly from the fileUpload object.
                        fileSize: fileSize, // Use buffer's length for file size.
                        description: description,
                        uri: fileUri,
                        path: path,
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
                        throw new TRPCError({
                            code: enumTRPCErrorCodes.BAD_REQUEST,
                            message: errorCodes.DATABASE_ERROR
                        });
                    }

                } catch (error) {
                    console.error('Error during file processing:', error);
                    reject(new TRPCError({
                        code: enumTRPCErrorCodes.BAD_REQUEST,
                        message: 'Error during file upload.'
                    }));
                } finally {
                    // Cleanup: Delete the temporary file from the disk
                    if (fs.existsSync(filePath)) {
                        fs.unlink(filePath, (err) => {
                            if (err) {
                                console.error('Error deleting temporary file:', filePath, err);
                            }
                        });
                    }
                }
            });

            fileStream.on('error', (err) => {
                console.error('Error reading file stream:', err);
                reject(new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Error reading file stream.'
                }));
            });
        });

        // return new Promise<IFile>((resolve, reject) => {
        //     (async () => {
        //         try {
        //             const buffer = fileUpload.fileBuffer; // Directly access the buffer from your fileUpload object.
        //             const fileUri = uuid();
        //             const hash = crypto.createHash('sha256');

        //             // Validate against the file size limit
        //             if (buffer.length > fileSizeLimit) {
        //                 reject(new GraphQLError('File should not be larger than 8GB', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } }));
        //                 return;
        //             }

        //             hash.update(buffer); // Update the hash directly using the buffer.

        //             // Assuming objStore.uploadFile can accept a buffer.
        //             await objStore.uploadFile(buffer, studyId ? studyId : fileConfig.defaultFileBucketId, fileUri);

        //             const hashString = hash.digest('hex');
        //             const path: any[] = [];
        //             if (studyId) {
        //                 const pathLabels = fileConfig.defaultFileDirectoryStructure.pathLabels;
        //                 path.push(study.name);
        //                 if (properties) {
        //                     for (let i = 0; i < pathLabels.length; i++) {
        //                         if (properties[pathLabels[i]]) {
        //                             path.push(properties[pathLabels[i]]);
        //                         }
        //                     }
        //                 }
        //             }
        //             const fileEntry: IFile = {
        //                 id: uuid(),
        //                 studyId: studyId,
        //                 userId: userId,
        //                 fileName: fileUpload.filename, // Access filename directly from the fileUpload object.
        //                 fileSize: buffer.length, // Use buffer's length for file size.
        //                 description: description,
        //                 uri: fileUri,
        //                 path: path,
        //                 hash: hashString,
        //                 fileType: fileType,
        //                 fileCategory: fileCategory,
        //                 properties: properties,
        //                 sharedUsers: [],
        //                 life: {
        //                     createdTime: Date.now(),
        //                     createdUser: requester,
        //                     deletedTime: null,
        //                     deletedUser: null
        //                 },
        //                 metadata: {}
        //             };
        //             const insertResult = await db.collections!.files_collection.insertOne(fileEntry as IFile);
        //             if (insertResult.acknowledged) {
        //                 resolve(fileEntry as IFile);
        //             } else {
        //                 throw new TRPCError({
        //                     code: enumTRPCErrorCodes.BAD_REQUEST,
        //                     message: errorCodes.DATABASE_ERROR
        //                 });
        //             }

        //         } catch (error) {
        //             console.log(error);
        //             reject(new TRPCError({
        //                 code: enumTRPCErrorCodes.BAD_REQUEST,
        //                 message: errorCodes.UNQUALIFIED_ERROR
        //             }));
        //         }
        //     })();
        // });
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

    public async findFiles(fileIds: string[], readable?: boolean): Promise<IFile[]> {
        const result = await db.collections!.files_collection.find({ id: { $in: fileIds } }).toArray();
        if (readable) {
            const users: any[] = await db.collections!.users_collection.find({ 'life.deletedTime': null }).toArray();
            result.forEach(el => {
                const user = users.filter(ek => ek.id === el.life.createdUser)[0];
                if (!user) {
                    el.life.createdUser = 'UNKNOWN';
                } else {
                    el.life.createdUser = `${user.firstname} ${user.lastname}`;
                }
            });
        }
        return result;
    }
}

export const fileCore = Object.freeze(new FileCore());