import { userRouter } from './userProcedure';
import { docRouter } from './docProcedure';
import { configRouter } from './configProcedure';
import { studyRouter } from './studyProcedure';
import { organisationRouter } from './organisationProcedure';
import { dataRouter } from './dataProcedure';
import { driveRouter } from './driveProcedure';
import { permissionRouter } from './permissionProcedure';
import { logRouter } from './logProcedure';
export const routers = {
    user: userRouter,
    doc: docRouter,
    config: configRouter,
    study: studyRouter,
    org: organisationRouter,
    data: dataRouter,
    drive: driveRouter,
    permission: permissionRouter,
    log: logRouter
};