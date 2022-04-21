import { db } from '../database/database';
import { UserInputError } from 'apollo-server-express';

export class Account {
    static async findAccount(ctx, id) {
        const result = await db.collections!.users_collection.findOne({ deleted: null, id: id });
        if (!result) {
            throw new UserInputError('User does not exist.');
        }
        return {
            accountId: id,
            async claims() {
                return {
                    sub: id,
                    email: result.email,
                };
            },
        };
    }
}
