import { IUser, IRole, enumStudyRoles, IDataPermission, IGenericResponse } from '@itmat-broker/itmat-types';
import { permissionCore } from '../../core/permissionCore';

export const permissionResolvers = {
    Mutation: {
        addRole: async (__unused__parent: Record<string, unknown>, args: { studyId: string, projectId?: string, roleName: string }, context: any): Promise<any> => {
            const requester: IUser = context.req.user;
            const res = await permissionCore.createRole(
                requester.id,
                args.studyId,
                args.roleName,
                '',
                [],
                enumStudyRoles.STUDY_USER
            );
            return {
                id: res.id,
                name: res.name,
                studyId: res.studyId,
                projectId: null,
                description: res.description,
                permissions: {
                    data: {
                        subjectIds: (() => {
                            if (res.dataPermissions[0]?.dataProperties) {
                                return res.dataPermissions[0].dataProperties['Participant ID'][0];
                            } else {
                                return [];
                            }
                        })(),
                        visitIds: (() => {
                            if (res.dataPermissions[0]?.dataProperties) {
                                return res.dataPermissions[0].dataProperties['Visit ID'][0];
                            } else {
                                return [];
                            }
                        })(),
                        fieldIds: (() => {
                            if (res.dataPermissions[0]) {
                                return res.dataPermissions[0].fields;
                            } else {
                                return [];
                            }
                        })(),
                        hasVersioned: (() => {
                            if (res.dataPermissions[0]) {
                                return res.dataPermissions[0].includeUnVersioned;
                            } else {
                                return false;
                            }
                        })(),
                        operations: (() => {
                            if (!res.dataPermissions[0]?.permission) {
                                return [];
                            }
                            switch (res.dataPermissions[0].permission) {
                                case 0: {
                                    return [];
                                }
                                case 1: {
                                    return ['DELETE'];
                                }
                                case 2: {
                                    return ['WRITE'];
                                }
                                case 3: {
                                    return ['WRITE', 'DELETE'];
                                }
                                case 4: {
                                    return ['READ'];
                                }
                                case 5: {
                                    return ['READ', 'DELETE'];
                                }
                                case 6: {
                                    return ['READ', 'WRITE'];
                                    break;
                                }
                                case 7: {
                                    return ['READ', 'WRITE', 'DELETE'];
                                }
                                default: {
                                    return [];
                                }
                            }
                            return [];
                        })(),
                        filters: [

                        ]
                    },
                    manage: {
                        own: [
                            'READ',
                            'WRITE'
                        ],
                        role: [

                        ],
                        job: [

                        ],
                        queries: [

                        ],
                        ontologyTrees: [
                            'READ'
                        ]
                    }
                },
                users: res.users.map(el => { el; })
            };
        },
        editRole: async (__unused__parent: Record<string, unknown>, args: { roleId: string, name?: string, description?: string, userChanges?: { add: string[], remove: string[] }, permissionChanges?: any }): Promise<IGenericResponse> => {
            const role: IRole = (await permissionCore.getRoles(undefined, args.roleId))[0];
            let users: string[] = [...role.users];
            if (args.userChanges) {
                args.userChanges.add.forEach(el => users.push(el));
                const removeSet = new Set(args.userChanges.remove);
                users = users.filter(el => !removeSet.has(el));
            }
            const dataPermissions: IDataPermission[] = [];
            if (args.permissionChanges) {
                dataPermissions.push({
                    fields: args.permissionChanges.data.fieldIds,
                    dataProperties: {
                        'Participant ID': args.permissionChanges.data.subjectIds,
                        'Visit ID': args.permissionChanges.data.visitIds
                    },
                    includeUnVersioned: args.permissionChanges.data.hasVersioned,
                    permission: parseInt(`${args.permissionChanges.data.operations.includes('READ') ? '1' : '0'}${args.permissionChanges.data.operations.includes('WRITE') ? '1' : '0'}${args.permissionChanges.data.operations.includes('DELETE') ? '1' : '0'}`, 2)
                });
            }
            return await permissionCore.editRole(
                args.roleId,
                args.name,
                args.description,
                dataPermissions,
                undefined,
                users,
                undefined
            );
        },
        removeRole: async (__unused__parent: Record<string, unknown>, args: { roleId: string }, context: any): Promise<IGenericResponse> => {
            const requester: IUser = context.req.user;
            return await permissionCore.deleteRole(
                requester.id,
                args.roleId
            );
        }
    }
};

