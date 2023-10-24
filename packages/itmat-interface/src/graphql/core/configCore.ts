import { GraphQLError } from 'graphql';
import { defaultSettings, enumConfigType, enumReservedDefs, IConfig, ISystemConfig } from '@itmat-broker/itmat-types';
import { db } from '../../database/database';
import { errorCodes } from '../errors';
import { v4 as uuid } from 'uuid';

export class ConfigCore {
    public async getConfig(configType: enumConfigType, key: string | null, useDefault: boolean): Promise<IConfig> {
        /**
         * Get the config.
         *
         * @param configType - The type of the config..
         * @param key - The key of the config. studyid, userid, or null for system.
         * @param useDefault - Whether to use the default config if not found.
         *
         * @return IConfig
         */
        const config = await db.collections!.configs_collection.findOne({ 'type': configType, 'key': key, 'life.deletedTime': null });
        if (!config) {
            if (useDefault) {
                return {
                    id: uuid(),
                    type: configType,
                    key: key,
                    life: {
                        createdTime: Date.now(),
                        createdUser: enumReservedDefs.SYSTEMAGENT,
                        deletedTime: null,
                        deletedUser: null
                    },
                    metadata: {},
                    properties: defaultSettings.systemConfig
                };
            } else {
                throw new GraphQLError('Config does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        }
        return config;
    }
}

export const configCore = Object.freeze(new ConfigCore());
