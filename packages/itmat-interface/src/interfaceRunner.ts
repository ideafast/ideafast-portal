// External node module imports
import { db } from './database/database';
import { objStore } from './objStore/objStore';
import { MongoClient } from 'mongodb';
import { Router } from './server/router';
import { Runner } from './server/server';
import { pubsub } from './graphql/pubsub';
import { subscriptionEvents } from '@itmat-broker/itmat-cores';

class ITMATInterfaceRunner extends Runner {

    private router?: Router;

    /**
     * @fn start
     * @desc Start the ITMATServer service, routes are setup and
     * automatic status update is triggered.
     * @return {Promise} Resolve to a native Express.js router ready to use on success.
     * In case of error, an ErrorStack is rejected.
     */
    public async start(): Promise<Router> {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const _this = this;
        return new Promise((resolve, reject) => {

            // Operate database migration if necessary
            db.connect(this.config.database, MongoClient)
                .then(async () => objStore.connect(this.config.objectStore))
                .then(async () => {

                    const jobChangestream = db.collections.jobs_collection.watch([
                        { $match: { operationType: { $in: ['update', 'insert'] } } }
                    ], { fullDocument: 'updateLookup' });
                    jobChangestream.on('change', data => {
                        if (data.operationType === 'update' &&
                            data.updateDescription &&
                            data.updateDescription.updatedFields &&
                            data.updateDescription.updatedFields.status
                        ) {
                            pubsub.publish(subscriptionEvents.JOB_STATUS_CHANGE, {
                                subscribeToJobStatusChange: {
                                    jobId: data.fullDocument?.id,
                                    studyId: data.fullDocument?.studyId,
                                    newStatus: data.fullDocument?.status,
                                    errors: data.fullDocument?.status === 'ERROR' ? data.fullDocument.error : null
                                }
                            }).catch(() => { return; });
                        }
                    });
                    _this.router = new Router(this.config);
                    await _this.router.init();

                    // Return the Express application
                    return resolve(_this.router);

                }).catch((err) => reject(err));
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

export default ITMATInterfaceRunner;
