import {
    IStudy,
    IUser,
    userTypes
} from 'itmat-commons';
import { db } from '../../database/database';
import { IFile } from 'itmat-commons/dist/models/file';
import { studyResolvers } from '../resolvers/studyResolvers';

export const studyResolversV1 = {
    ...studyResolvers,
    Study: {
        ...studyResolvers.Study,
        files: async (study: IStudy, __unused__args: never, context: any): Promise<Array<IFile>> => {
            const requester: IUser = context.req.user;
            if (requester.type === userTypes.ADMIN) {
                return await db.collections!.files_collection.find({ studyId: study.id, deleted: null }).toArray();
            } else {
                // only return the latest one if duplicates; check by either fileName and description
                return (await db.collections!.files_collection.aggregate([{
                    $group: {
                        _id: {
                            description: '$description',
                            fileName: '$fileName'
                        },
                        doc: { $first: '$$ROOT' }
                    }
                }]).toArray()).map(el => el.doc);
            }
        }
    }
};
