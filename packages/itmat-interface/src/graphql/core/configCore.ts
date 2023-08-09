import { GraphQLError } from 'graphql';
import { IField, enumDataTypes, ICategoricalOption, IValueVerifier, IGenericResponse, IData, atomicOperation, enumConfigType, defaultSettings, IOntologyTree, IOntologyRoute, IConfig } from '@itmat-broker/itmat-types';
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


export class ConfigCore {
    public async getConfig(configType: enumConfigType, key: string | null): Promise<IConfig> {
        /**
         * Get the config.
         *
         * @param configType - The type of the config..
         * @param key - The key of the config. studyid, userid, or null for system..
         *
         * @return IConfig
         */
        const config = await db.collections!.configs_collection.findOne({ 'type': configType, 'key': key, 'life.deletedTime': null });
        if (!config) {
            throw new GraphQLError('Config does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }
        return config;
    }
}

export const configCore = Object.freeze(new ConfigCore());
