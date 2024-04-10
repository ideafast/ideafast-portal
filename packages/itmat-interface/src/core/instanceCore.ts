import { IInstance,enumInstanceStatus, enumAppType, enumOpeType, IUser, enumUserTypes} from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../database/database';
import { TRPCError } from '@trpc/server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';
import { jobCore } from './jobCore'; // Ensure you have the correct import path
import { userCore } from './userCore';
import { enumJobType} from '@itmat-broker/itmat-types'; // Ensure you have the correct import path
import * as mfa from '../utils/mfa';

export class InstanceCore {

    /**
     * Create an instance.
     *
     * @param userId - The id of the user creating the instance.
     * @param name - The name of the instance.
     * @param type - The type of the instance ('virtual-machine' or 'container').
     * @param appType - The application type of the instance (e.g., 'Jupyter', 'Matlab').
     * @param lifeSpan - The life span of the instance in seconds.
     * @param project - The LXD project of the instance (optional, defaults to 'default').
     *
     * @return IInstance
     */
    public async createInstance(userId: string, username: string, name: string, type: 'virtual-machine' | 'container',
        appType: enumAppType, lifeSpan: number, project = 'default', cpuLimit?: number, memoryLimit?: string): Promise<IInstance> {

        // generate the token for instance
        let instanceSystemToken;
        try {
            const data = await userCore.issueSystemAccessToken(userId);
            instanceSystemToken = data.accessToken;
            console.log('Token issueSystemAccessToken', instanceSystemToken);
        } catch (error) {
            console.error('Error generating token:', error);
            throw new Error('Error generating instance token.');
        }
        const notebookToken = mfa.generateSecret(20);
        // Prepare user-data for cloud-init to append the token to /etc/profile
        const cloudInitUserData = `
        #cloud-config
        users:
          - name: ubuntu
            groups: sudo
            sudo: ['ALL=(ALL) NOPASSWD:ALL']
            shell: /bin/bash
        write_files:
          - path: /etc/profile.d/instance_token.sh
            content: |
              export INSTANCE_TOKEN="${instanceSystemToken}"
            permissions: '0755'
          - path: /root/.jupyter/jupyter_notebook_config.py
            content: |
              c.NotebookApp.ip = '0.0.0.0'
              c.NotebookApp.port = 8888
              c.NotebookApp.open_browser = False
              c.NotebookApp.token = '${notebookToken}'
              c.NotebookApp.password = ''
              c.NotebookApp.allow_root = True
            permissions: '0644'
        `;

        // add boot-time script, to be executed on first boot
        const config = {
            'limits.cpu': cpuLimit ? cpuLimit.toString() : '2',
            'limits.memory': memoryLimit ? memoryLimit : '4GB',
            'user.username': username, // store username to instance config
            'user.user-data': cloudInitUserData
        };

        const instanceEntry: IInstance = {
            id: uuid(),
            name,
            userId,
            username,
            status: enumInstanceStatus.PENDING,
            type,
            appType,
            createAt: Date.now(),
            lifeSpan,
            instanceToken: instanceSystemToken,
            notebookToken: notebookToken,
            project,
            webDavToken: instanceSystemToken, // Assign or generate as needed, System token
            life: {
                createdTime: Date.now(),
                createdUser: userId,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {},
            config: config
        };

        await db.collections!.instance_collection.insertOne(instanceEntry);

        // Create the job to create the LXD instance on LXD server
        const jobName = `Create LXD Instance: ${name}`;
        const jobType = enumJobType.LXD;
        const executorPath = '/lxd'; // The executor path for LXD jobs

        // Override defaults if cpuLimit and memoryLimit are provided
        if (cpuLimit) {
            config['limits.cpu'] = cpuLimit.toString(); // Ensure it's a string
        }
        if (memoryLimit) {
            config['limits.memory'] = memoryLimit;
        }

        // Construct the payload from the job document parameters
        // Prepare job data including the operation and instanceId
        const lxd_metadata = {
            operation: enumOpeType.CREATE,
            instanceId: instanceEntry.id,
            payload: {
                name: name,
                architecture: 'x86_64',
                config: config,
                source: {
                    type: 'image',
                    alias: type==='virtual-machine'? 'ubuntu-matlab-image' : 'ubuntu-jupyter-container-image' // Example fingerprint, adjust as necessary
                },
                profiles: [ type==='virtual-machine'? 'matlab-profile' : 'jupyter-profile'], // Assuming 'default' profile, adjust as necessary
                type: type // 'virtual-machine' or 'container'
            // Include other fields as required by your LXD setup
            }
        };

        // Call the createJob method of JobCore to create a new job
        await jobCore.createJob(
            userId,
            jobName,
            jobType,
            undefined,
            undefined,
            { path: executorPath },
            null,
            null,
            1,
            lxd_metadata);

        return instanceEntry;
    }

    /**
     * Start and Stop instance
     */
    public async startStopInstance(userId: string, instanceId: string, action: 'start' | 'stop'): Promise<IInstance> {
        // Retrieve instance details from the database
        const instance = await db.collections!.instance_collection.findOne({ id: instanceId });
        if (!instance) {
            throw new Error('Instance not found.');
        }
        // update the instance status
        // Optimistically update the instance status
        const newStatus = action === 'start' ? enumInstanceStatus.STARTING : enumInstanceStatus.STOPPING;
        await db.collections!.instance_collection.updateOne({ id: instanceId }, {
            $set: { status: newStatus }
        });


        // Create the job to start/stop the LXD instance on the LXD server
        const jobName = `${action.toUpperCase()} LXD Instance: ${instance.name}`;
        const jobType = enumJobType.LXD;
        const executorPath = `/lxd/${action}`;

        const lxd_metadata = {
            operation: action,
            instanceId: instance.id
        };

        // Call the createJob method of JobCore to create a new job for starting/stopping the instance
        await jobCore.createJob(userId, jobName, jobType, undefined, undefined, { path: executorPath }, null, null, 1, lxd_metadata);

        // Optionally, immediately return the instance object or wait for the job to complete based on your application's needs
        return instance;
    }



    /**
     * Delete an instance.
     */
    public async deleteInstance(UserId: string, instanceId: string): Promise<boolean> {
        const result = await db.collections!.instance_collection.findOneAndUpdate({ id: instanceId }, {
            $set: {
                'life.deletedTime': Date.now(),
                'life.deletedUser': UserId,
                'status': enumInstanceStatus.DELETED
            }
        }, {
            returnDocument: 'after'
        });

        if (!result.ok) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Instance does not exist or delete failed.'
            });
        }
        if (!result.value) { // Check if a document was found and updated
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Instance does not exist or delete failed.'
            });
        }

        const instance = result.value; // Access the updated document

        // Create the job to delete the LXD instance on the LXD server
        const jobName = `DELETE LXD Instance: ${instance.name}`;
        const jobType = enumJobType.LXD;
        const executorPath = '/lxd/delete';

        const lxd_metadata = {
            operation: enumOpeType.DELETE,
            instanceId: instance.id
        };

        // Call the createJob method of JobCore to create a new job for deleting the instance
        await jobCore.createJob(instance.userId, jobName, jobType, undefined, undefined, { path: executorPath }, null, null, 1, lxd_metadata);
        return true;
    }

    /**
     * Get all instances.
     *
     * @return IInstance[]
     */
    public async getInstances(userId: string): Promise<IInstance[]> {
        return await db.collections!.instance_collection.find({userId}).toArray();
    }

    /**
     * Edit an instance.
     *
     * @param userId - The id of the user editing the instance.
     * @param instanceId - The id of the instance to edit.
     * @param updates - Object containing the fields to update.
     *
     * @return IInstance
     */
    public async editInstance(requester: IUser, instanceId: string, instanceName: string, updates: Record<string, any>): Promise<IInstance> {
        let instance;
        if (instanceId) {
            instance = await db.collections!.instance_collection.findOne({ id: instanceId });
        } else if (instanceName) {
            instance = await db.collections!.instance_collection.findOne({ name: instanceName });
        }

        if (!instance) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Instance does not exist.'
            });
        }

        if (requester.username !== instance.username || requester.type !== enumUserTypes.ADMIN) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'User does not have permission to edit this instance.'
            });
        }


        // Update the config object directly if cpuLimit or memoryLimit are provided
        if (updates.cpuLimit || updates.memoryLimit) {
            const currentConfig = instance.config ?? {};

            updates.config = {
                // ...instance.config,
                'limits.cpu': updates.cpuLimit?.toString() || currentConfig['limits.cpu'],
                'limits.memory': updates.memoryLimit || currentConfig['limits.memory']
            };

            // Remove cpuLimit and memoryLimit from the top-level updates object
            delete updates.cpuLimit;
            delete updates.memoryLimit;
        }
        const query = instanceId ? { id: instanceId } : { name: instanceName };

        const result= await db.collections!.instance_collection.findOneAndUpdate(query, {
            $set: updates
        }, {
            returnDocument: 'after'
        });
        if (!result || !result.value) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Failed to update instance.'
            });
        }

        // Create the job to update the LXD instance on the LXD server
        // Prepare job metadata for the LXD operation
        const metadata = {
            operation: enumOpeType.UPDATE,
            instanceToken: instance.instanceToken ?? '',
            instanceId: result.value.id,
            updates: updates
        };

        // Create the job for the LXD operation
        const jobName = `Update Config for Instance: ${result.value.name}`;
        await jobCore.createJob(requester.id, jobName, enumJobType.LXD, undefined, undefined, { path: '/instances/:instanceName/update' }, null, null, 1, metadata);


        return result.value;
    }

}

export const instanceCore = Object.freeze(new InstanceCore());
