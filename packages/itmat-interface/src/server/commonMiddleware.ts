import jwt from 'jsonwebtoken';
import { DataCore, DataTransformationCore, FileCore, PermissionCore, userRetrieval, UtilsCore } from '@itmat-broker/itmat-cores';
import { db } from '../database/database';
import Busboy from 'busboy';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { enumConfigType, IStudyConfig, defaultSettings, enumFileTypes, IFile, enumFileCategories, CoreError } from '@itmat-broker/itmat-types';
import { objStore } from '../objStore/objStore';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { Logger } from '@itmat-broker/itmat-commons';

const fileCore = new FileCore(db, objStore);
const permissionCore = new PermissionCore(db);
const utilsCore = new UtilsCore();
const dataTransformationCore = new DataTransformationCore(utilsCore);
const dataCore = new DataCore(db, objStore, fileCore, permissionCore, utilsCore, dataTransformationCore);
const studyFileStagingBucket = 'study-file-upload-staging';

class UploadHttpError extends Error {
    constructor(public readonly statusCode: number, public readonly responseBody: Record<string, unknown>) {
        super(String((responseBody['error'] as Record<string, unknown> | undefined)?.['message'] ?? responseBody['message'] ?? 'Upload failed.'));
    }
}

interface StagedFile {
    fileName: string;
    fileSize: number;
    fileUri: string;
    hash: string;
}

const removeUploadedObject = async (bucketId: string, uri: string) => {
    try {
        await objStore.removeObject(bucketId, uri);
    } catch (error) {
        Logger.error(`Failed to remove upload object ${bucketId}/${uri}: ${(error as Error).message}`);
    }
};

export const streamFileToStaging = async (file: Readable, fileName: string): Promise<StagedFile> => {
    const fileUri = uuid();
    const hash = crypto.createHash('sha256');
    let fileSize = 0;
    const meteredStream = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            fileSize += chunk.length;
            hash.update(chunk);
            callback(null, chunk);
        }
    });
    const streamPromise = pipeline(file, meteredStream).catch((error: Error) => {
        throw new UploadHttpError(400, { message: 'Failed to upload file.', error: { message: error.message } });
    });
    const uploadPromise = objStore.uploadFile(meteredStream, studyFileStagingBucket, fileUri).catch((error: Error) => {
        throw new UploadHttpError(500, { message: 'Error uploading file to MinIO', error: { message: error.message } });
    });

    try {
        await Promise.all([streamPromise, uploadPromise]);
    } catch (error) {
        file.destroy();
        meteredStream.destroy();
        await Promise.allSettled([streamPromise, uploadPromise]);
        await removeUploadedObject(studyFileStagingBucket, fileUri);
        throw error;
    }

    return {
        fileName,
        fileSize,
        fileUri,
        hash: hash.digest('hex')
    };
};

export const tokenAuthentication = async (token: string) => {
    if (token !== '') {
        const decodedPayload = jwt.decode(token);

        if (decodedPayload !== null && typeof decodedPayload === 'object') {
            // Check if it's a system token
            if (decodedPayload['isSystemToken'] === true) {

                try {
                    jwt.verify(token, decodedPayload['publicKey']);
                    return await userRetrieval(db, decodedPayload['publicKey'], true, decodedPayload['userId']);
                } catch {
                    return false;
                }
            }

            // Handle regular user token
            const pubkey = decodedPayload['publicKey'];
            if (!pubkey) {
                return false;
            }

            try {
                jwt.verify(token, pubkey);
                return await userRetrieval(db, pubkey);
            } catch {
                return false;
            }
        }
        return false;
    }
    return null;
};

export async function uploadFileData(req, res) {
    const variables: Record<string, string> = {};
    let stagedFile: StagedFile | undefined;
    let fileTask: Promise<StagedFile> | undefined;
    let finalObjectCreated = false;
    let uploadCommitted = false;
    let fileEntry: IFile | undefined;
    let activeFile: Readable | undefined;

    try {
        const busboy = Busboy({ headers: req.headers });
        const parsingPromise = new Promise<void>((resolve, reject) => {
            busboy.on('field', (fieldname, val) => {
                variables[fieldname] = val;
            });
            busboy.on('file', (_fieldname, file: Readable, { filename }) => {
                if (fileTask) {
                    file.resume();
                    reject(new UploadHttpError(400, { message: 'Only one file can be uploaded at a time.' }));
                    return;
                }
                activeFile = file;
                fileTask = streamFileToStaging(file, filename);
                void fileTask.catch(reject);
            });
            busboy.once('error', (error) => {
                const parsingError = error instanceof Error ? error : new Error(String(error));
                activeFile?.destroy(parsingError);
                reject(parsingError);
            });
            busboy.once('finish', resolve);
            req.once('aborted', () => {
                const error = new UploadHttpError(400, { message: 'Upload request was aborted.' });
                activeFile?.destroy(error);
                reject(error);
            });
            req.pipe(busboy);
        });

        await parsingPromise;
        if (!fileTask) {
            throw new UploadHttpError(400, { message: 'No file was uploaded.' });
        }
        stagedFile = await fileTask;

        const config = await db.collections.configs_collection.findOne({ type: enumConfigType.STUDYCONFIG, key: variables['studyId'] });
        const fileConfig = config ? config.properties : defaultSettings.studyConfig;
        const fileSizeLimit = (fileConfig as IStudyConfig).defaultMaximumFileSize;
        if (stagedFile.fileSize > fileSizeLimit) {
            throw new UploadHttpError(400, { message: 'File size exceeds the limit' });
        }

        const fileType = (stagedFile.fileName.split('.').pop() ?? '').toUpperCase();
        if (!Object.keys(enumFileTypes).includes(fileType)) {
            throw new UploadHttpError(400, { error: { message: `File type ${fileType} not supported.` } });
        }
        if (!req.user) {
            throw new UploadHttpError(400, { message: 'Failed to upload file.', error: { message: 'User is not logged in.' } });
        }

        let properties: Record<string, unknown>;
        try {
            properties = JSON.parse(variables['properties'] ?? '{}') as Record<string, unknown>;
        } catch (error) {
            throw new UploadHttpError(400, { message: 'Failed to upload file.', error: { message: (error as Error).message } });
        }

        fileEntry = {
            id: uuid(),
            studyId: variables['studyId'],
            userId: null,
            fileName: stagedFile.fileName,
            fileSize: stagedFile.fileSize,
            description: variables['description'],
            uri: stagedFile.fileUri,
            hash: stagedFile.hash,
            fileType: fileType as enumFileTypes,
            fileCategory: enumFileCategories.STUDY_DATA_FILE,
            properties,
            sharedUsers: [],
            life: {
                createdTime: Date.now(),
                createdUser: req.user.id,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        try {
            await objStore.copyObject(studyFileStagingBucket, stagedFile.fileUri, variables['studyId'], stagedFile.fileUri);
            finalObjectCreated = true;
        } catch (error) {
            throw new UploadHttpError(500, { message: 'Error uploading file to MinIO', error: { message: (error as Error).message } });
        }

        const response = await dataCore.uploadFileDataWithFileEntry(
            req.user,
            variables['studyId'],
            variables['fieldId'],
            fileEntry,
            JSON.stringify({ ...properties, FileName: stagedFile.fileName })
        );
        await db.collections.files_collection.insertOne(fileEntry);
        await removeUploadedObject(studyFileStagingBucket, stagedFile.fileUri);
        uploadCommitted = true;
        res.status(200).json({ result: { data: response } });
    } catch (error) {
        if (!uploadCommitted && fileEntry) {
            try {
                await db.collections.data_collection.deleteMany({
                    studyId: variables['studyId'],
                    fieldId: variables['fieldId'],
                    value: fileEntry.id
                });
                await db.collections.files_collection.deleteOne({ id: fileEntry.id });
            } catch (cleanupError) {
                Logger.error(`Failed to roll back upload database entries for ${fileEntry.id}: ${(cleanupError as Error).message}`);
            }
        }
        if (!uploadCommitted && finalObjectCreated && stagedFile) {
            await removeUploadedObject(variables['studyId'], stagedFile.fileUri);
        }
        if (res.headersSent) {
            throw error;
        }
        if (error instanceof UploadHttpError) {
            res.status(error.statusCode).json(error.responseBody);
            return;
        }
        res.status(400).json({ message: 'Failed to upload file.', error: { message: (error as CoreError).message } });
    } finally {
        if (fileTask) {
            const result = await Promise.allSettled([fileTask]);
            if (!stagedFile && result[0].status === 'fulfilled') {
                stagedFile = result[0].value;
            }
        }
        if (stagedFile) {
            await removeUploadedObject(studyFileStagingBucket, stagedFile.fileUri);
        }
    }
}
