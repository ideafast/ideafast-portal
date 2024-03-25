import { IJob} from '@itmat-broker/itmat-types';
import { JobHandler } from '../jobHandlers/jobHandlerInterface';
import { error } from 'console';

export class JobDispatcher {
    private _handlerCollection: {
        [jobType: string]: () => Promise<JobHandler>
    };

    constructor() {
        this.dispatch = this.dispatch.bind(this);
        this._handlerCollection = {};
    }

    public registerJobType(jobType: string, getHandlerInstanceFunction: () => Promise<JobHandler>): void {
        this._handlerCollection[jobType] = getHandlerInstanceFunction;
    }

    public removeHandler(jobType: string): void {
        delete this._handlerCollection[jobType];
    }

    public async dispatch(job: IJob): Promise<any> {
        if (!this._handlerCollection[job.type]) {
            //TODO set job to UNPROCESSED
            throw error('No JobHandler for job', job.type);
            // return;
        }
        return await (await this._handlerCollection[job.type]()).execute(job);
    }
}
