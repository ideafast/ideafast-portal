/* eslint-disable @nx/enforce-module-boundaries */

import { IJob, IInstance, enumOpeType, enumInstanceStatus, enumMonitorType, LXDInstanceState} from '@itmat-broker/itmat-types';
import { JobHandler } from './jobHandlerInterface';
import { TRPCError } from '@trpc/server';
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';

import type * as mongodb from 'mongodb';
import { error } from 'console';
import  {createClientWithHeaders} from '../utils/trpc';
import { Logger } from '@itmat-broker/itmat-commons';

const pollOperation = async (
    trpcClient: ReturnType<typeof createClientWithHeaders>,
    operationUrl: string,
    instanceToken: string | undefined, maxTry = 100
): Promise<void> => {
    // couting the try
    let tryCount = 0;
    return new Promise<void>((resolve, reject) => {
        // Extract the operation ID from the operation URL
        const operationIdMatch = operationUrl.match(/\/1\.0\/operations\/([^/]+)/);
        if (!operationIdMatch) {
            reject(new Error('Invalid operation URL'));
            return;
        }
        const operationId = operationIdMatch[1];

        const interval = setInterval(async () => {
            tryCount++;
            if (tryCount > maxTry) {
                clearInterval(interval);
                reject(new Error(`Operation polling timed out:${operationUrl} -> ${operationId}`));
                return;
            }
            try {
                const opData = await trpcClient.lxd.getOperationStatus.query({operationId: operationId});

                // if get response like this'Success' then just exit the interval
                if (opData.metadata.status === 'Success') {
                    clearInterval(interval);
                    resolve(); // Operation succeeded
                } else if (opData.metadata.status === 'Failure') {
                    // if get response like err: 'Failed creating instance record: Instance is busy running a "create" operation', then just skip and continue interval
                    if (opData.metadata.err.includes('Instance is busy running')) {
                        return;
                    } else {
                        clearInterval(interval);
                        reject(new Error(`Operation failed for ${opData.metadata.err}`));
                    }
                } else if (opData.metadata.status === 'Running') {
                    // Operation is still running, continue polling
                    return;
                } else {
                    clearInterval(interval);
                    reject(new Error(`Unknown operation status: ${opData.metadata.status}`));
                }
            } catch (error: TRPCError | unknown) {
                Logger.error(`Error polling operation: ${error}`);
                if (error instanceof TRPCError  && error?.code) { // Adetermine fatal errors
                    clearInterval(interval);
                    reject(new Error(`Fatal error polling operation: ${error?.message}`));
                }
            }

        }, 4000); // Poll every 3 seconds. Adjust timing as needed.
    });
};

/**
 * For creating lxd containers.
 */
export class LXDJobHandler extends JobHandler {
    private static instance: LXDJobHandler | null = null;
    private readonly instanceCollection: mongodb.Collection<IInstance>;

    private constructor(instanceCollection: mongodb.Collection<IInstance>) {
        super();
        this.instanceCollection = instanceCollection;
    }

    // This method now serves as a way to get the singleton instance asynchronously
    // and matches the abstract method's signature
    public async getInstance(): Promise<JobHandler> {
        if (!LXDJobHandler.instance) {
            // need create new handler
            throw error('No LXDJobHandler existed');
        }
        return LXDJobHandler.instance;
    }

    public static async getHandler(instanceCollection: mongodb.Collection<IInstance>): Promise<LXDJobHandler> {
        if (!LXDJobHandler.instance) {
            LXDJobHandler.instance = new LXDJobHandler(instanceCollection);
        }
        return LXDJobHandler.instance;
    }

    public async execute(document: IJob): Promise<any> {

        const { operation, instanceId } = document.metadata ?? {};

        if (!operation || !instanceId) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Missing required metadata: operation or instanceId.'
            });
        }

        switch (operation) {
            case enumOpeType.CREATE:
                return this.create(document);
            case enumOpeType.UPDATE:
                return this.update(document);
            case enumOpeType.START:
                return this.startStopInstance(instanceId, 'start');
            case enumOpeType.STOP:
                return this.startStopInstance(instanceId, 'stop');
            case enumOpeType.DELETE:
                return this.deleteInstance(instanceId);
            default:
                throw new TRPCError({
                    code: enumTRPCErrorCodes.UNAUTHORIZED,
                    message: 'Unsupported operation.'
                });
        }
    }
    /**
     * execute the create instance job
     */
    private async create(document: IJob): Promise<any> {

        const metadata = document.metadata ?? {};
        const payload = metadata.payload ?? {};
        const instanceId = metadata.instanceId ?? '';

        // Retrieve instance data from the database using instanceId
        const instanceData = await this.instanceCollection.findOne({ id: instanceId });
        if (!instanceData) {
            throw new Error('Instance not found.');
        }

        // Retrieve the instanceToken from the instanceData
        const instanceToken = instanceData.instanceToken;

        try {
            // Create a client with the instance token
            const trpcClient = createClientWithHeaders(instanceToken);
            // Make a tRPC call using the client with the token in the header
            const data = await trpcClient.lxd.createInstance.mutate(payload);

            // Assuming the operation URL is provided in the response
            if (data.operation) {
                await pollOperation(trpcClient, data.operation, instanceToken);

                // Operation succeeded, update instance status to RUNNING
                await this.updateInstanceMetadata(instanceId, data, enumInstanceStatus.STOPPED);
            } else {
                // No operation URL, direct success without polling
                await this.updateInstanceMetadata(instanceId, data, enumInstanceStatus.STOPPED);
            }
            return data;
        } catch (error) {
            Logger.error(`Error creating instance: ${instanceId}, ${error}`);
            // Operation failed, update instance status to FAILED
            await this.updateInstanceMetadata(instanceId, {}, enumInstanceStatus.FAILED);
            return {error: error};
        }
    }

    private async update(document: IJob): Promise<any> {
        //update the instance
        const { instanceId, updates} = document.metadata ?? {};

        // Retrieve instance details to get the instance name
        const instance = await this.instanceCollection.findOne({ id: instanceId });
        if (!instance) {
            Logger.error(`LXD update: Instance not found.: ${instanceId} ${updates}`);
            return {error: 'LXD update: Instance not found'};
        }

        const payload = updates;
        const instanceToken = instance.instanceToken;

        try {
            const trpcClient = createClientWithHeaders(instanceToken);
            const data = await trpcClient.lxd.updateInstance.mutate({ instanceName: instance.name, payload });

            return data;
        } catch (error) {
            Logger.error(`Error updating instance configuration: ${instanceId} - ${JSON.stringify(error)}`);
            return {error: error};
        }
    }

    private async startStopInstance(instanceId: string, action: 'start' | 'stop'): Promise<any> {

        const instanceData = await this.instanceCollection.findOne({ id: instanceId });
        if (!instanceData) {
            throw new Error('Instance not found.');
        }

        const instanceToken = instanceData.instanceToken;

        try {
            const trpcClient = createClientWithHeaders(instanceToken);
            const data = await trpcClient.lxd.startStopInstance.mutate({ instanceName: instanceData.name, action});

            if (data.operation) {
                await pollOperation(trpcClient, data.operation, instanceToken);
            }

            // Update instance status in the database
            const newStatus = action === 'start' ? enumInstanceStatus.RUNNING : enumInstanceStatus.STOPPED;
            await this.updateInstanceMetadata(instanceId, null, newStatus);
        } catch (error: Error | unknown) {
            // if action is stop or start, and the error message has like 'The instance is already stopped', set the status to STOPPED or RUNNING
            // the error message which may be err: 'The instance is already stopped',
            Logger.log(`startStopInstance error: ${error}`);
            if (error instanceof Error && error.message.includes('The instance is already stopped')) {
                await this.updateInstanceMetadata(instanceId, null, enumInstanceStatus.STOPPED);
            } else if (error instanceof Error && error.message.includes('The instance is already running')) {
                await this.updateInstanceMetadata(instanceId, null, enumInstanceStatus.RUNNING);
            } else {
                await this.updateInstanceMetadata(instanceId, null, enumInstanceStatus.FAILED);
            }
            throw new Error(`[JOB] start or stop Instance  failed: ${error}`);
        }
    }


    private async deleteInstance(instanceId: string): Promise<any> {

        Logger.log(`Deleting instance, Instance ID: ${instanceId}`);
        const instanceData = await this.instanceCollection.findOne({ id: instanceId });
        if (!instanceData) {
            throw new Error('Instance not found.');
        }

        const instanceName = instanceData.name;
        const instanceToken = instanceData.instanceToken;

        try {
            const trpcClient = createClientWithHeaders(instanceToken);
            const data = await trpcClient.lxd.deleteInstance.mutate({ instanceName: instanceName});

            Logger.log(`Delete instance response: ${data} `);
            if (data.operation) {
                await pollOperation(trpcClient, data.operation, instanceToken);
            }

            // Remove instance from the database
            await this.instanceCollection.deleteOne({ id: instanceId });
        } catch (error) {
            Logger.error(`[JOB] Failed to delete instance: ${error}`);
            throw new Error(`[JOB] delete Instance  failed: ${error}`);
        }
    }
    private async updateInstanceMetadata(instanceId: string, metadata: any, status: enumInstanceStatus): Promise<void> {

        const updateObject:Record<string, any> = {
            $set: {
                status: status
            }
        };
        if (metadata !== null) {
            updateObject.$set.metadata = metadata;
        }

        try {
            const updateResult = await this.instanceCollection.findOneAndUpdate(
                { id: instanceId },
                updateObject
            );
            if (!updateResult.ok) {
                Logger.error(`Failed to update instance ${instanceId}: ${updateResult}`);
            }
        } catch (error) {
            Logger.error(`Failed to update instance ${instanceId} error: ${error}`);
            throw new Error(`Failed to update instance metadata: ${error}`);
        }
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
        Logger.log(document.id);
        throw new TRPCError({
            code: enumTRPCErrorCodes.UNAUTHORIZED,
            message: 'Not implemented.'
        });
    }
}

/**
 * For monitoring lxd containers, including updating intermediate status.
 * bulk operation for monitoring the lxd instances of users.

 * TODO: update the status of the instance.
 * TODO: update the status of the instance job.
 * TODO: permenant delete the instance if the status is deleted from both side.
 */
export class LXDMonitorHandler extends JobHandler {
    private readonly instanceCollection: mongodb.Collection<IInstance>;
    constructor(instanceCollection: mongodb.Collection<IInstance>) {
        super();
        this.instanceCollection = instanceCollection;
    }


    public async getInstance(): Promise<JobHandler> {
        return new LXDMonitorHandler(this.instanceCollection);
    }
    public async execute(document: IJob): Promise<unknown> {

        const { operation, userId } = document.metadata ?? {};

        if (!operation || !userId) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Missing required metadata: operation or userId.'
            });
        }

        switch (operation) {
            case enumMonitorType.STATE:
                return this.updateInstanceState(userId);
            default:
                throw new TRPCError({
                    code: enumTRPCErrorCodes.UNAUTHORIZED,
                    message: 'Unsupported operation.'
                });
        }
    }

    // delete the instance from the database
    // once the instance is deleted from the lxd server, or if it has been deleted for more than 10 days .

    private async lxdResources(document: IJob): Promise<any> {
        Logger.log(`instance exec: ${document.id}`);
    }

    // update the instance status
    private async updateInstanceState(userId: string): Promise<void> {
        Logger.log(`Updating instance state for user: ${userId}`);

        // Retrieve all instances belonging to the user
        const instances = await this.instanceCollection.find({ userId }).toArray();

        for (const instance of instances) {
            try {
                const trpcClient = createClientWithHeaders(instance.instanceToken);
                const response = await trpcClient.lxd.getInstanceState.query({ container: instance.name });

                if (response.data) {
                    const instanceState = response.data as LXDInstanceState;


                    // Update the instance state in the database
                    await this.instanceCollection.updateOne(
                        { id: instance.id },
                        {
                            $set: {
                                lxdState: instanceState,
                                status: this.determineInstanceStatus(instanceState)
                            }
                        }
                    );
                } else {
                    Logger.error(`Failed to retrieve state for instance: ${instance.name}`);
                }
            } catch (error) {
                Logger.error(`Error updating state for instance ${instance.name}: ${error}`);
            }
        }
    }

    private determineInstanceStatus(state: any): enumInstanceStatus {
        // Determine the instance status based on the state
        if (state.status === 'Running') {
            return enumInstanceStatus.RUNNING;
        } else if (state.status === 'Stopped') {
            return enumInstanceStatus.STOPPED;
        } else if (state.status === 'Error') {
            return enumInstanceStatus.FAILED;
        } else {
            return enumInstanceStatus.DELETED;
        }
    }
}