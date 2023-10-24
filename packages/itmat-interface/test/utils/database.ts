import { v4 as uuid } from 'uuid';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setupDatabase } from '@itmat-broker/itmat-setup';


export class UtilsTest {
    public async createMockDatabase() {
        const dbName = uuid();
        const mongodb = await MongoMemoryServer.create({ instance: { dbName } });
        const connectionString = mongodb.getUri();
        await setupDatabase(connectionString, dbName);
        return mongodb;
    }
}

export const utilsTest = Object.freeze(new UtilsTest());