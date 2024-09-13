import type * as mongodb from 'mongodb';
import { enumJobHistoryStatus, enumJobStatus, IJob, IJobPollerConfig, IJobSchedulerConfig, IJobActionReturn } from '@itmat-broker/itmat-types';
import { Logger } from './logger';

export class JobPoller {
    private intervalObj?: NodeJS.Timer;
    private readonly matchObj: unknown;

    private readonly identity: string;
    private readonly jobType?: string;w;
    private readonly jobCollection: mongodb.Collection<IJob>;
    private readonly pollingInterval: number;
    private readonly action: (document: IJob) => Promise<IJobActionReturn>;
    private readonly jobScheduler: JobScheduler;

    constructor(config: IJobPollerConfig) {
        this.identity = config.identity;
        this.jobType = config.jobType;
        this.jobCollection = config.jobCollection;
        this.pollingInterval = config.pollingInterval;
        this.action = config.action;
        this.setInterval = this.setInterval.bind(this);
        this.checkForJobs = this.checkForJobs.bind(this);
        // this.matchObj = {
        //     status: enumJobStatus.PENDING
        //     /*, lastClaimed: more then 0 */
        // };
        this.jobScheduler = new JobScheduler({
            ...config.jobSchedulerConfig,
            jobCollection: config.jobCollection
        });

    }

    public setInterval(): void {
        this.intervalObj = setInterval(() => {
            void this.checkForJobs(); // Wrap the async call
        }, this.pollingInterval);
    }

    private async checkForJobs() {
        let job: IJob | null;
        try {
            // implement the scheduler here
            job = await this.jobScheduler.findNextJob();
        } catch (err) {
            Logger.error(`${this.identity} Errored picking up a job: ${err}`);
            return;
        }
        if (job) {
            // update log status
            const setObj: mongodb.UpdateFilter<IJob> = {};
            try {

                const result = await this.action(job);
                // Logger.log(`[JOB] Job Execution finished: ${new Date((Date.now())).toISOString()}, ${JSON.stringify(result?.error)}, ${JSON.stringify(result)}`);

                if (job.period) {
                    setObj['status'] = enumJobStatus.PENDING;
                    setObj['nextExecutionTime'] = Date.now() + job.period;
                }
                let newHistoryEntry;
                if (result) {
                    if (!result.successful) {
                        newHistoryEntry = {
                            time: Date.now(),
                            status: enumJobHistoryStatus.FAILED,
                            errors: [result.error]
                        };
                        // update the job status to failed if not periodic
                        setObj['status'] = job.period ? enumJobStatus.PENDING : enumJobStatus.ERROR;
                    } else {
                        newHistoryEntry = {
                            time: Date.now(),
                            status: enumJobHistoryStatus.SUCCESS,
                            errors: []
                        };
                        // update the job status to success
                        // numJobStatus.FINISHED if !job.period else enumJobStatus.PENDING;
                        setObj['status'] = job.period ? enumJobStatus.PENDING : enumJobStatus.FINISHED;
                    }
                }

                const jobUpdate = await this.jobCollection.findOne({ id: job.id });
                if (jobUpdate) {
                    const currentHistory = jobUpdate.history || [];
                    setObj['history'] = [...currentHistory];
                    if (newHistoryEntry) {
                        setObj['history'].push(newHistoryEntry);
                    }
                    await this.jobCollection.findOneAndUpdate({ id: job.id }, {
                        $set: setObj
                    });
                }
            } catch (error) {
                const currentHistory = job.history || [];
                setObj['history'] = [...currentHistory, {
                    time: Date.now(),
                    status: enumJobHistoryStatus.FAILED,
                    errors: [error]
                }];
                await this.jobCollection.findOneAndUpdate({ id: job.id }, {
                    $set: setObj
                });

            }
        }
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