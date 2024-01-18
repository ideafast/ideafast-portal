import { ApolloServerErrorCode } from '@apollo/server/errors';
import { GraphQLError } from 'graphql';
import bcrypt from 'bcrypt';
import { mailer } from '../../emailer/emailer';
import { IUser, IGenericResponse, IResetPasswordRequest, enumUserTypes, IOrganisation, enumConfigType, IConfig } from '@itmat-broker/itmat-types';
import { Logger } from '@itmat-broker/itmat-commons';
import { v4 as uuid } from 'uuid';
import config from '../../utils/configManager';
import { userCore } from '../../core/userCore';
import { errorCodes } from '../errors';
import { makeGenericReponse } from '../responses';
import QRCode from 'qrcode';
import tmp from 'tmp';
import { decryptEmail, encryptEmail, makeAESIv, makeAESKeySalt } from '../../encryption/aes';
import * as mfa from '../../utils/mfa';
import { configCore } from '../../core/configCore';

export const configResolvers = {
    Query: {
        getConfig: async (__unused__parent: Record<string, unknown>, { configType, key }: { configType: enumConfigType, key: string | null }, context: any): Promise<IConfig> => {
            /**
             * Get the config.
             *
             * @param configType - The type of the config..
             * @param key - The key of the config. studyid, userid, or null for system..
             *
             * @return IConfig
             */
            return await configCore.getConfig(configType, key, true);
        }
    }
};
