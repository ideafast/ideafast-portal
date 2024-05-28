// External node module imports
import { v4 as uuid } from 'uuid';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { db } from '../../itmat-interface/src/database/database';
import { objStore } from './objStore/objStore';
import { Router } from './server/router';
import { Runner } from './server/server';
import { JobPoller } from '@itmat-broker/itmat-commons';
import { JobDispatcher } from './jobDispatch/dispatcher';
import { MongoClient } from 'mongodb';
import { APIHandler } from './jobHandlers/apiJobHandler';
import { defaultSettings} from '@itmat-broker/itmat-types';
import { LXDJobHandler, LXDMonitorHandler } from './jobHandlers/lxdJobHandler';

class ITMATJobExecutorRunner extends Runner {

    private router?: Router;

    /**
     * @fn start
     * @desc Start the ITMATServer service, routes are setup and
     * automatic status update is triggered.
     * @return {Promise} Resolve to a native Express.js router ready to use on success.
     * In case of error, an ErrorStack is rejected.
     */
    public start(): Promise<Router> {
        const _this = this;
        return new Promise((resolve, reject) => {

            // Operate database migration if necessary
            db.connect(this.config.database, MongoClient)
                .then(() => objStore.connect(this.config.objectStore))
                .then(() => {
                    _this.router = new Router();
                    const jobDispatcher = new JobDispatcher();

                    /* TO_DO: can we figure out the files at runtime and import at runtime */
                    // jobDispatcher.registerJobType('QUERY_EXECUTION', QueryHandler.prototype.getInstance.bind(QueryHandler));
                    // jobDispatcher.registerJobType('UKB_IMAGE_UPLOAD', UKB_IMAGE_UPLOAD_Handler.prototype.getInstance);
                    jobDispatcher.registerJobType('DMPAPI', APIHandler.prototype.getInstance.bind(APIHandler));
                    // register the lxd jobhandler, bind the instance collection to LXDJobHandler
                    jobDispatcher.registerJobType(
                        'LXD',
                        async () => await LXDJobHandler.getHandler(db.collections!.instance_collection)
                    );
                    // Register the LXD monitor handler
                    jobDispatcher.registerJobType(
                        'LXD_MONITOR',
                        async () => new LXDMonitorHandler(db.collections!.instance_collection)
                    );

                    const poller = new JobPoller({
                        identity: uuid(),
                        jobCollection: db.collections!.jobs_collection,
                        pollingInterval: this.config.pollingInterval,
                        action: jobDispatcher.dispatch,
                        jobSchedulerConfig: defaultSettings.systemConfig.jobSchedulerConfig
                    });
                    poller.setInterval();

                    // Return the Express application
                    return resolve(_this.router);

                }).catch((err: any) => reject(err));
        });
    }

    /**
     * @fn stop
     * @desc Stops the ITMAT server service. After a call to stop, all references on the
     * express router MUST be released and this service endpoints are expected to fail.
     * @return {Promise} Resolve to true on success, ErrorStack otherwise
     */
    public async stop(): Promise<void> {
        await objStore.disconnect();
        await db.closeConnection();
        return Promise.resolve();
    }
}

export default ITMATJobExecutorRunner;
