import { IUser, IUserWithoutToken } from '@itmat-broker/itmat-types';
import { db } from '../database/database';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../graphql/errors';

export class UserLoginUtils {
    constructor() {
        this.serialiseUser = this.serialiseUser.bind(this);
        this.deserialiseUser = this.deserialiseUser.bind(this);
    }

    public serialiseUser(user: Express.User, done: (__unused__err, __unused__id?) => void): void {
        done(null, (user as IUser).username);
    }

    public async deserialiseUser(username: string, done: (__unused__err, __unused__id?) => void): Promise<void> {
        const user = await this._getUser(username);
        done(null, user);
    }

    private async _getUser(username: string): Promise<IUserWithoutToken | null> {
        if (!db.collections) {
            throw new GraphQLError(errorCodes.DATABASE_ERROR);
        }
        return await db.collections.users_collection.findOne<IUserWithoutToken>({ deleted: null, username }, { projection: { _id: 0, deleted: 0, password: 0 } })!;
    }
}

export const userLoginUtils = Object.freeze(new UserLoginUtils());
