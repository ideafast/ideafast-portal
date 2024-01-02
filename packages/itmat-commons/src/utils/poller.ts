import type * as mongodb from 'mongodb';
import { enumJobHistoryStatus, enumJobStatus, IJob, IJobPollerConfig, IJobSchedulerConfig } from '@itmat-broker/itmat-types';
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
            const result = await this.action(job);
            console.log('Execution finished: ', !(result === 'error'));
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
        const availableJobs = await this.config.jobCollection.find({
            status: enumJobStatus.PENDING
        }).toArray();
        // we sort jobs based on the config
        availableJobs.filter(el => {
            if (this.config.reExecuteFailedJobs && el.history.filter(ek => ek.status === enumJobHistoryStatus.FAILED).length > this.config.maxAttempts) {
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
        return availableJobs[0];
    }
}