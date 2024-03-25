/* eslint-disable @nx/enforce-module-boundaries */
import { IJob, IInstance, enumOpeType, enumInstanceStatus, IUser} from '@itmat-broker/itmat-types';
import { JobHandler } from './jobHandlerInterface';
import { TRPCError } from '@trpc/server';
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';

import axios from 'axios';
import type * as mongodb from 'mongodb';
import { error } from 'console';
import config from '../utils/configManager';

const lxdInstance = axios.create({
    baseURL: config.dmpEndpoint
});

const pollOperation = async (operationUrl: string): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
        // Extract the operation ID from the operation URL
        const operationIdMatch = operationUrl.match(/\/1\.0\/operations\/([^/]+)/);
        if (!operationIdMatch) {
            reject(new Error('Invalid operation URL'));
            return;
        }
        const operationId = operationIdMatch[1];

        // Adjust the endpoint URL to use the DMP backend route for polling
        const dmpOperationEndpoint = `/lxd/operation/${operationId}`;

        const interval = setInterval(async () => {
            try {
                // Adjust the request to call the DMP backend endpoint for the operation status
                const opResponse = await lxdInstance.get(dmpOperationEndpoint);
                const opData = opResponse.data;

                if (opData.metadata.status === 'Success') {
                    clearInterval(interval);
                    resolve(); // Operation succeeded
                } else if (opData.metadata.status === 'Failure') {
                    clearInterval(interval);
                    reject(new Error('Operation failed'));
                }
                // Add more conditions as necessary based on your application's logic
            } catch (error) {
                clearInterval(interval);
                reject(error);
            }
        }, 2000); // Poll every 2 seconds. Adjust timing as needed.
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
        // Directly access metadata, which is assumed to be an object already
        const metadata = document.metadata ?? {};

        // Extract operation and other data directly from metadata
        const operation = metadata.operation ?? null;
        const instanceId = metadata.instanceId ?? null;

        switch (operation) {
            case enumOpeType.CREATE:
                return this.create(document); // Already implemented
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
     * lxd rest api
     */
    private async create(document: IJob): Promise<any> {
        console.log(`Executing job ${document.id} for creating LXD instance.`);

        // Ensure metadata and payload are correctly extracted
        const metadata = document.metadata ?? {};
        const payload = metadata.payload ?? {};
        const instanceId = metadata.instanceId ?? '';
        try {
            console.log('execute lxd job payload', payload);
            const response = await lxdInstance.post('/lxd/instances/create', payload);

            // Assuming the operation URL is provided in the response
            if (response.data.operation) {
                console.log('Operation URL:', response.data.operation);
                await pollOperation(response.data.operation);
                // get the update information of this instance

                // Operation succeeded, update instance status to RUNNING
                await this.updateInstanceMetadata(instanceId, response.data, enumInstanceStatus.STOPPED);
                console.log('Instance created successfully:', response.data);
            } else {
                // No operation URL, direct success without polling
                await this.updateInstanceMetadata(instanceId, response.data, enumInstanceStatus.STOPPED);
                console.log('Instance created successfully without polling:', response.data);
            }
            return response.data;
        } catch (error) {
            console.error('Failed to create LXD instance:', error);

            // Operation failed, update instance status to FAILED
            await this.updateInstanceMetadata(instanceId, {}, enumInstanceStatus.FAILED);
            return {error: error};
        }
    }

    private async update(document: IJob): Promise<any> {
        //update the instance
        const { instanceId, updates, requester} = document.metadata ?? {};
        console.log(`Updating instance configuration: ${instanceId}`);

        // Retrieve instance details to get the instance name
        const instance = await this.instanceCollection.findOne({ id: instanceId });
        if (!instance) {
            console.error('LXD update: Instance not found.:', instanceId, updates);
            return {error: 'LXD update: Instance not found'};
        }

        const payload = updates;

        try {
        // Perform the PATCH request to update the instance
            const response = await lxdInstance.patch(`/lxd/instances/${instance.name}/update`, payload, {
                headers: { 'Content-Type': 'application/json' }
                // setup the user by the requester
            });

            console.log(`Instance configuration updated successfully: ${response.data}`);

            return response.data;
        } catch (error) {
            console.error(`Error updating instance configuration: ${instanceId}`, error);
            return {error: error};
        }
    }

    private async startStopInstance(instanceId: string, action: 'start' | 'stop'): Promise<any> {
        console.log(`Instance operation: ${action}, Instance ID: ${instanceId}`);
        // Retrieve instance data from the database using instanceId
        const instanceData = await this.instanceCollection.findOne({ id: instanceId });
        if (!instanceData) {
            throw new Error('Instance not found.');
        }

        const instanceName = instanceData.name; // Assuming you store the instance name
        try {
            const response = await lxdInstance.put(`/lxd/instances/${instanceName}/action`, { action });

            console.log(`Instance ${action} response:`, response.data);
            // Check for an operation URL and poll if present
            if (response.data.operation) {
                console.log('Operation URL:', response.data.operation);
                await pollOperation(response.data.operation);
            }

            // Update instance status in the database
            const newStatus = action === 'start' ? enumInstanceStatus.RUNNING : enumInstanceStatus.STOPPED;
            await this.updateInstanceMetadata(instanceId, null, newStatus);
        } catch (error) {
            console.error(`Failed to ${action} instance:`, error);
            throw new Error(`[JOB] start or stop Instance  failed: ${error}`);
        }
    }


    private async deleteInstance(instanceId: string): Promise<any> {
        console.log(`Deleting instance, Instance ID: ${instanceId}`);
        // Retrieve instance data from the database
        const instanceData = await this.instanceCollection.findOne({ id: instanceId });
        if (!instanceData) {
            throw new Error('Instance not found.');
        }

        const instanceName = instanceData.name; // Assuming you store the instance name
        try {
            const response = await lxdInstance.delete(`/lxd/instances/${instanceName}`);
            console.log('Delete instance response:', response.data);
            // Check for an operation URL and poll if present
            if (response.data.operation) {
                console.log('Operation URL:', response.data.operation);
                await pollOperation(response.data.operation);
            }

            // Remove instance from the database or mark it as deleted
            await this.instanceCollection.deleteOne({ id: instanceId });
        } catch (error) {
            console.error('[JOB] Failed to delete instance:', error);
            // throw error;
            throw new Error(`[JOB] delete Instance  failed: ${error}`);
        }
    }
    private async updateInstanceMetadata(instanceId: string, metadata: any, status: enumInstanceStatus): Promise<void> {

        const updateObject:Record<string, any> = {
            $set: {
                status: status // Assuming 'status' is always set
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
            console.log(`Instance ${instanceId} updated with status ${status}.`);
            if (!updateResult.ok) {
                // throw new Error('Database update failed');
                console.error(`Failed to update instance ${instanceId}:`, updateResult);
            }
        } catch (error) {
            console.error(`Failed to update instance ${instanceId} error:`, error);
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

    private async lxdResources(document: IJob): Promise<any> {
        console.log('instance exec:', document);
    }
}