import { GraphQLError } from 'graphql';
import { IFile, IOrganisation, IUser, IGenericResponse } from '@itmat-broker/itmat-types';
import { FileUpload } from 'graphql-upload-minimal';
import { db } from '../../database/database';
import { errorCodes } from '../errors';
import { makeGenericReponse } from '../responses';
import { validate } from '@ideafast/idgen';
import { deviceTypes } from '@itmat-broker/itmat-types';
import { TRPCError } from '@trpc/server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';
import { dataCore } from '../../core/dataCore';
import fs from 'fs';
import path from 'path';

export const fileResolvers = {
    Query: {
    },
    Mutation: {
        uploadFile: async (__unused__parent: Record<string, unknown>, args: { fileLength?: bigint, studyId: string, file: Promise<FileUpload>, description: string, hash?: string }, context: any): Promise<any> => {
            const requester: IUser = context.req.user;
            // get the target fieldId of this file
            let targetFieldId: string;
            // obtain sitesIDMarker from db
            const sitesIDMarkers = (await db.collections!.organisations_collection.find<IOrganisation>({ deleted: null }).toArray()).reduce<any>((acc, curr) => {
                if (curr.metadata?.siteIDMarker) {
                    acc[curr.metadata.siteIDMarker] = curr.shortname;
                }
                return acc;
            }, {});
            // if the description object is empty, then the file is study-level data
            // otherwise, a subjectId must be provided in the description object
            // we will check other properties in the decription object (deviceId, startDate, endDate)
            const parsedDescription = JSON.parse(args.description);
            if (!parsedDescription) {
                throw new GraphQLError('File description is invalid', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
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

            const trpcFile = await saveFile(args.file);
            return new Promise<any>((resolve, reject) => {
                (async () => {
                    try {
                        const result = await dataCore.uploadFileData(
                            requester.id,
                            args.studyId,
                            {
                                ...trpcFile, // your existing file info
                                fieldName: 'file', // You might need to adjust this based on your actual field name
                                encoding: '7bit', // or whatever your file's encoding is
                                createReadStream: () => fs.createReadStream(trpcFile.path) // Provide a method to read the file
                            },
                            targetFieldId,
                            { ...parsedDescription }
                        );
                        let fileResult = await dataCore.getFile(result.value);
                        if (!fileResult) {
                            reject(new GraphQLError('General upload error', { extensions: { code: errorCodes.UNQUALIFIED_ERROR } }));
                        }
                        fileResult = fileResult as IFile;
                        resolve({
                            id: fileResult.id,
                            uri: fileResult.uri,
                            fileName: fileResult.fileName,
                            studyId: fileResult.studyId,
                            projectId: null,
                            fileSize: fileResult.fileSize,
                            description: JSON.stringify({
                                participantId: fileResult.properties?.participantId,
                                deviceId: fileResult.properties?.deviceId,
                                startDate: fileResult.properties?.startDate,
                                endDate: fileResult.properties?.endDate
                            }),
                            uploadTime: fileResult.life.createdTime.toString(),
                            uploadedBy: fileResult.life.createdUser,
                            hash: fileResult.hash,
                            metadata: {
                                participantId: fileResult.properties?.participantId,
                                deviceId: fileResult.properties?.deviceId,
                                startDate: fileResult.properties?.startDate,
                                endDate: fileResult.properties?.endDate
                            }
                        });  // Explicitly resolve the promise with the result
                    } catch (error) {
                        reject(new GraphQLError((error as any).message, { extensions: { code: errorCodes.UNQUALIFIED_ERROR, error } }));
                    }
                })();
            });
        },
        deleteFile: async (__unused__parent: Record<string, unknown>, args: { fileId: string }, context: any): Promise<IGenericResponse> => {
            const requester: IUser = context.req.user;

            const fileMetadata = await dataCore.getFile(args.fileId);
            if (!fileMetadata) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'File does not exist.'
                });
            }
            const dataMetadata = await db.collections!.data_collection.findOne({ value: fileMetadata.id });
            if (!dataMetadata) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'Data clip does not exist.'
                });
            }
            if (fileMetadata.studyId) {
                return await dataCore.deleteData(
                    requester.id,
                    fileMetadata.studyId,
                    dataMetadata.fieldId,
                    dataMetadata.properties
                );
            } else {
                await db.collections!.files_collection.findOneAndUpdate({ id: args.fileId }, {
                    $set: {
                        'life.deletedTime': Date.now(),
                        'life.deletedUser': requester.id
                    }
                });
                return makeGenericReponse(args.fileId, true, undefined, undefined);
            }
        }
    },
    Subscription: {}
};

async function saveFile(uploadPromise: Promise<FileUpload> | PromiseLike<{ createReadStream: any; filename: any; mimetype: any; }> | { createReadStream: any; filename: any; mimetype: any; }) {
    const { createReadStream, filename, mimetype } = await uploadPromise;

    // Adjust the path to point to the uploads directory
    const uploadsPath = path.join(__dirname, '../../../../uploads');
    // Ensure the uploads directory exists
    if (!fs.existsSync(uploadsPath)) {
        fs.mkdirSync(uploadsPath, { recursive: true });
    }

    const filePath = path.join(uploadsPath, filename);
    const stream = createReadStream();

    // Save file to disk
    await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(filePath);
        stream.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
        stream.pipe(writeStream);
    });

    // Get the file size after the file has been written to the uploads directory
    const { size } = fs.statSync(filePath);

    return {
        path: filePath,
        filename,
        mimetype,
        size
    };
}