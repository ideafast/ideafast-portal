import { ApolloServerErrorCode } from '@apollo/server/errors';
import { GraphQLError } from 'graphql';
import { mailer } from '../../emailer/emailer';
import { IUser, IPubkey, AccessToken, KeyPairwSignature, Signature } from '@itmat-broker/itmat-types';
//import { v4 as uuid } from 'uuid';
import mongodb from 'mongodb';
import { db } from '../../database/database';
import config from '../../utils/configManager';
import { userCore } from '../core/userCore';
import { errorCodes } from '../errors';
//import { makeGenericReponse, IGenericResponse } from '../responses';
import * as pubkeycrypto from '../../utils/pubkeycrypto';
export const pubkeyResolvers = {

};
