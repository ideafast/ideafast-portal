import { GraphQLError } from 'graphql';
import { IUser, IRole } from '@itmat-broker/itmat-types';
import { db } from '../../database/database';
import { permissionCore } from '../../core/permissionCore';
import { studyCore } from '../../core/studyCore';
import { errorCodes } from '../errors';
import { makeGenericReponse } from '../responses';

export const permissionResolvers = {

};

