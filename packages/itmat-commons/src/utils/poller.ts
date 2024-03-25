import type * as mongodb from 'mongodb';
import { enumJobHistoryStatus, enumJobStatus, enumJobType, IJob, IJobPollerConfig, IJobSchedulerConfig } from '@itmat-broker/itmat-types';
import { Logger } from './logger';

export class JobPoller {
    private intervalObj?: NodeJS.Timer;
    private readonly matchObj: any;

    private readonly identity: string;
    private readonly jobType?: string;
    private readonly jobCollection: mongodb.Collection<IJob>;
    private readonly pollingInterval: number;
    private readonly action: (document: any) => any;
    private readonly jobScheduler: JobScheduler;

    constructor(config: IJobPollerConfig) {
        this.identity = config.identity;
        this.jobType = config.jobType;
        this.jobCollection = config.jobCollection;
        this.pollingInterval = config.pollingInterval;
        this.action = config.action;
        this.setInterval = this.setInterval.bind(this);
        this.checkForJobs = this.checkForJobs.bind(this);
        this.matchObj = {
            status: enumJobStatus.PENDING
            /*, lastClaimed: more then 0 */
        };
        this.jobScheduler = new JobScheduler({
            ...config.jobSchedulerConfig,
            jobCollection: config.jobCollection
        });

    }

    public setInterval(): void {
        this.intervalObj = setInterval(this.checkForJobs, this.pollingInterval);
    }

    private async checkForJobs() {
        // Logger.log(`${this.identity} polling for new jobs of type ${this.jobType || 'ALL'}.`);
        let job: IJob | null;
        try {
            // implement the scheduler here
            job = await this.jobScheduler.findNextJob();
        } catch (err) {
            //TODO Handle error recording
            Logger.error(`${this.identity} Errored picking up a job: ${err}`);
            return;
        }
        if (job) {
            Logger.log('Find job');
            // update log status
            const setObj: any = {};
            try {
                // let result: any;
                console.log('[JobPoller -> checkForJobs] start the action', this.action);
                // try {
                //     result = await this.action(job);
                // }
                const result = await this.action(job);
                // catch (e){
                //     console.error('this.action(job);', e);
                //     throw new Error(`Failed to update instance metadata: ${e}`);
                // }
                console.log('Job Execution finished: ', new Date((Date.now())).toISOString(), result?.error, result);

                if (job.period) {
                    setObj.status = enumJobStatus.PENDING;
                    setObj.nextExecutionTime = Date.now() + job.period;
                } else {
                    if (job.type === enumJobType.LXD) {
                        setObj.status = enumJobStatus.INUSE;
                    } else {
                        setObj.status = enumJobStatus.FINISHED;
                    }
                }
                if (result) {
                    if (result?.error){
                        setObj.history = [{
                            time: Date.now(),
                            status: enumJobHistoryStatus.FAILED,
                            errors: [result.response]
                        }];
                    } else {
                        setObj.history = [{
                            time: Date.now(),
                            status: enumJobHistoryStatus.SUCCESS,
                            errors: []
                        }];
                    }

                }
            } catch (error) {
                console.error('[JOB poller]Job execution Error', new Date((Date.now())).toISOString(),  error);
                setObj.history = [{
                    time: Date.now(),
                    status: enumJobHistoryStatus.FAILED,
                    errors: [error]
                }];
            }
            await this.jobCollection.findOneAndUpdate({ id: job.id }, {
                $set: setObj
            });
            // this.setInterval();
        }
        // this.setInterval();
        // else if (!updateResult) {
        //     Logger.error(`${this.identity} Errored during database update: ${updateResult}`);
        // }
    }
}

export class JobScheduler {
    private config: Required<IJobSchedulerConfig>;
    constructor(config: Required<IJobSchedulerConfig>) {
        this.config = config;
    }

    public async findNextJob() {
        let availableJobs = await this.config.jobCollection.find({
            status: enumJobStatus.PENDING
        }).toArray();
        // we sort jobs based on the config
        availableJobs = availableJobs.filter(el => {
            if (this.config.reExecuteFailedJobs && el.history.filter(ek => ek.status === enumJobHistoryStatus.FAILED).length > this.config.maxAttempts) {
                return false;
            }
            if (Date.now() < el.nextExecutionTime) {
                return false;
            }
            return true;
        }).sort((a, b) => {
            if (this.config.usePriority) {
                if (a.priority > b.priority) {
                    return 1;
                } else if (a.nextExecutionTime < b.nextExecutionTime) {
                    return 1;
                } else {
                    return -1;
                }
            } else {
                return a.nextExecutionTime - b.nextExecutionTime;
            }
        });
        const job = availableJobs[0];
        if (!job) {
            return null;
        }
        return job;
    }
}