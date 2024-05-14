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
            // update log status
            const setObj: any = {};
            try {

                const result = await this.action(job);
                Logger.log(`[JOB] Job Execution finished: ${new Date((Date.now())).toISOString()}, ${JSON.stringify(result?.error)}, ${JSON.stringify(result)}`);

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
                let newHistoryEntry;
                if (result) {
                    if (result?.error) {
                        newHistoryEntry = {
                            time: Date.now(),
                            status: enumJobHistoryStatus.FAILED,
                            errors: [result.response]
                        };
                        // update the job status to failed
                        setObj.status = enumJobStatus.CANCELLED;
                    } else {
                        newHistoryEntry = {
                            time: Date.now(),
                            status: enumJobHistoryStatus.SUCCESS,
                            errors: []
                        };
                        // update the job status to success
                        setObj.status = enumJobStatus.FINISHED;
                    }
                }

                const jobUpdate = await this.jobCollection.findOne({ id: job.id });
                if (jobUpdate) {
                    const currentHistory = jobUpdate.history || [];
                    setObj.history = [...currentHistory, newHistoryEntry];

                    await this.jobCollection.findOneAndUpdate({ id: job.id }, {
                        $set: setObj
                    });
                }
            } catch (error) {
                console.error('[JOB poller]Job execution Error', new Date((Date.now())).toISOString(),  error);
                const currentHistory = job.history || [];
                setObj.history = [...currentHistory, {
                    time: Date.now(),
                    status: enumJobHistoryStatus.FAILED,
                    errors: [error]
                }];
                await this.jobCollection.findOneAndUpdate({ id: job.id }, {
                    $set: setObj
                });

            }
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
                // console.log('Job failed more than max attempts: ', el.id);
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