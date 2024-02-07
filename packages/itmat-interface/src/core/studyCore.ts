import { IFile, IStudy, IStudyDataVersion, IGenericResponse, enumFileTypes, enumFileCategories, enumConfigType, enumUserTypes } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../database/database';
import { FileUpload } from 'graphql-upload-minimal';
import { makeGenericReponse } from '../graphql/responses';
import { fileCore } from './fileCore';
import { TRPCError } from '@trpc/server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';
import { enumCacheStatus } from 'packages/itmat-types/src/types/cache';

export class StudyCore {
    // constructor(private readonly localPermissionCore: PermissionCore) { }
    /**
     * Get the info of a study.
     *
     * @param studyId - The id of the study.
     *
     * @return IStudy - The object of IStudy.
     */
    public async getStudies(studyId: string | null): Promise<IStudy[]> {
        const query: any = { 'life.deletedTime': null };
        if (studyId) {
            query.id = studyId;
        }
        const studies = await db.collections!.studies_collection.find(query).toArray();
        if (studies.length === 0) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study does not exist.'
            });
        }

        return studies;
    }

    /**
     * Get the info of a study.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     *
     * @return IStudy - The object of IStudy.
     */
    public async getStudiesByUser(requester: string, studyId?: string): Promise<IStudy[]> {
        const user = await db.collections!.users_collection.findOne({ 'id': requester, 'life.deletedTime': null });
        if (!user) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'User does not exist.'
            });
        }
        const query: any = { 'life.deletedTime': null };
        if (studyId) {
            query.id = studyId;
        } else {
            if (user.type !== enumUserTypes.ADMIN) {
                const studyIds: string[] = (await db.collections!.roles_collection.find({ 'users': requester, 'life.deletedTime': null }).toArray()).map(el => el.studyId);
                query.id = { $in: studyIds };
            }
        }
        const studies = await db.collections!.studies_collection.find(query).toArray();
        if (studyId && studies.length === 0) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study does not exist.'
            });
        }

        return studies;
    }

    /**
     * Create a study.
     *
     * @param requester - The id of the requester.
     * @param studyName - The name of the study.
     * @param description - The description of the study.
     *
     * @return IStudy - The object of the IStudy.
     */
    public async createStudy(requester: string, studyName: string, description?: string, profile?: FileUpload): Promise<Partial<IStudy>> {
        const studyId = uuid();
        const existing = await db.collections!.studies_collection.findOne({ 'name': { $regex: studyName, $options: 'i' }, 'life.deletedTime': null });
        if (existing) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study name already used.'
            });
        }

        const studyEntry: IStudy = {
            id: studyId,
            name: studyName,
            currentDataVersion: -1,
            dataVersions: [],
            description: description ?? '',
            profile: null,
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {},
            webLayout: []
        };
        await db.collections!.studies_collection.insertOne(studyEntry);
        try {
            let fileEntry: IFile | null = null;
            if (profile) {
                if (!Object.keys(enumFileTypes).includes((profile?.filename?.split('.').pop() || '').toUpperCase())) {
                    throw new TRPCError({
                        code: enumTRPCErrorCodes.BAD_REQUEST,
                        message: 'File type not supported.'
                    });
                }
                fileEntry = await fileCore.uploadFile(requester, studyId, null, profile, undefined, enumFileTypes[(profile.filename.split('.').pop() || '').toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.STUDY_PROFILE_FILE, []);
                await db.collections!.studies_collection.findOneAndUpdate({ id: studyId }, {
                    $set: {
                        profile: fileEntry.id
                    }
                }, {
                    returnDocument: 'after'
                });
                return {
                    ...studyEntry,
                    profile: fileEntry.id
                };
            }
        } catch (error) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Profile is broken, but study has been created.'
            });
        }
        return studyEntry;
    }

    /**
     * Edit the description of the study.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     * @param name - The name of the study.
     * @param description - The description of the study.
     * @param profile - The profile of the study.
     *
     * @return IStudy - The object of IStudy
     */
    public async editStudy(requester: string, studyId: string, name?: string, description?: string, profile?: FileUpload): Promise<Partial<IStudy>> {
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study does not exist.'
            });
        }

        const setObj: any = {};
        let fileEntry;
        if (profile) {
            try {
                if (!Object.keys(enumFileTypes).includes((profile?.filename?.split('.').pop() || '').toUpperCase())) {
                    throw new TRPCError({
                        code: enumTRPCErrorCodes.BAD_REQUEST,
                        message: 'File format not supported'
                    });
                }
                fileEntry = await fileCore.uploadFile(requester, studyId, null, profile, undefined, enumFileTypes[(profile.filename.split('.').pop() || '').toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.STUDY_PROFILE_FILE, []);
                setObj.profile = fileEntry.id;
            } catch (error) {
                setObj.profile = study.profile;
            }
        }

        if (name) {
            setObj.name = name;
        }
        if (description) {
            setObj.description = description;
        }
        const response = await db.collections!.studies_collection.findOneAndUpdate({ id: studyId }, {
            $set: setObj
        }, {
            returnDocument: 'after'
        });
        return response.value as Partial<IStudy>;

    }
    /**
     * Delete a study.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     *
     * @return IGenericResponse - The obejct of IGenericResponse.
     */
    public async deleteStudy(requester: string, studyId: string): Promise<IGenericResponse> {
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study does not exist.'
            });
        }

        const session = db.client!.startSession();
        session.startTransaction();

        const timestamp = new Date().valueOf();
        try {
            /* delete the study */
            await db.collections!.studies_collection.findOneAndUpdate({ 'id': studyId, 'life.deletedTime': null }, { $set: { 'life.deletedTime': timestamp, 'life.deletedUser': requester } });

            /* delete all projects related to the study */
            await db.collections!.projects_collection.updateMany({ 'studyId': studyId, 'life.deletedTime': null }, { $set: { 'life.deletedTime': timestamp, 'life.deletedUser': requester } });

            /* delete all roles related to the study */
            // await this.localPermissionCore.removeRoleFromStudyOrProject({ studyId });

            /* delete all files belong to the study*/
            await db.collections!.files_collection.updateMany({ 'studyId': studyId, 'life.deletedTime': null }, { $set: { 'life.deletedTime': timestamp, 'life.deletedUser': requester } });

            /* delete all fields belong to the study*/
            await db.collections!.field_dictionary_collection.updateMany({ 'studyId': studyId, 'life.deletedTime': null }, { $set: { 'life.deletedTime': timestamp, 'life.deletedUser': requester } });

            /* delete all data belong to the study*/
            await db.collections!.data_collection.updateMany({ 'studyId': studyId, 'life.deletedTime': null }, { $set: { 'life.deletedTime': timestamp, 'life.deletedUser': requester } });

            /* delete all config belong to the study*/
            await db.collections!.configs_collection.updateMany({ 'type': enumConfigType.STUDYCONFIG, 'key': studyId, 'life.deletedTime': null }, { $set: { 'life.deletedTime': timestamp, 'life.deletedUser': requester } });

            await session.commitTransaction();
            session.endSession();
            return makeGenericReponse(studyId, true, undefined, `Study ${study.name} has been deleted.`);
        } catch (error) {
            // If an error occurred, abort the whole transaction and
            // undo any changes that might have happened
            await session.abortTransaction();
            session.endSession();
            throw error; // Rethrow so calling function sees error
        }
    }
    /**
     * Create a new data version of the study.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     * @param tag - The tag of the study.
     * @param dataVersion - The new version of the study. Use float number.
     *
     * @return IGenericResponse - The object of IGenericResponse.
     */
    public async createDataVersion(requester: string, studyId: string, tag: string, dataVersion: string): Promise<IStudyDataVersion> {
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study does not exist.'
            });
        }

        const decimalRegex = /^[0-9]+(\.[0-9]+)?$/;
        if (!decimalRegex.test(dataVersion)) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Version must be a float number.'
            });
        }

        if (study.dataVersions.map(el => el.version).includes(dataVersion)) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Version has been used.'
            });
        }

        const newDataVersionId = uuid();
        const newContentId = uuid();


        // update data
        const resData = await db.collections!.data_collection.updateMany({
            studyId: studyId,
            dataVersion: null
        }, {
            $set: {
                dataVersion: newDataVersionId
            }
        });
        // update field
        const resField = await db.collections!.field_dictionary_collection.updateMany({
            studyId: studyId,
            dataVersion: null
        }, {
            $set: {
                dataVersion: newDataVersionId
            }
        });
        // invalidate hash
        await db.collections!.cache_collection.updateMany({
            'keys.studyId': studyId
        }, {
            $set: {
                status: enumCacheStatus.OUTDATED
            }
        });

        // TODO: ontologies

        if (resData.modifiedCount === 0 && resField.modifiedCount === 0) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Nothing to update.'
            });
        }

        // update permissions based on roles
        // const roles = await db.collections!.roles_collection.find<IRole>({ 'studyId': studyId, 'life.deletedTime': null }).toArray();
        // for (const role of roles) {
        //     const tag = `metadata.${'role:'.concat(role.id)}`;
        //     const filters: any = {};

        //     const filters: Record<string, string[]> = {
        //         subjectIds: role.permissions.data?.subjectIds || [],
        //         visitIds: role.permissions.data?.visitIds || [],
        //         fieldIds: role.permissions.data?.fieldIds || []
        //     };
        //     // no need to add role to old data, which should be updated on role changes
        //     await db.collections!.data_collection.updateMany({
        //         m_studyId: studyId,
        //         m_versionId: newDataVersionId,
        //         m_subjectId: { $in: filters.subjectIds.map((el: string) => new RegExp(el)) },
        //         m_visitId: { $in: filters.visitIds.map((el: string) => new RegExp(el)) },
        //         m_fieldId: { $in: filters.fieldIds.map((el: string) => new RegExp(el)) }
        //     }, {
        //         $set: { [tag]: true }
        //     });
        //     await db.collections!.data_collection.updateMany({
        //         m_studyId: studyId,
        //         m_versionId: newDataVersionId,
        //         $or: [
        //             { m_subjectId: { $nin: filters.subjectIds.map((el: string) => new RegExp(el)) } },
        //             { m_visitId: { $nin: filters.visitIds.map((el: string) => new RegExp(el)) } },
        //             { m_fieldId: { $nin: filters.fieldIds.map((el: string) => new RegExp(el)) } }
        //         ]
        //     }, {
        //         $set: { [tag]: false }
        //     });
        //     await db.collections!.field_dictionary_collection.updateMany({
        //         studyId: studyId,
        //         dataVersion: newDataVersionId,
        //         fieldId: { $in: filters.fieldIds.map((el: string) => new RegExp(el)) }
        //     }, {
        //         $set: { [tag as any]: true }
        //     });
        //     await db.collections!.field_dictionary_collection.updateMany({
        //         studyId: studyId,
        //         dataVersion: newDataVersionId,
        //         fieldId: { $nin: filters.fieldIds.map((el: string) => new RegExp(el)) }
        //     }, {
        //         $set: { [tag as any]: false }
        //     });
        // }

        // insert a new version into study
        const newDataVersion: IStudyDataVersion = {
            id: newDataVersionId,
            contentId: newContentId, // same content = same id - used in reverting data, version control
            version: dataVersion,
            tag: tag,
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };
        await db.collections!.studies_collection.updateOne({ id: studyId }, {
            $push: { dataVersions: newDataVersion },
            $inc: {
                currentDataVersion: 1
            }
        });
        return newDataVersion;
    }

    /**
     * Set a data version as the current data version of a  study.
     *
     * @param studyId - The id of the study.
     * @param dataVersionId - The id of the data version.
     *
     * @return IGenreicResponse
     */
    public async setDataVersion(studyId: string, dataVersionId: string): Promise<IGenericResponse> {
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Study does not exist.'
            });
        }

        if (!study.dataVersions.map(el => el.id).includes(dataVersionId)) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Data version does not exist.'
            });
        }

        await db.collections!.studies_collection.findOneAndUpdate({ 'id': studyId, 'life.deletedTime': null }, {
            $set: { currentDataVersion: study.dataVersions.map(el => el.id).indexOf(dataVersionId) }
        });

        return makeGenericReponse(dataVersionId, true, undefined, `Data version ${dataVersionId} has been set as the current data version.`);
    }


    /** TODO */
    // public async createProjectForStudy(requester: string, studyId: string, projectName: string): Promise<IProject> {
    //     /**
    //      * Create a project for a study.
    //      *
    //      * @param requester - The id of the requester.
    //      * @param studyId - The id of the study.
    //      * @param projectName - The name of the project.
    //      *
    //      * @return IProject - The object of IProject.
    //      */

    //     // const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
    //     // if (!study) {
    //     //     throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
    //     // }

    //     // const project: IProject = {
    //     //     id: uuid(),
    //     //     studyId,
    //     //     createdBy: requestedBy,
    //     //     name: projectName,
    //     //     patientMapping: {},
    //     //     lastModified: new Date().valueOf(),
    //     //     deleted: null,
    //     //     metadata: {}
    //     // };

    //     // const getListOfPatientsResult = await db.collections!.data_collection.aggregate([
    //     //     { $match: { m_studyId: studyId } },
    //     //     { $group: { _id: null, array: { $addToSet: '$m_subjectId' } } },
    //     //     { $project: { array: 1 } }
    //     // ]).toArray();

    //     // if (getListOfPatientsResult === null || getListOfPatientsResult === undefined) {
    //     //     throw new GraphQLError('Cannot get list of patients', { extensions: { code: errorCodes.DATABASE_ERROR } });
    //     // }

    //     // if (getListOfPatientsResult[0] !== undefined) {
    //     //     project.patientMapping = this.createPatientIdMapping(getListOfPatientsResult[0].array);
    //     // }

    //     // await db.collections!.projects_collection.insertOne(project);
    //     // return project;
    // }

    /** TODO */
    // public async deleteProject(projectId: string): Promise<void> {
    //     const timestamp = new Date().valueOf();

    //     /* delete all projects related to the study */
    //     await db.collections!.projects_collection.findOneAndUpdate({ id: projectId, deleted: null }, { $set: { lastModified: timestamp, deleted: timestamp } }, { returnDocument: 'after' });

    //     /* delete all roles related to the study */
    //     await this.localPermissionCore.removeRoleFromStudyOrProject({ projectId });
    // }

    /** TODO */
    // private createPatientIdMapping(listOfPatientId: string[], prefix?: string): { [originalPatientId: string]: string } {
    //     let rangeArray: Array<string | number> = [...Array.from(listOfPatientId.keys())];
    //     if (prefix === undefined) {
    //         prefix = uuid().substring(0, 10);
    //     }
    //     rangeArray = rangeArray.map((e) => `${prefix}${e} `);
    //     rangeArray = this.shuffle(rangeArray);
    //     const mapping: { [originalPatientId: string]: string } = {};
    //     for (let i = 0, length = listOfPatientId.length; i < length; i++) {
    //         mapping[listOfPatientId[i]] = (rangeArray as string[])[i];
    //     }
    //     return mapping;

    // }

    /** TODO */
    // private shuffle(array: Array<number | string>) {  // source: Fisher–Yates Shuffle; https://bost.ocks.org/mike/shuffle/
    //     let currentIndex = array.length;
    //     let temporaryValue: string | number;
    //     let randomIndex: number;

    //     // While there remain elements to shuffle...
    //     while (0 !== currentIndex) {

    //         // Pick a remaining element...
    //         randomIndex = Math.floor(Math.random() * currentIndex);
    //         currentIndex -= 1;

    //         // And swap it with the current element.
    //         temporaryValue = array[currentIndex];
    //         array[currentIndex] = array[randomIndex];
    //         array[randomIndex] = temporaryValue;
    //     }

    //     return array;
    // }
}

export const studyCore = Object.freeze(new StudyCore());
