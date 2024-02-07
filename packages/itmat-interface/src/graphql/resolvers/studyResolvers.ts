import { GraphQLError } from 'graphql';
import {
    IProject,
    IStudy,
    IUser,
    IFile,
    IJob,
    IRole,
    enumUserTypes,
    IGenericResponse,
    enumDataTypes,
    enumStudyRoles
} from '@itmat-broker/itmat-types';
import { db } from '../../database/database';
import { permissionCore } from '../../core/permissionCore';
import { studyCore } from '../../core/studyCore';
import { errorCodes } from '../errors';
import { makeGenericReponse } from '../responses';
import { dataCore } from '../../core/dataCore';
import { fileCore } from '../../core/fileCore';

export const studyResolvers = {
    Query: {
        /**
         * Get the info of studies.
         *
         * @param studyId - The if of the study.
         *
         * @return Partial<IStudy>
         */
        getStudy: async (__unused__parent: Record<string, unknown>, args: Record<string, string>, context: any): Promise<IStudy | null> => {
            const requester: IUser = context.req.user;
            const studyId: string = args.studyId;

            if (studyId) {
                await permissionCore.checkOperationPermissionByUser(requester.id, studyId);
            }
            const studies: any = await studyCore.getStudiesByUser(requester.id, studyId ?? undefined);
            studies.forEach((el: { createdBy: any; life: { createdUser: any; }; }) => {
                el.createdBy = el.life.createdUser;
            });
            if (studies.length === 0) {
                throw new GraphQLError('Study does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            } else {
                return studies;
            }
        }

        /** TODO */
        // getProject: async (__unused__parent: Record<string, unknown>, args: any, context: any): Promise<Omit<IProject, 'patientMapping'> | null> => {
        //     const requester: IUser = context.req.user;
        //     const projectId: string = args.projectId;

        //     /* get project */ // defer patientMapping since it's costly and not available to all users
        //     const project = await db.collections!.projects_collection.findOne({ id: projectId, deleted: null }, { projection: { patientMapping: 0 } })!;
        //     if (!project)
        //         throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);

        //     /* check if user has permission */
        //     const hasProjectLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
        //         IPermissionManagementOptions.own,
        //         atomicOperation.READ,
        //         requester,
        //         project.studyId,
        //         projectId
        //     );

        //     const hasStudyLevelPermission = await permissionCore.userHasTheNeccessaryManagementPermission(
        //         IPermissionManagementOptions.own,
        //         atomicOperation.READ,
        //         requester,
        //         project.studyId
        //     );
        //     if (!hasStudyLevelPermission && !hasProjectLevelPermission) { throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR); }

        //     return project;
        // },


    },
    Study: {
        projects: async (): Promise<Array<IProject>> => {
            return [];
        },
        jobs: async (): Promise<Array<IJob>> => {
            return [];
        },
        roles: async (): Promise<Array<IRole>> => {
            return [];
        },
        files: async (study: IStudy, __unused__args: never, context: any): Promise<Array<IFile>> => {
            const requester: IUser = context.req.user;
            const availableDataVersions: Array<string | null> = (study.currentDataVersion === -1 ? [] : study.dataVersions.filter((__unused__el, index) => index <= study.currentDataVersion)).map(el => el.id);
            const fields = await dataCore.getStudyFields(requester.id, study.id, availableDataVersions, null);
            const filteredFieldIds = fields.filter(el => el.dataType === enumDataTypes.FILE).map(el => el.fieldId);
            const fileDataClips = await dataCore.getData(requester.id, study.id, filteredFieldIds, availableDataVersions);
            const res = await fileCore.findFiles(fileDataClips.map((el: { value: any; }) => el.value), false);
            const newFileArray: any[] = [];
            res.forEach((el: any) => {
                newFileArray.push({
                    id: el.id,
                    fileName: el.fileName,
                    studyId: study.id,
                    projectId: null,
                    fileSize: el.fileSize,
                    description: '',
                    uploadTime: el.life.createdTime,
                    uploadedBy: el.life.createdUser,
                    hash: el.hash,
                    metadata: {}
                });
            });
            return newFileArray;
        },
        subjects: async (): Promise<Array<Array<string>>> => {
            return [];
        },
        visits: async (): Promise<Array<Array<string>>> => {
            return [];
        },
        numOfRecords: async (): Promise<number[]> => {
            return [];
        }
    },
    Mutation: {
        createStudy: async (__unused__parent: Record<string, unknown>, { name, description }: { name: string, description: string, type: any }, context: any): Promise<IStudy> => {
            const requester: IUser = context.req.user;

            /* check privileges */
            if (requester.type !== enumUserTypes.ADMIN) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }

            /* create study */
            const study = await studyCore.createStudy(requester.id, name, description);
            return study as IStudy;
        },
        editStudy: async (__unused__parent: Record<string, unknown>, { studyId, description }: { studyId: string, description: string }, context: any): Promise<IStudy> => {
            const requester: IUser = context.req.user;

            /* check privileges */
            if (requester.type !== enumUserTypes.ADMIN) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }

            /* create study */
            const study = await studyCore.editStudy(requester.id, studyId, undefined, description);
            return study as IStudy;
        },
        deleteStudy: async (__unused__parent: Record<string, unknown>, { studyId }: { studyId: string }, context: any): Promise<IGenericResponse> => {
            const requester: IUser = context.req.user;

            /* check privileges */
            if (requester.type !== enumUserTypes.ADMIN) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }

            const study = await db.collections!.studies_collection.findOne({ id: studyId, deleted: null });

            if (study) {
                /* delete study */
                await studyCore.deleteStudy(requester.id, studyId);
            } else {
                throw new GraphQLError(errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY);
            }

            return makeGenericReponse(studyId);
        },
        createNewDataVersion: async (__unused__parent: Record<string, unknown>, { studyId, dataVersion, tag }: { studyId: string, dataVersion: string, tag: string }, context: any): Promise<any> => {
            const requester: IUser = context.req.user;
            await permissionCore.checkOperationPermissionByUser(requester.id,
                studyId,
                enumStudyRoles.STUDY_MANAGER
            );
            const res = await dataCore.createDataVersion(
                requester.id,
                studyId,
                dataVersion,
                tag
            );

            return {
                id: res.id,
                version: res.version,
                tag: res.tag,
                updateDate: res.life.createdTime,
                contentId: res.contentId
            };
        },
        setDataversionAsCurrent: async (__unused__parent: Record<string, unknown>, { studyId, dataVersionId }: { studyId: string, dataVersionId: string }, context: any): Promise<IStudy> => {
            const requester: IUser = context.req.user;
            await permissionCore.checkOperationPermissionByUser(requester.id, studyId, enumStudyRoles.STUDY_MANAGER);
            return await dataCore.setStudyDataVersion(
                studyId,
                dataVersionId
            );
        }
    },
    Subscription: {}
};