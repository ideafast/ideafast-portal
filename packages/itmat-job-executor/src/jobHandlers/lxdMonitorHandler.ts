import {
    IJob,
    IInstance,
    enumInstanceStatus,
    enumMonitorType,
    LXDInstanceState,
    IJobActionReturn
} from '@itmat-broker/itmat-types';
import { APIHandler } from './apiJobHandler';
import { Logger } from '@itmat-broker/itmat-commons';
import type * as mongodb from 'mongodb';
import { db } from '../database/database';

export class LXDMonitorHandler extends APIHandler {
    private static instance: LXDMonitorHandler;
    private readonly instanceCollection: mongodb.Collection<IInstance>;

    constructor() {
        super();
        this.instanceCollection = db.collections.instance_collection;
    }

    public static override async getInstance(): Promise<APIHandler> {
        if (!LXDMonitorHandler.instance) {
            LXDMonitorHandler.instance = new LXDMonitorHandler();
        }
        return LXDMonitorHandler.instance;
    }

    public override async execute(document: IJob): Promise<IJobActionReturn>{
        const { operation, userId } = document.metadata as { operation: string; userId: string } ?? {};

        if (!operation || !userId) {
            return { successful: false, error: 'Missing required metadata: operation or userId.' };
        }

        try {
            switch (operation) {
                case enumMonitorType.STATE:
                    return await this.updateInstanceState(userId);
                default:
                    return { successful: false, error: 'Unsupported operation.' };
            }
        } catch (error) {
            return { successful: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    private async updateInstanceState(userId: string) {
        const instances = await this.instanceCollection.find({ userId }).toArray();

        for (const instance of instances) {
            try {
                const project = instance.project || 'default';
                const response = await this.lxdManager.getInstanceState(instance.name, project);

                if (response.data) {
                    const instanceState = response.data as LXDInstanceState;

                    await this.instanceCollection.updateOne(
                        { id: instance.id },
                        {
                            $set: {
                                lxdState: instanceState,
                                status: this.determineInstanceStatus(instanceState)
                            }
                        }
                    );
                    return { successful: true };
                } else {
                    Logger.error(`Failed to retrieve state for instance: ${instance.name}`);
                    return { successful: false, error: `Failed to retrieve state for instance: ${instance.name}` };
                }
            } catch (error) {
                Logger.error(`Error updating state for instance ${instance.name}: ${error}`);
                return { successful: false, error: error instanceof Error ? error.message : String(error) };
            }
        }

        // Add a default return statement
        return { successful: false, error: 'Unknown error occurred.' };
    }

    private determineInstanceStatus(state: LXDInstanceState): enumInstanceStatus {
        switch (state.status) {
            case 'Running':
                return enumInstanceStatus.RUNNING;
            case 'Stopped':
                return enumInstanceStatus.STOPPED;
            case 'Error':
                return enumInstanceStatus.FAILED;
            default:
                Logger.error(`Unknown instance state: ${state.status}`);
                return enumInstanceStatus.FAILED;
        }
    }
}