import { IJob, enumTRPCErrorCodes } from '@itmat-broker/itmat-types';
import { JobHandler } from './jobHandlerInterface';
import { TRPCError } from '@trpc/server';

/**
 * For creating lxd containers.
 */
export class LXDJobHandler extends JobHandler {
    constructor() {
        super();
    }

    public async getInstance(): Promise<JobHandler> {
        return new LXDJobHandler();
    }

    public async execute(document: IJob): Promise<any> {
        console.log(document.id);
        throw new TRPCError({
            code: enumTRPCErrorCodes.UNAUTHORIZED,
            message: 'Not implemented.'
        });
    }
}

/**
 * For controlling lxd containers, includine editing or deleteing.
 */
export class LXDControlHandler extends JobHandler {
    constructor() {
        super();
    }

    public async getInstance(): Promise<JobHandler> {
        return new LXDControlHandler();
    }

    public async execute(document: IJob): Promise<any> {
        console.log(document.id);
        throw new TRPCError({
            code: enumTRPCErrorCodes.UNAUTHORIZED,
            message: 'Not implemented.'
        });
    }
}

/**
 * For monitoring lxd containers, including updating intermediate status.
 */
export class LXDMonitorHandler extends JobHandler {
    constructor() {
        super();
    }

    public async getInstance(): Promise<JobHandler> {
        return new LXDMonitorHandler();
    }

    public async execute(document: IJob): Promise<any> {
        console.log(document.id);
        throw new TRPCError({
            code: enumTRPCErrorCodes.UNAUTHORIZED,
            message: 'Not implemented.'
        });
    }
}



