/* eslint-disable @nx/enforce-module-boundaries */
import { IJob } from '@itmat-broker/itmat-types';
import { JobHandler } from './jobHandlerInterface';
import { initTRPC } from '@trpc/server';
import { userRouter } from 'packages/itmat-interface/src/tRPC/procedures/userProcedure';
import { docRouter } from 'packages/itmat-interface/src/tRPC/procedures/docProcedure';
import { configRouter } from 'packages/itmat-interface/src/tRPC/procedures/configProcedure';
import { studyRouter } from 'packages/itmat-interface/src/tRPC/procedures/studyProcedure';
import { organisationRouter } from 'packages/itmat-interface/src/tRPC/procedures/organisationProcedure';
import { dataRouter } from 'packages/itmat-interface/src/tRPC/procedures/dataProcedure';
import { driveRouter } from 'packages/itmat-interface/src/tRPC/procedures/driveProcedure';
import { permissionRouter } from 'packages/itmat-interface/src/tRPC/procedures/permissionProcedure';
import { logRouter } from 'packages/itmat-interface/src/tRPC/procedures/logProcedure';
import { jobRouter } from 'packages/itmat-interface/src/tRPC/procedures/jobProcedure';
import { domainRouter } from 'packages/itmat-interface/src/tRPC/procedures/domainProcedure';

type ProcedureCaller = {
    [key: string]: (input: any) => Promise<any>;
};

type TRPCCaller = {
    user: ProcedureCaller;
    doc: ProcedureCaller;
    config: ProcedureCaller;
    study: ProcedureCaller;
    org: ProcedureCaller;
    data: ProcedureCaller;
    drive: ProcedureCaller;
    permission: ProcedureCaller;
    log: ProcedureCaller;
    job: ProcedureCaller;
};
export class APIHandler extends JobHandler {
    private caller: TRPCCaller;
    private router;
    private t;

    constructor() {
        super();
        this.t = initTRPC.create();
        this.router = this.t.router({
            user: userRouter,
            doc: docRouter,
            config: configRouter,
            study: studyRouter,
            org: organisationRouter,
            data: dataRouter,
            drive: driveRouter,
            permission: permissionRouter,
            log: logRouter,
            job: jobRouter,
            domain: domainRouter
        });
        this.caller = this.router.createCaller({});
    }

    public async getInstance(): Promise<JobHandler> {
        return new APIHandler();
    }

    public async execute(document: IJob): Promise<any> {
        try {
            if (!document.executor) {
                return { error: true, response: 'No path found.' };
            }
            const [routerName, procedureName] = document.executor.path.split('.');
            const result = await this.caller[routerName as keyof TRPCCaller][procedureName as keyof ProcedureCaller](document.parameters);
            return { error: null, response: result };
        } catch (e) {
            return { error: true, response: JSON.stringify(e) };
        }
    }
}




