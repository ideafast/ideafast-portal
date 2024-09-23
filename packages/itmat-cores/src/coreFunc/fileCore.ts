import { enumConfigType, IFile, defaultSettings, enumFileTypes, enumFileCategories, IUserWithoutToken, IStudy, FileUpload, CoreError, enumCoreErrors, ISystemConfig, IStudyConfig, IUserConfig, IDocConfig, ICacheConfig, IDomainConfig, IGenericResponse } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { DBType } from '../database/database';
import { ObjectStore } from '@itmat-broker/itmat-commons';
import { makeGenericReponse } from '../utils';
import { PassThrough } from 'stream';

/**
 * This class provides methods to interact with files.
 * Note that all core functions are should be called by other core functions or resolvers, not by the client.
 * Necessary permission check should be done in the caller functions.
 */
export class FileCore {
    db: DBType;
    objStore: ObjectStore;
    constructor(db: DBType, objStore: ObjectStore) {
        this.db = db;
        this.objStore = objStore;
    }
    /**
     * Upload a file to storage.
     * Note this function will upload file based on the input parameters regardless of the requester's permission and file metadata.
     *
     * @param requester - The requester.
     * @param studyId - The id of the study. Could be null for non-study files.
     * @param userId - The id of the user.
     * @param fileUpload - The file to upload.
     * @param fileType - The type of the file.
     * @param fileCategory - The category of the file.
     * @param description - The description of the file.
     * @param properties - The properties of the file. Note if the data is attached to a field, the fieldproperties will be used.
     *
     * @return IFile - The object of IFile.
     */
    public async uploadFile(
        requester: IUserWithoutToken,
        studyId: string | null,
        userId: string | null,
        fileUpload: FileUpload,
        fileType: enumFileTypes,
        fileCategory: enumFileCategories,
        description?: string,
        properties?: Record<string, unknown>
    ): Promise<IFile> {
        let study: IStudy | null = null;
        if (studyId) {
            study = await this.db.collections.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
            if (!study) {
                throw new CoreError(
                    enumCoreErrors.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY,
                    'Study does not exist.'
                );
            }
        }
        let fileConfig: ISystemConfig | IStudyConfig | IUserConfig | IDocConfig | ICacheConfig | IDomainConfig | null = null;
        let userRepoRemainingSpace = 0;
        let fileSizeLimit: number;
        let defaultFileBucketId: string;

        if (fileCategory === enumFileCategories.STUDY_DATA_FILE && studyId) {
            const config = await this.db.collections.configs_collection.findOne({ type: enumConfigType.STUDYCONFIG, key: studyId });
            fileConfig = config ? config.properties : defaultSettings.studyConfig;
            fileSizeLimit = (fileConfig as IStudyConfig).defaultMaximumFileSize;
            defaultFileBucketId = studyId;
        } else if (fileCategory === enumFileCategories.USER_DRIVE_FILE) {
            const config = await this.db.collections.configs_collection.findOne({ type: enumConfigType.USERCONFIG, key: requester.id });
            fileConfig = config ? config.properties as IUserConfig : defaultSettings.userConfig;
            const totalSize = (await this.db.collections.files_collection.aggregate([
                { $match: { 'userId': requester.id, 'life.deletedTime': null } },
                { $group: { _id: '$userId', totalSize: { $sum: '$fileSize' } } }
            ]))[0]?.totalSize ?? 0;
            userRepoRemainingSpace = (fileConfig as IUserConfig).defaultMaximumFileRepoSize - totalSize;
            fileSizeLimit = Math.min((fileConfig as IUserConfig).defaultMaximumFileSize, userRepoRemainingSpace);
            defaultFileBucketId = (fileConfig as IUserConfig).defaultFileBucketId;
        } else if (fileCategory === enumFileCategories.DOC_FILE) {
            const config = await this.db.collections.configs_collection.findOne({ type: enumConfigType.DOCCONFIG, key: null });
            fileConfig = config ? config.properties as IDocConfig : defaultSettings.docConfig;
            fileSizeLimit = (fileConfig as IDocConfig).defaultMaximumFileSize;
            defaultFileBucketId = (fileConfig as IDocConfig).defaultFileBucketId;
        } else if (fileCategory === enumFileCategories.CACHE) {
            const config = await this.db.collections.configs_collection.findOne({ type: enumConfigType.CACHECONFIG, key: null });
            fileConfig = config ? config.properties as ICacheConfig : defaultSettings.cacheConfig;
            fileSizeLimit = (fileConfig as ICacheConfig).defaultMaximumFileSize;
            defaultFileBucketId = (fileConfig as ICacheConfig).defaultFileBucketId;
        } else if (fileCategory === enumFileCategories.PROFILE_FILE) {
            const config = await this.db.collections.configs_collection.findOne({ type: enumConfigType.SYSTEMCONFIG, key: null });
            fileConfig = config ? config.properties as ISystemConfig : defaultSettings.systemConfig;
            fileSizeLimit = (fileConfig as ISystemConfig).defaultMaximumFileSize;
            defaultFileBucketId = (fileConfig as ISystemConfig).defaultProfileBucketId;
        } else if (fileCategory === enumFileCategories.DOMAIN_FILE) {
            const config = await this.db.collections.configs_collection.findOne({ type: enumConfigType.DOMAINCONFIG, key: null });
            fileConfig = config ? config.properties as IDomainConfig : defaultSettings.domainConfig;
            fileSizeLimit = (fileConfig as IDomainConfig).defaultMaximumFileSize;
            defaultFileBucketId = (fileConfig as IDomainConfig).defaultFileBucketId;
        } else {
            throw new CoreError(
                enumCoreErrors.CLIENT_MALFORMED_INPUT,
                'File category does not exist.'
            );
        }

        const fileUri = uuid();
        const hash = crypto.createHash('sha256');
        const stream = fileUpload.createReadStream();
        const chunks: Buffer[] = [];

        return new Promise<IFile>((resolve, reject) => {
            let fileSize = 0;

            stream.on('data', (chunk: Buffer) => {
                hash.update(chunk);
                chunks.push(chunk);
                fileSize += chunk.length;
            });

            stream.on('end', () => {
                this.processFileChunks(chunks, hash, fileSize, fileSizeLimit, fileUpload, defaultFileBucketId, fileUri, requester, studyId, userId, fileType, fileCategory, description, properties)
                    .then(fileEntry => resolve(fileEntry))
                    .catch(error => reject(error));
            });

            stream.on('error', (err) => {
                reject(new CoreError(
                    enumCoreErrors.FILE_STREAM_ERROR,
                    'Error reading file stream: ' + err.message
                ));
            });
        });
    }

    private async processFileChunks(
        chunks: Buffer[],
        hash: crypto.Hash,
        fileSize: number,
        fileSizeLimit: number,
        fileUpload: FileUpload,
        defaultFileBucketId: string,
        fileUri: string,
        requester: IUserWithoutToken,
        studyId: string | null,
        userId: string | null,
        fileType: enumFileTypes,
        fileCategory: enumFileCategories,
        description?: string,
        properties?: Record<string, unknown>
    ): Promise<IFile> {
        const buffer = Buffer.concat(chunks);
        const hashString = hash.digest('hex');
        const stream = new PassThrough();
        stream.end(buffer);
        return this.handleFileUpload(fileSize, fileSizeLimit, stream, hashString, fileUpload, defaultFileBucketId, fileUri, requester, studyId, userId, fileType, fileCategory, description, properties);
    }

    private async handleFileUpload(
        fileSize: number,
        fileSizeLimit: number,
        stream: PassThrough,
        hashString: string,
        fileUpload: FileUpload,
        defaultFileBucketId: string,
        fileUri: string,
        requester: IUserWithoutToken,
        studyId: string | null,
        userId: string | null,
        fileType: enumFileTypes,
        fileCategory: enumFileCategories,
        description?: string,
        properties?: Record<string, unknown>
    ): Promise<IFile> {
        if (fileSize > fileSizeLimit) {
            throw new CoreError(
                enumCoreErrors.UNQUALIFIED_ERROR,
                'File size exceeds the limit.'
            );
        }

        await this.objStore.uploadFile(stream, defaultFileBucketId, fileUri, fileSize);

        const fileEntry: IFile = {
            id: uuid(),
            studyId: studyId,
            userId: userId,
            fileName: fileUpload.filename,
            fileSize: fileSize,
            description: description,
            uri: fileUri,
            hash: hashString,
            fileType: fileType,
            fileCategory: fileCategory,
            properties: properties ? properties : {},
            sharedUsers: [],
            life: {
                createdTime: Date.now(),
                createdUser: requester.id,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        const insertResult = await this.db.collections.files_collection.insertOne(fileEntry as IFile);
        if (!insertResult.acknowledged) {
            throw new CoreError(
                enumCoreErrors.DATABASE_ERROR,
                enumCoreErrors.DATABASE_ERROR
            );
        }

        return fileEntry;
    }

    /**
     * Delete a file.
     *
     * @param requester - The requester.
     * @param fileId - The id of the file.
     *
     * @return IGenericResponse
     */
    public async deleteFile(requester: string, fileId: string): Promise<IGenericResponse> {
        const file = await this.db.collections.files_collection.findOne({ 'id': fileId, 'life.deletedTime': null });
        if (!file) {
            throw new CoreError(
                enumCoreErrors.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY,
                'File does not exist.'
            );
        }
        try {
            await this.db.collections.files_collection.findOneAndUpdate({ id: fileId }, { $set: { 'life.deletedTime': Date.now().valueOf(), 'life.deletedUser': requester } });
            return makeGenericReponse(fileId, undefined, undefined, 'File has been deleted.');
        } catch {
            throw new CoreError(
                enumCoreErrors.DATABASE_ERROR,
                enumCoreErrors.DATABASE_ERROR
            );
        }
    }

    /**
     * Get the list of files by fileIds in a simplified format or detailed format with explicit username.
     * The aim is to avoid leaking user information in the frontend.
     *
     * @param fileIds
     * @param readable
     * @returns
     */
    public async findFiles(fileIds: string[], readable?: boolean): Promise<IFile[]> {
        const result = await this.db.collections.files_collection.find({ id: { $in: fileIds } }).toArray();
        if (readable) {
            const users = await this.db.collections.users_collection.find({ 'life.deletedTime': null }).toArray();
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

