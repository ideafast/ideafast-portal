import snakeCase from 'lodash/snakeCase';
import { db } from '../database/database';

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
        await db.collections?.oidc_collection.updateOne(
            { _id },
            { $set: { payload, ...(expiresAt ? { expiresAt } : undefined) } },
            { upsert: true },
        );
    }

    async find(_id) {
        const result = await db.collections?.oidc_collection.find({ _id }).limit(1).next();

        if (!result) return undefined;
        return result;
    }

    async findByUserCode(userCode) {
        const result = await db.collections?.oidc_collection.find({ 'payload.userCode': userCode }).limit(1).next();

        if (!result) return undefined;
        return result;
    }

    async findByUid(uid) {
        const result = await db.collections?.oidc_collection.find({ 'payload.uid': uid }).limit(1).next();

        if (!result) return undefined;
        return result;
    }

    async destroy(_id) {
        await db.collections?.oidc_collection.deleteOne({ _id });
    }

    async revokeByGrantId(grantId) {
        await db.collections?.oidc_collection.deleteMany({ 'payload.grantId': grantId });
    }

    async consume(_id) {
        await db.collections?.oidc_collection.findOneAndUpdate(
            { _id },
            { $set: { 'payload.consumed': Math.floor(Date.now() / 1000) } },
        );
    }

    // This is not part of the required or supported API, all initialization should happen before
    // you pass the adapter to `new Provider`
    static async connect() {
        return db;
    }
}

