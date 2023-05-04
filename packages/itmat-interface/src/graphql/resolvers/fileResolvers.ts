import { GraphQLError } from 'graphql';
import { IFile, IUser, atomicOperation, IPermissionManagementOptions, IDataEntry } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { FileUpload } from 'graphql-upload-minimal';
import { db } from '../../database/database';
import { objStore } from '../../objStore/objStore';
import { permissionCore } from '../core/permissionCore';
import { errorCodes } from '../errors';
import { IGenericResponse, makeGenericReponse } from '../responses';
import crypto from 'crypto';
import { deviceTypes } from '@itmat-broker/itmat-types';
import { fileSizeLimit } from '../../utils/definition';
import type { MatchKeysAndValues } from 'mongodb';
import { studyCore } from '../core/studyCore';

// default visitId for file data
const targetVisitId = '0';
export const fileResolvers = {
    Query: {
    },
    Mutation: {
        // this API has the same functions as uploading file data via clinical APIs
        uploadFile: async (__unused__parent: Record<string, unknown>, args: { fileLength?: bigint, studyId: string, file: Promise<FileUpload>, description: string, hash?: string }, context: any): Promise<IFile> => {

            const requester: IUser = context.req.user;
            // get the target fieldId of this file
            const study = await studyCore.findOneStudy_throwErrorIfNotExist(args.studyId);

            const hasStudyLevelSubjectPermission = await permissionCore.userHasTheNeccessaryDataPermission(
                atomicOperation.WRITE,
                requester,
                args.studyId
            );
            const hasStudyLevelStudyDataPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
                IPermissionManagementOptions.own,
                atomicOperation.WRITE,
                requester,
                args.studyId
            );
            if (!hasStudyLevelSubjectPermission && !hasStudyLevelStudyDataPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }

            let targetFieldId: string;
            let isStudyLevel = false;
            const parsedDescription = JSON.parse(args.description);
            if (!parsedDescription) {
                throw new GraphQLError('File description is invalid', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
            if (!parsedDescription.fieldId && !parsedDescription.participantId) {
                isStudyLevel = true;
            } else {
                isStudyLevel = false;
                if (parsedDescription.fieldId && parsedDescription.participantId) {
                    targetFieldId = parsedDescription.fieldId;
                } else {
                    // const device = parsedDescription.deviceId?.slice(0, 3);
                    // targetFieldId = `Device_${deviceTypes[device].replace(/ /g, '_')}`;
                    throw new GraphQLError('File description is invalid', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
                }
                // check fieldId exists
                if ((await db.collections!.field_dictionary_collection.find({ studyId: study.id, fieldId: targetFieldId, dateDeleted: null }).sort({ dateAdded: -1 }).limit(1).toArray()).length === 0) {
                    throw new GraphQLError('File description is invalid', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
                }
                // check field permission
                if (!permissionCore.checkDataEntryValid(await permissionCore.combineUserDataPermissions(atomicOperation.WRITE, requester, args.studyId, undefined), targetFieldId, parsedDescription.participantId, targetVisitId)) {
                    throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
                }
            }
            const file = await args.file;
            return new Promise<IFile>((resolve, reject) => {
                (async () => {
                    try {
                        const fileEntry: Partial<IFile> = {
                            id: uuid(),
                            fileName: file.filename,
                            studyId: args.studyId,
                            description: args.description,
                            uploadTime: `${Date.now()}`,
                            uploadedBy: requester.id,
                            deleted: null,
                            metadata: {
                                'uploader:user': requester.id,
                                'uploaded:time': Date.now()
                            }
                        };

                        if (args.fileLength !== undefined && args.fileLength > fileSizeLimit) {
                            reject(new GraphQLError('File should not be larger than 8GB', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } }));
                            return;
                        }

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

                        await objStore.uploadFile(stream, args.studyId, fileUri);

                        const hashString = hash.digest('hex');
                        if (args.hash && args.hash !== hashString) {
                            reject(new GraphQLError('File hash not match', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } }));
                            return;
                        }

                        // check if readbytes equal to filelength in parameters
                        if (args.fileLength !== undefined && args.fileLength.toString() !== readBytes.toString()) {
                            reject(new GraphQLError('File size mismatch', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } }));
                            return;
                        }

                        fileEntry.fileSize = readBytes.toString();
                        fileEntry.uri = fileUri;
                        fileEntry.hash = hashString;
                        if (!isStudyLevel) {
                            await db.collections!.data_collection.insertOne({
                                id: uuid(),
                                m_studyId: args.studyId,
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
        },
        deleteFile: async (__unused__parent: Record<string, unknown>, args: { fileId: string }, context: any): Promise<IGenericResponse> => {
            const requester: IUser = context.req.user;

            const file = await db.collections!.files_collection.findOne({ deleted: null, id: args.fileId });

            if (!file) {
                throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            }
            const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryDataPermission(
                atomicOperation.WRITE,
                requester,
                file.studyId
            );
            if (!hasStudyLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }
            const parsedDescription = JSON.parse(file.description);
            if (Object.keys(parsedDescription).length === 0) {
                await db.collections!.files_collection.findOneAndUpdate({ deleted: null, id: args.fileId }, { $set: { deleted: Date.now().valueOf() } });
                return makeGenericReponse();
            }
            const device = parsedDescription.deviceId.slice(0, 3);
            if (!Object.keys(deviceTypes).includes(device)) {
                throw new GraphQLError('File description is invalid', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
            const targetFieldId = `Device_${(deviceTypes[device] as string).replace(/ /g, '_')}`;
            if (!permissionCore.checkDataEntryValid(hasStudyLevelPermission.raw, targetFieldId, parsedDescription.participantId, targetVisitId)) {
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
            const existing = await db.collections!.data_collection.findOne(obj);
            if (!existing) {
                await db.collections!.data_collection.insertOne({
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
                    'remove': ((existing?.metadata as any)?.remove || []).concat(args.fileId)
                }
            };
            const updateResult = await db.collections!.data_collection.updateOne(obj, { $set: objWithData }, { upsert: true });

            // const updateResult = await db.collections!.files_collection.updateOne({ deleted: null, id: args.fileId }, { $set: { deleted: new Date().valueOf() } });
            if (updateResult.modifiedCount === 1 || updateResult.upsertedCount === 1) {
                return makeGenericReponse();
            } else {
                throw new GraphQLError(errorCodes.DATABASE_ERROR);
            }
        }
    },
    Subscription: {}
};
