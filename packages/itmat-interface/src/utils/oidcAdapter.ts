import config from './configManager';

import snakeCase from 'lodash/snakeCase';
import {db} from '../database/database';


export class MongoAdapter {
    name: string;
    constructor(name) {
        this.name = snakeCase(name);
    }

    // NOTE: the payload for Session model may contain client_id as keys, make sure you do not use
    //   dots (".") in your client_id value charset.
    async upsert(_id, payload, expiresIn) {
        let expiresAt;

        if (expiresIn) {
            expiresAt = new Date(Date.now() + (expiresIn * 1000));
        }
        await db.db.collection(this.name).updateOne(
            { _id },
            { $set: { payload, ...(expiresAt ? { expiresAt } : undefined) } },
            { upsert: true },
        );
    }

    async find(_id) {
        const result = await db.db.collection(this.name).find(
            { _id },
            { payload: 1 },
        ).limit(1).next();

        if (!result) return undefined;
        return result.payload;
    }

    async findByUserCode(userCode) {
        const result = await db.db.collection(this.name).find(
            { 'payload.userCode': userCode },
            { payload: 1 },
        ).limit(1).next();

        if (!result) return undefined;
        return result.payload;
    }

    async findByUid(uid) {
        const result = await db.db.collection(this.name).find(
            { 'payload.uid': uid },
            { payload: 1 },
        ).limit(1).next();

        if (!result) return undefined;
        return result.payload;
    }

    async destroy(_id) {
        await db.db.collection(this.name).deleteOne({ _id });
    }

    async revokeByGrantId(grantId) {
        await db.db.collection(this.name).deleteMany({ 'payload.grantId': grantId });
    }

    async consume(_id) {
        await db.db.collection(this.name).findOneAndUpdate(
            { _id },
            { $set: { 'payload.consumed': Math.floor(Date.now() / 1000) } },
        );
    }

}

