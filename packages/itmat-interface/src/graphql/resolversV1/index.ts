import { fileResolversV1 } from './fileResolversV1';
import { jobResolversV1 } from './jobResolversV1';
import { permissionResolversV1 } from './permissionResolversV1';
import { queryResolversV1 } from './queryResolversV1';
import { studyResolversV1 } from './studyResolversV1';
import { userResolversV1 } from './userResolversV1';
import { organisationResolversV1 } from './organisationResolversV1';
import { pubkeyResolversV1 } from './pubkeyResolversV1';
import { logResolversV1 } from './logResolversV1';
import { constructResolvers } from '../../utils/apiVersioning';

const modulesV1 = [
    studyResolversV1,
    userResolversV1,
    queryResolversV1,
    permissionResolversV1,
    jobResolversV1,
    fileResolversV1,
    organisationResolversV1,
    pubkeyResolversV1,
    logResolversV1
];

export const resolversV1 = constructResolvers(modulesV1);
