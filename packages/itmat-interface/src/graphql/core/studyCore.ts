import { GraphQLError } from 'graphql';
import { IFile, IUser, IProject, IStudy, IStudyDataVersion, IDataClip, IRole, deviceTypes, IOrganisation, IGenericResponse, enumGroupNodeTypes, IField, IGroupNode } from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../../database/database';
import { errorCodes } from '../errors';
import { permissionCore } from './permissionCore';
import { validate } from '@ideafast/idgen';
import type { MatchKeysAndValues } from 'mongodb';
import { objStore } from '../../objStore/objStore';
import { FileUpload } from 'graphql-upload-minimal';
import crypto from 'crypto';
import { fileSizeLimit } from '../../utils/definition';
import { makeGenericReponse } from '../responses';

export class StudyCore {
    // constructor(private readonly localPermissionCore: PermissionCore) { }

    public async getStudy(studyId: string): Promise<IStudy> {
        /**
         * Get the info of a study.
         *
         * @param studyId - The id of the study.
         *
         * @return IStudy - The object of IStudy.
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        return study;
    }

    public async createStudy(requester: string, studyName: string, description: string | null): Promise<IStudy> {
        /**
         * Create a study.
         *
         * @param requester - The id of the requester.
         * @param studyName - The name of the study.
         * @param description - The description of the study.
         *
         * @return IStudy - The object of the IStudy.
         */
        const study = await db.collections!.studies_collection.findOne({ 'name': studyName.toLowerCase(), 'life.deletedTime': null });
        if (study) {
            throw new GraphQLError('Study already exists (duplicates are case-insensitive).', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const studyEntry: IStudy = {
            id: uuid(),
            name: studyName,
            currentDataVersion: -1,
            dataVersions: [],
            description: description,
            groupList: [{
                id: uuid(),
                name: studyName,
                type: enumGroupNodeTypes.GROUP,
                description: description,
                parent: null,
                children: [],
                life: {
                    createdTime: Date.now(),
                    createdUser: requester,
                    deletedTime: null,
                    deletedUser: null
                },
                metadata: {}
            }],
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };
        const res = await db.collections!.studies_collection.insertOne(studyEntry);
        if (res.acknowledged) {
            return studyEntry;
        } else {
            throw new GraphQLError('Database error.', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async editStudy(studyId: string, name: string, description: string): Promise<IStudy> {
        /**
         * Edit the description of the study.
         *
         * @param studyId - The id of the study.
         * @param name - The name of the study.
         * @param description - The description of the study.
         *
         * @return IStudy - The object of IStudy
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const res = await db.collections!.studies_collection.findOneAndUpdate({ id: studyId }, { $set: { name: name, description: description } }, { returnDocument: 'after' });
        if (res.ok === 1 && res.value) {
            return res.value;
        } else {
            throw new GraphQLError('Database error.', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async deleteStudy(requester: string, studyId: string): Promise<IGenericResponse> {
        /**
         * Delete a study.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         *
         * @return IGenericResponse - The obejct of IGenericResponse.
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
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
            await db.collections!.files_collection.updateMany({ studyId, deleted: null }, { $set: { deleted: timestamp } });

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

    public async createDataVersion(requester: string, studyId: string, tag: string, dataVersion: string): Promise<IGenericResponse> {
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

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        if (study.dataVersions.map(el => el.version).includes(dataVersion)) {
            throw new GraphQLError('This version has been used.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const newDataVersionId = uuid();
        const newContentId = uuid();

        const session = db.client!.startSession();
        session.startTransaction();
        try {
            // update data
            const resData = await db.collections!.data_collection.updateMany({
                m_studyId: studyId,
                m_versionId: null
            }, {
                $set: {
                    m_versionId: newDataVersionId
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

            if (resData.modifiedCount === 0 && resField.modifiedCount === 0) {
                return makeGenericReponse(undefined, false, undefined, 'Nothing to update.');
            }

            // update permissions based on roles
            const roles = await db.collections!.roles_collection.find<IRole>({ 'studyId': studyId, 'life.deletedTime': null }).toArray();
            for (const role of roles) {
                const filters: Record<string, string[]> = {
                    subjectIds: role.permissions.data?.subjectIds || [],
                    visitIds: role.permissions.data?.visitIds || [],
                    fieldIds: role.permissions.data?.fieldIds || []
                };
                const tag = `metadata.${'role:'.concat(role.id)}`;
                // no need to add role to old data, which should be updated on role changes
                await db.collections!.data_collection.updateMany({
                    m_studyId: studyId,
                    m_versionId: newDataVersionId,
                    m_subjectId: { $in: filters.subjectIds.map((el: string) => new RegExp(el)) },
                    m_visitId: { $in: filters.visitIds.map((el: string) => new RegExp(el)) },
                    m_fieldId: { $in: filters.fieldIds.map((el: string) => new RegExp(el)) }
                }, {
                    $set: { [tag]: true }
                });
                await db.collections!.data_collection.updateMany({
                    m_studyId: studyId,
                    m_versionId: newDataVersionId,
                    $or: [
                        { m_subjectId: { $nin: filters.subjectIds.map((el: string) => new RegExp(el)) } },
                        { m_visitId: { $nin: filters.visitIds.map((el: string) => new RegExp(el)) } },
                        { m_fieldId: { $nin: filters.fieldIds.map((el: string) => new RegExp(el)) } }
                    ]
                }, {
                    $set: { [tag]: false }
                });
                await db.collections!.field_dictionary_collection.updateMany({
                    studyId: studyId,
                    dataVersion: newDataVersionId,
                    fieldId: { $in: filters.fieldIds.map((el: string) => new RegExp(el)) }
                }, {
                    $set: { [tag as any]: true }
                });
                await db.collections!.field_dictionary_collection.updateMany({
                    studyId: studyId,
                    dataVersion: newDataVersionId,
                    fieldId: { $nin: filters.fieldIds.map((el: string) => new RegExp(el)) }
                }, {
                    $set: { [tag as any]: false }
                });
            }

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
            await session.commitTransaction();
            session.endSession();
            return makeGenericReponse(newDataVersionId, true, undefined, `Data version ${dataVersion} has been deleted.`);
        } catch (error) {
            // If an error occurred, abort the whole transaction and
            // undo any changes that might have happened
            await session.abortTransaction();
            session.endSession();
            throw new GraphQLError(`${JSON.stringify(error)}`, { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async setDataVersion(studyId: string, dataVersionId: string): Promise<IGenericResponse> {
        /**
         * Set a data version as the current data version of a  study.
         *
         * @param studyId - The id of the study.
         * @param dataVersionId - The id of the data version.
         *
         * @return IGenreicResponse
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null });
        if (!study) {
            throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        if (!study.dataVersions.map(el => el.id).includes(dataVersionId)) {
            throw new GraphQLError('Version does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        await db.collections!.studies_collection.findOneAndUpdate({ 'id': studyId, 'life.deletedTime': null }, {
            $set: { currentDataVersion: study.dataVersions.map(el => el.id).indexOf(dataVersionId) }
        });

        return makeGenericReponse(dataVersionId, true, undefined, `Data version ${dataVersionId} has been set as the current data version.`);
    }

    public async createStudyGroup(requester: string, studyId: string, groupName: string, groupType: enumGroupNodeTypes, description: string | null, parentGroupId: string): Promise<IGroupNode> {
        /**
         * Create a study group.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param groupName - The name of the study.
         * @param groupType - The type of the group.
         * @param description - The description of the group.
         * @param parentGroupId - The id of the parent group.
         *
         * @return IGroupNode - The object of IGroupNode
         */

        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null, 'groupList.id': parentGroupId });
        if (!study) {
            throw new GraphQLError('Study or parent node does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const groupEntry: IGroupNode = {
            id: uuid(),
            name: groupName,
            type: groupType,
            description: description,
            parent: parentGroupId,
            children: [],
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };

        await db.collections!.studies_collection.findOneAndUpdate({ id: studyId }, {
            $push: { groupList: groupEntry }
        });

        return groupEntry;
    }

    public async editStudyGroup(studyId: string, groupId: string, description: string | null, targetParentId: string | null, children: string[] | null): Promise<IGenericResponse> {
        /**
         * Edit a group.
         *
         * @param studyId - The id of the study.
         * @param groupId - The id of the group.
         * @param description - The new description of the group.
         * @param targetParentId - The id of the target parent.
         * @param children - The ids of the children groups of the group.
         *
         * @return IGenericResponse - The object of IGenericRespnse
         */
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null, 'groupList.id': groupId });
        if (!study) {
            throw new GraphQLError('Study or group does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        if (targetParentId) {
            const targetParentGroup: IGroupNode | null = study.groupList.filter(el => el.id === targetParentId)[0];
            if (!targetParentGroup) {
                throw new GraphQLError('Target group does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        }

        if (children) {
            const groupNodeIds: string[] = study.groupList.map(el => el.id);
            if (children.some(el => !groupNodeIds.includes(el))) {
                throw new GraphQLError('Children do not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        }

        const thisGroup: IGroupNode = study.groupList.filter(el => el.id === groupId)[0];

        await db.collections!.studies_collection.findOneAndUpdate({ 'id': studyId, 'groupList.id': groupId }, {
            $set: {
                'groupList.$.description': description ?? thisGroup.description,
                'groupList.$.targetParentId': targetParentId ?? thisGroup.parent,
                'groupList.$.children': children ?? thisGroup.children
            }
        });

        return makeGenericReponse(groupId, true, undefined, `Group ${groupId}'s description has been edited.`);
    }

    public async deleteStudyGroup(requester: string, studyId: string, groupId: string): Promise<IGenericResponse> {
        /**
         * Delete a group of a study.
         *
         * @param requester - The id of the requester.
         * @param studyId - The id of the study.
         * @param groupId - The id of the group.
         *
         * @return IGenericResponse - The object of IGenericResponse.
         */
        const study = await db.collections!.studies_collection.findOne({ 'id': studyId, 'life.deletedTime': null, 'groupList.id': groupId });
        if (!study) {
            throw new GraphQLError('Study or group does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        await db.collections!.studies_collection.findOneAndUpdate({ 'id': studyId, 'groupList.id': groupId }, {
            $set: {
                'groupList.$.life.deletedUser': requester,
                'groupList.$.life.deletedTime': Date.now()
            }
        });

        return makeGenericReponse(groupId, true, undefined, `Group ${groupId} of study ${studyId} has been deleted.`);
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
