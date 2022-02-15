import { fileResolvers } from './fileResolvers';
import { jobResolvers } from './jobResolvers';
import { permissionResolvers } from './permissionResolvers';
import { queryResolvers } from './queryResolvers';
import { studyResolvers } from './studyResolvers';
import { userResolvers } from './userResolvers';
import { organisationResolvers } from './organisationResolvers';
import { pubkeyResolvers } from './pubkeyResolvers';
import { logResolvers } from './logResolvers';
import { standardizationResolvers } from './standardizationResolvers';
import { constructResolvers } from '../../utils/apiVersioning';

const modules = [
    studyResolvers,
    userResolvers,
    queryResolvers,
    permissionResolvers,
    jobResolvers,
    fileResolvers,
    organisationResolvers,
    pubkeyResolvers,
    logResolvers,
    standardizationResolvers
];

export const resolvers = constructResolvers(modules);
