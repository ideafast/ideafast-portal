import { IDataEntry, IFile, IOrganisation, IPermissionManagementOptions, IUserWithoutToken, atomicOperation, deviceTypes } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { DBType } from '../database/database';
import { FileUpload } from 'graphql-upload-minimal';
import { GraphQLError } from 'graphql';
import { validate } from '@ideafast/idgen';
import { fileSizeLimit } from '../utils/definition';
import crypto from 'crypto';
import { makeGenericReponse } from '../utils/responses';
import { MatchKeysAndValues } from 'mongodb';
import { errorCodes } from '../utils/errors';
import { PermissionCore } from './permissionCore';
import { StudyCore } from './studyCore';
import { ObjectStore } from '@itmat-broker/itmat-commons';

// default visitId for file data
const targetVisitId = '0';
export class FileCore {
    db: DBType;
    permissionCore: PermissionCore;
    studyCore: StudyCore;
    objStore: ObjectStore;
    constructor(db: DBType, objStore: ObjectStore) {
        this.db = db;
        this.permissionCore = new PermissionCore(db);
        this.studyCore = new StudyCore(db, objStore);
        this.objStore = objStore;
    }

    public async uploadFile(requester: IUserWithoutToken | undefined, studyId: string, file: Promise<FileUpload>, description: string, hash?: string, fileLength?: bigint) {
        if (!requester) {
            throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
        }
        // get the target fieldId of this file
        const study = await this.studyCore.findOneStudy_throwErrorIfNotExist(studyId);

        const hasStudyLevelSubjectPermission = await this.permissionCore.userHasTheNeccessaryDataPermission(
            atomicOperation.WRITE,
            requester,
            studyId
        );
        const hasStudyLevelStudyDataPermission = await this.permissionCore.userHasTheNeccessaryManagementPermission(
            IPermissionManagementOptions.own,
            atomicOperation.WRITE,
            requester,
            studyId
        );
        if (!hasStudyLevelSubjectPermission && !hasStudyLevelStudyDataPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }

        let targetFieldId: string;
        let isStudyLevel = false;
        // obtain sitesIDMarker from db
        const sitesIDMarkers = (await this.db.collections.organisations_collection.find<IOrganisation>({ deleted: null }).toArray()).reduce<Record<string, string | null>>((acc, curr) => {
            if (curr.metadata?.siteIDMarker) {
                acc[curr.metadata.siteIDMarker] = curr.shortname;
            }
            return acc;
        }, {});
        // if the description object is empty, then the file is study-level data
        // otherwise, a subjectId must be provided in the description object
        // we will check other properties in the decription object (deviceId, startDate, endDate)
        const parsedDescription = JSON.parse(description);
        if (!parsedDescription) {
            throw new GraphQLError('File description is invalid', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }
        if (!parsedDescription.participantId) {
            isStudyLevel = true;
        } else {
            isStudyLevel = false;
            if (!Object.keys(sitesIDMarkers).includes(parsedDescription.participantId?.substr(0, 1)?.toUpperCase())) {
                throw new GraphQLError('File description is invalid', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
            // check deviceId, startDate, endDate if necessary
            if (parsedDescription.deviceId && parsedDescription.startDate && parsedDescription.endDate) {
                if (!Object.keys(deviceTypes).includes(parsedDescription.deviceId?.substr(0, 3)?.toUpperCase()) ||
                    !validate(parsedDescription.participantId?.substr(1) ?? '') ||
                    !validate(parsedDescription.deviceId.substr(3) ?? '')) {
                    throw new GraphQLError('File description is invalid', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
                }
            } else {
                throw new GraphQLError('File description is invalid', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
            // if the targetFieldId is in the description object; then use the fieldId, otherwise, infer it from the device types
            if (parsedDescription.fieldId) {
                targetFieldId = parsedDescription.fieldId;
            } else {
                const device = parsedDescription.deviceId?.slice(0, 3);
                targetFieldId = `Device_${deviceTypes[device].replace(/ /g, '_')}`;
            }
            // check fieldId exists
            if ((await this.db.collections.field_dictionary_collection.find({ studyId: study.id, fieldId: targetFieldId, dateDeleted: null }).sort({ dateAdded: -1 }).limit(1).toArray()).length === 0) {
                throw new GraphQLError('File description is invalid', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
            // check field permission
            if (!this.permissionCore.checkDataEntryValid(await this.permissionCore.combineUserDataPermissions(atomicOperation.WRITE, requester, studyId, undefined), targetFieldId, parsedDescription.participantId, targetVisitId)) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }
        }

        const file_ = await file;
        const fileNameParts = file_.filename.split('.');

        return new Promise<IFile>((resolve, reject) => {
            (async () => {
                try {
                    let fileName: string = file_.filename;
                    let metadata: Record<string, unknown> = {};
                    if (!isStudyLevel) {
                        const matcher = /(.{1})(.{6})-(.{3})(.{6})-(\d{8})-(\d{8})\.(.*)/;
                        let startDate;
                        let endDate;
                        let participantId;
                        let deviceId;
                        // check description first, then filename
                        if (description) {
                            const parsedDescription = JSON.parse(description);
                            startDate = parseInt(parsedDescription.startDate);
                            endDate = parseInt(parsedDescription.endDate);
                            participantId = parsedDescription.participantId.toString();
                            deviceId = parsedDescription.deviceId.toString();
                        } else if (matcher.test(file_.filename)) {
                            const particles = file_.filename.split('-');
                            participantId = particles[0];
                            deviceId = particles[1];
                            startDate = particles[2];
                            endDate = particles[3];
                        } else {
                            reject(new GraphQLError('Missing file description', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } }));
                            return;
                        }


                        try {
                            if (
                                !Object.keys(sitesIDMarkers).includes(participantId.substr(0, 1)?.toUpperCase()) ||
                                !Object.keys(deviceTypes).includes(deviceId.substr(0, 3)?.toUpperCase()) ||
                                !validate(participantId.substr(1) ?? '') ||
                                !validate(deviceId.substr(3) ?? '') ||
                                !startDate || !endDate ||
                                (new Date(endDate).setHours(0, 0, 0, 0).valueOf()) > (new Date().setHours(0, 0, 0, 0).valueOf())
                            ) {
                                reject(new GraphQLError('File description is invalid', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } }));
                                return;
                            }
                        } catch (e) {
                            reject(new GraphQLError('Missing file description', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } }));
                            return;
                        }

                        const typedStartDate = new Date(startDate);
                        const formattedStartDate = typedStartDate.getFullYear() + `${typedStartDate.getMonth() + 1}`.padStart(2, '0') + `${typedStartDate.getDate()}`.padStart(2, '0');
                        const typedEndDate = new Date(endDate);
                        const formattedEndDate = typedEndDate.getFullYear() + `${typedEndDate.getMonth() + 1}`.padStart(2, '0') + `${typedEndDate.getDate()}`.padStart(2, '0');
                        fileName = `${parsedDescription.participantId.toUpperCase()}-${parsedDescription.deviceId.toUpperCase()}-${formattedStartDate}-${formattedEndDate}.${fileNameParts[fileNameParts.length - 1]}`;
                        metadata = {
                            participantId: parsedDescription.participantId,
                            deviceId: parsedDescription.deviceId,
                            startDate: parsedDescription.startDate, // should be in milliseconds
                            endDate: parsedDescription.endDate,
                            tup: parsedDescription.tup
                        };
                    }

                    if (fileLength !== undefined && fileLength > fileSizeLimit) {
                        reject(new GraphQLError('File should not be larger than 8GB', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } }));
                        return;
                    }

                    const stream = file_.createReadStream();
                    const fileUri = uuid();
                    const hash_ = crypto.createHash('sha256');
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
                        hash_.update(chunk);
                    });

                    await this.objStore.uploadFile(stream, studyId, fileUri);

                    const hashString = hash_.digest('hex');
                    if (hash && hash !== hashString) {
                        reject(new GraphQLError('File hash not match', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } }));
                        return;
                    }

                    // check if readbytes equal to filelength in parameters
                    if (fileLength !== undefined && fileLength.toString() !== readBytes.toString()) {
                        reject(new GraphQLError('File size mismatch', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } }));
                        return;
                    }
                    const fileEntry: IFile = {
                        id: uuid(),
                        fileName: fileName,
                        studyId: studyId,
                        description: description,
                        uploadTime: `${Date.now()}`,
                        uploadedBy: requester.id,
                        deleted: null,
                        metadata: metadata,
                        fileSize: readBytes.toString(),
                        uri: fileUri,
                        hash: hashString
                    };
                    fileEntry.fileSize = readBytes.toString();
                    fileEntry.uri = fileUri;
                    fileEntry.hash = hashString;
                    if (!isStudyLevel) {
                        await this.db.collections.data_collection.insertOne({
                            id: uuid(),
                            m_studyId: studyId,
                            m_subjectId: parsedDescription.participantId,
                            m_versionId: null,
                            m_visitId: targetVisitId,
                            m_fieldId: targetFieldId,
                            value: '',
                            uploadedAt: (new Date()).valueOf(),
                            metadata: {
                                'uploader:user': requester.id,
                                'add': [fileEntry.id],
                                'remove': []
                            }
                        });
                    }
                    const insertResult = await this.db.collections.files_collection.insertOne(fileEntry);
                    if (insertResult.acknowledged) {
                        resolve(fileEntry);
                    } else {
                        throw new GraphQLError(errorCodes.DATABASE_ERROR);
                    }

                } catch (error) {
                    reject(new GraphQLError('General upload error', { extensions: { code: errorCodes.UNQUALIFIED_ERROR, error } }));
                }
            })().catch((e) => reject(e));
        });
    }

    public async deleteFile(requester: IUserWithoutToken | undefined, fileId: string) {
        if (!requester) {
            throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
        }
        const file = await this.db.collections.files_collection.findOne({ deleted: null, id: fileId });

        if (!file) {
            throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
        }
        const hasStudyLevelPermission = await this.permissionCore.userHasTheNeccessaryDataPermission(
            atomicOperation.WRITE,
            requester,
            file.studyId
        );
        if (!hasStudyLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }
        const parsedDescription = JSON.parse(file.description);
        if (Object.keys(parsedDescription).length === 0) {
            await this.db.collections.files_collection.findOneAndUpdate({ deleted: null, id: fileId }, { $set: { deleted: Date.now().valueOf() } });
            return makeGenericReponse();
        }
        const device = parsedDescription.deviceId.slice(0, 3);
        if (!Object.keys(deviceTypes).includes(device)) {
            throw new GraphQLError('File description is invalid', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }
        const targetFieldId = `Device_${(deviceTypes[device] as string).replace(/ /g, '_')}`;
        if (!this.permissionCore.checkDataEntryValid(hasStudyLevelPermission.raw, targetFieldId, parsedDescription.participantId, targetVisitId)) {
            throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
        }
        // update data record
        const obj = {
            m_studyId: file.studyId,
            m_subjectId: parsedDescription.participantId,
            m_versionId: null,
            m_visitId: targetVisitId,
            m_fieldId: targetFieldId
        };
        const existing = await this.db.collections.data_collection.findOne(obj);
        if (!existing) {
            await this.db.collections.data_collection.insertOne({
                ...obj,
                id: uuid(),
                uploadedAt: (new Date()).valueOf(),
                value: '',
                metadata: {
                    add: [],
                    remove: []
                }
            });
        }
        const objWithData: Partial<MatchKeysAndValues<IDataEntry>> = {
            ...obj,
            id: uuid(),
            value: '',
            uploadedAt: (new Date()).valueOf(),
            metadata: {
                'uploader:user': requester.id,
                'add': existing?.metadata?.add ?? [],
                'remove': (existing?.metadata?.remove || []).concat(fileId)
            }
        };
        const updateResult = await this.db.collections.data_collection.updateOne(obj, { $set: objWithData }, { upsert: true });

        // const updateResult = await this.db.collections.files_collection.updateOne({ deleted: null, id: args.fileId }, { $set: { deleted: new Date().valueOf() } });
        if (updateResult.modifiedCount === 1 || updateResult.upsertedCount === 1) {
            return makeGenericReponse();
        } else {
            throw new GraphQLError(errorCodes.DATABASE_ERROR);
        }
    }
}