import { IInstance,enumInstanceStatus, enumAppType, IUser, enumUserTypes} from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { db } from '../database/database';
import { TRPCError } from '@trpc/server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';
import { jobCore} from './jobCore'; // Ensure you have the correct import path
import { userCore } from './userCore';
import { enumJobType, enumOpeType,enumMonitorType, enumJobStatus } from '@itmat-broker/itmat-types'; // Ensure you have the correct import path
import * as mfa from '../utils/mfa';
// import the config and rename to dmpConfig
import config  from '../utils/configManager';
import { Logger } from '@itmat-broker/itmat-commons';

export class InstanceCore {
    private previousCpuUsage: Record<string, number> = {};
    private previousCpuTimestamp: Record<string, number> = {};

    /**
     * Get the memory value from the memory string.
     * @param memoryStr - The memory string to parse. like '4GB'
     * @returns number
     */
    private parseMemory(memoryStr: string): number {
        const units: Record<string, number> = {
            B: 1,
            KB: 1024,
            MB: 1024 * 1024,
            GB: 1024 * 1024 * 1024
        };

        const match = memoryStr.match(/^(\d+(?:\.\d+)?)([KMGT]?B)$/);
        if (!match) {
            throw new Error(`Invalid memory string: ${memoryStr}`);
        }

        const value = parseFloat(match[1]);
        const unit = match[2];

        return value * (units[unit] || 1);
    }
    /**
     * Get an instance by ID.
     *
     * @param instanceId - The ID of the instance to retrieve.
     * @return IInstance - The instance object.
     */
    public async getInstanceById(instanceId: string): Promise<IInstance> {
        const instance = await db.collections!.instance_collection.findOne({ id: instanceId });
        if (!instance) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Instance not found.'
            });
        }
        return instance;
    }

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
        } catch (error) {
            Logger.error(`Error generating token: ${error}`);
            throw new Error('Error generating instance token.');
        }
        const notebookToken = mfa.generateSecret(20);

        const webdavServer = `${config.webdavServer}:${config.webdavPort}`;
        const webdavMountPath = config.webdavMountPath;

        const instanceProfile = type==='virtual-machine'? 'matlab-profile' : 'jupyter-profile';

        // Prepare user-data for cloud-init to initialize the instance
        const cloudInitUserDataContainer = `
#cloud-config
packages:
  - davfs2
users:
  - name: ubuntu
    groups: sudo
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    shell: /bin/bash
write_files:
  - path: /etc/profile.d/instance_token.sh
    content: |
      export DMP_TOKEN="${instanceSystemToken}"
    permissions: '0755'
  - path: /etc/davfs2/secrets
    content: |
      ${webdavServer} ubuntu ${instanceSystemToken}
    permissions: '0600'
  - path: /etc/systemd/system/webdav-mount.service
    content: |
      [Unit]
      Description=Mount WebDAV on startup
      After=network.target
      [Service]
      Type=oneshot
      ExecStart=/bin/mount -t davfs ${webdavServer} ${webdavMountPath} -o rw,uid=ubuntu,gid=ubuntu
      ExecStartPre=/bin/mkdir -p ${webdavMountPath}
      RemainAfterExit=true
      [Install]
      WantedBy=multi-user.target
    permissions: '0644'
runcmd:
  - |
    DEFAULT_USER="\${USERNAME:-ubuntu}"
    if ! getent group nopasswdlogin > /dev/null; then
      addgroup nopasswdlogin
    fi
    if ! id -u \${DEFAULT_USER} > /dev/null 2>&1; then
      adduser \${DEFAULT_USER} nopasswdlogin || true
    fi
    passwd -d \${DEFAULT_USER} || true
    echo "@reboot \${DEFAULT_USER} DISPLAY=:0 /home/\${DEFAULT_USER}/disable_autolock.sh" | crontab -u \${DEFAULT_USER} -
    cat << 'EOF' > "/home/\${DEFAULT_USER}/disable_autolock.sh"
    #!/bin/bash
    if [ -z "\${DISPLAY}" ]; then
      echo "No DISPLAY available. Skipping GUI settings."
    else
      dbus-launch gsettings set org.gnome.desktop.screensaver lock-enabled false
      dbus-launch gsettings set org.gnome.desktop.session idle-delay 0
    fi
    EOF
    chmod +x "/home/\${DEFAULT_USER}/disable_autolock.sh"
    chown \${DEFAULT_USER}: "/home/\${DEFAULT_USER}/disable_autolock.sh"
  - sleep 10
  - systemctl daemon-reload
  - systemctl enable webdav-mount.service
  - systemctl start webdav-mount.service
  - |
    if [ -d "/home/\${DEFAULT_USER}" ]; then
      ln -sf ${webdavMountPath} "/home/\${DEFAULT_USER}/MyDrive"
      chown \${DEFAULT_USER}:\${DEFAULT_USER} "/home/\${DEFAULT_USER}/${username}_Drive"
    fi
  - source /etc/profile.d/dmpy.sh
  - source /etc/profile.d/instance_token.sh
`;


        const cloudInitUserDataVM = `
#cloud-config
packages:
  - davfs2
users:
  - name: ubuntu
    groups: sudo
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    shell: /bin/bash
write_files:
  - path: /etc/profile.d/instance_token.sh
    content: |
      export DMP_TOKEN="${instanceSystemToken}"
    permissions: '0755'
  - path: /etc/davfs2/secrets
    content: |
      ${webdavServer} ubuntu ${instanceSystemToken}
    permissions: '0600'
  - path: /etc/systemd/system/webdav-mount.service
    content: |
      [Unit]
      Description=Mount WebDAV on startup
      After=network.target
      [Service]
      Type=oneshot
      ExecStart=/bin/mount -t davfs ${webdavServer} ${webdavMountPath} -o rw,uid=ubuntu,gid=ubuntu
      ExecStartPre=/bin/mkdir -p ${webdavMountPath}
      RemainAfterExit=true
      [Install]
      WantedBy=multi-user.target
    permissions: '0644'
runcmd:
  # Removing MATLAB licenses
  - rm -rf /usr/local/MATLAB/R2022b/licenses/
  - rm /home/ubuntu/.matlab/R2022b_licenses/license_matlab-ubuntu-vm_600177_R2022b.lic
  - rm /usr/local/MATLAB/R2022b/licenses/license.dat
  - rm /usr/local/MATLAB/R2022b/licenses/license*.lic
  # New commands for user setup
  - |
    DEFAULT_USER="\${USERNAME:-ubuntu}"
    if ! getent group nopasswdlogin > /dev/null; then
      addgroup nopasswdlogin
    fi
    if ! id -u \${DEFAULT_USER} > /dev/null 2>&1; then
      adduser \${DEFAULT_USER} nopasswdlogin || true
    fi
    passwd -d \${DEFAULT_USER} || true
    echo "@reboot \${DEFAULT_USER} DISPLAY=:0 /home/\${DEFAULT_USER}/disable_autolock.sh" | crontab -u \${DEFAULT_USER} -
    cat << 'EOF' > "/home/\${DEFAULT_USER}/disable_autolock.sh"
    #!/bin/bash
    if [ -z "\${DISPLAY}" ]; then
      echo "No DISPLAY available. Skipping GUI settings."
    else
      dbus-launch gsettings set org.gnome.desktop.screensaver lock-enabled false
      dbus-launch gsettings set org.gnome.desktop.session idle-delay 0
    fi
    EOF
    chmod +x "/home/\${DEFAULT_USER}/disable_autolock.sh"
    chown \${DEFAULT_USER}: "/home/\${DEFAULT_USER}/disable_autolock.sh"
  - sleep 10
  - systemctl daemon-reload
  - systemctl enable webdav-mount.service
  - systemctl start webdav-mount.service
  - | 
    if [ -d "/home/\${DEFAULT_USER}/Desktop" ]; then
      ln -sf ${webdavMountPath} "/home/\${DEFAULT_USER}/Desktop/${username}_Drive"
      chown \${DEFAULT_USER}:\${DEFAULT_USER} "/home/\${DEFAULT_USER}/Desktop/MyDrive"
    fi
  - source /etc/profile.d/dmpy.sh
  - source /etc/profile.d/instance_token.sh
`;

        const cloudInitUserData = type ==='virtual-machine'? cloudInitUserDataVM : cloudInitUserDataContainer;
        // add boot-time script, to be executed on first boot
        const instaceConfig = {
            'limits.cpu': cpuLimit ? cpuLimit.toString() : '2',
            'limits.memory': memoryLimit ? memoryLimit : '4GB',
            'user.username': username, // store username to instance config
            'user.user-data': cloudInitUserData // set the cloud-init user-data
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
            config: instaceConfig
        };

        await db.collections!.instance_collection.insertOne(instanceEntry);

        // Create the job to create the LXD instance on LXD server
        const jobName = `Create ${appType} Instance: ${name}`;
        const jobType = enumJobType.LXD;
        const executorPath = '/lxd'; // The executor path for LXD jobs

        // Override defaults if cpuLimit and memoryLimit are provided
        if (cpuLimit) {
            instaceConfig['limits.cpu'] = cpuLimit.toString(); // Ensure it's a string
        }
        if (memoryLimit) {
            instaceConfig['limits.memory'] = memoryLimit;
        }

        // Construct the payload from the job document parameters
        // Prepare job data including the operation and instanceId
        const lxd_metadata = {
            operation: enumOpeType.CREATE,
            instanceId: instanceEntry.id,
            payload: {
                name: name,
                architecture: 'x86_64',
                config: instaceConfig,
                source: {
                    type: 'image',
                    alias: type==='virtual-machine'? 'ubuntu-matlab-image' : 'ubuntu-jupyter-container-image'
                },
                profiles: [instanceProfile],
                type: type // 'virtual-machine' or 'container'
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
        const jobName = `${action.toUpperCase()} ${instance.appType} Instance: ${instance.name}`;
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
     * restartInstance with new lifespan, and update the instance's create time
     */
    public async restartInstance(userId: string, instanceId: string, lifeSpan: number): Promise<IInstance> {

        // Update the instance's create time and lifespan
        const result = await db.collections!.instance_collection.findOneAndUpdate({ id: instanceId }, {
            $set: {
                createAt: Date.now(),
                lifeSpan: lifeSpan,
                status: enumInstanceStatus.STARTING

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
        const instance = result.value;


        // Create the job to update the LXD instance on the LXD server
        const jobName = `Restart ${instance.appType} Instance: ${instance.name}`;
        const jobType = enumJobType.LXD;
        const executorPath = '/lxd/start';

        const lxd_metadata = {
            operation: enumOpeType.START,
            instanceId: instance.id
        };

        // Call the createJob method of JobCore to create a new job for restarting the instance
        await jobCore.createJob(userId, jobName, jobType, undefined, undefined, { path: executorPath }, null, null, 1, lxd_metadata);


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
        const appType = instance.appType;

        // Create the job to delete the LXD instance on the LXD server
        const jobName = `DELETE ${appType} Instance: ${instance.name}`;
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
 * Get all instances and update their status based on lifespan.
 *
 * @param userId The ID of the user managing instances.
 * @return IInstance[] The list of instances.
 */
    public async getInstances(userId: string): Promise<IInstance[]> {
    // Retrieve all instances that haven't been deleted
        const instances = await db.collections!.instance_collection.find({
            // status is not DELETED
            status: { $nin: [enumInstanceStatus.DELETED] },
            userId: userId  // Ensure to only fetch instances related to the userId if necessary
        }).toArray();

        //  create a LXD_MONITOR job to update the status of the instances
        const jobName = `Update Instance Status of User: ${userId}`;
        const jobType = enumJobType.LXD_MONITOR;
        const executorPath = '/lxd/monitor';
        const period = 60 * 1000; // 1 minute
        // Check if there is a pending job for the user instances update
        // Check if a pending job already exists
        const existingJobs = await jobCore.getJob({ name: jobName, type: jobType, status: enumJobStatus.PENDING });

        if (existingJobs.length === 0) {
            console.log('Creating job for instance monitoring', userId);
            const metadata = {
                operation: enumMonitorType.STATE,
                userId: userId
            };
            await jobCore.createJob(userId, jobName, jobType, undefined, period, { path: executorPath }, null, null, 1, metadata);
        } else {
            console.log('Pending job already exists for instance monitoring', userId);
        }


        const now = Date.now();

        // Create a series of promises to handle lifespan and status updates
        const updates = instances.map(async (instance) => {
            const lifeDuration = now - instance.createAt;
            const remainingLife = instance.lifeSpan * 3600000 - lifeDuration;

            // Check if the lifespan has been exceeded
            if (remainingLife <= 0) {
            // Check if the instance is not already stopped
                if (instance.status !== enumInstanceStatus.STOPPED && instance.status !== enumInstanceStatus.STOPPING
                    && instance.status !== enumInstanceStatus.FAILED
                ) {
                    // Stop the instance and update status in the database
                    await this.startStopInstance(userId, instance.id, 'stop');
                }

                await db.collections!.instance_collection.updateOne(
                    { id: instance.id },
                    {
                        $set: {
                            lifeSpan: 0  // Reset lifespan to zero as it's now considered ended
                        }
                    }
                );

            }

            // Ensure instance config and limits exist
            const cpuLimit = instance.config?.['limits.cpu'] ? parseInt(instance.config['limits.cpu']) : 1;
            const memoryLimit = instance.config?.['limits.memory'] ? this.parseMemory(instance.config['limits.memory']) : 4 * 1024 * 1024 * 1024; // Default to 4GB

            let cpuUsage = 0;
            let memoryUsage = 0;

            if (instance.status === enumInstanceStatus.RUNNING && instance.lxdState) {
                const cpuUsageRaw = instance.lxdState.cpu.usage;
                const memoryUsageRaw = instance.lxdState.memory.usage;


                // Retrieve previous values from metadata or initialize them if not present
                // Retrieve previous values from local storage
                // Retrieve previous values from local storage (or instance metadata if necessary)
                const previousCpuUsageRaw = this.previousCpuUsage[instance.id] || 0;
                const previousTimestamp = this.previousCpuTimestamp[instance.id] || now;


                // Calculate the time interval in seconds
                const intervalSeconds = (now - previousTimestamp) / 1000;

                // Calculate the difference in CPU usage
                const cpuUsageDelta = cpuUsageRaw - previousCpuUsageRaw;

                // Convert CPU usage delta to seconds
                const cpuUsageDeltaSeconds = cpuUsageDelta / 1e9;

                // Calculate CPU usage percentage
                if (intervalSeconds > 0) {
                    cpuUsage = (cpuUsageDeltaSeconds / (cpuLimit * intervalSeconds)) * 100;
                }

                // Calculate memory usage percentage
                memoryUsage = (memoryUsageRaw / memoryLimit) * 100;

                // Store the current values for the next calculation
                this.previousCpuUsage[instance.id] = cpuUsageRaw;
                this.previousCpuTimestamp[instance.id] = now;

            }

            // Assign CPU and memory usage to instance metadata
            instance.metadata = {
                ...instance.metadata,
                cpuUsage: cpuUsage > 100 ? 100 : (cpuUsage < 0 ? 0 : Math.round(cpuUsage)), // Clamp values between 0 and 100
                memoryUsage: memoryUsage > 100 ? 100 : (memoryUsage < 0 ? 0 : Math.round(memoryUsage)) // Clamp values between 0 and 100
            };

            // resolve the promise with the instance object
            return instance;
        });

        // Wait for all updates to complete
        await Promise.all(updates);

        // Fetch and return the updated list of instances
        return instances.map(instance => {
            // calculate the cpu and memory usage percentage, only for running instances
            //  TODO, {cpuUsage: 0, memoryUsage: 0}

            // This will provide the updated remaining life span without persisting it
            const lifeDuration = now - instance.createAt;
            const remainingLifeHours = (instance.lifeSpan * 3600000 - lifeDuration) / 3600000;
            return {
                ...instance,
                lifeSpan: remainingLifeHours > 0 ? remainingLifeHours : 0
            };
        });
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
        // Prepare job metadata for the LXD update operation
        const metadata = {
            operation: enumOpeType.UPDATE,
            instanceToken: instance.instanceToken ?? '',
            instanceId: result.value.id,
            updates: updates
        };
        const appType = result.value.appType;

        // Create the job for the LXD operation
        const jobName = `Update Config for ${appType} Instance: ${result.value.name}`;
        await jobCore.createJob(requester.id, jobName, enumJobType.LXD, undefined, undefined, { path: '/instances/:instanceName/update' }, null, null, 1, metadata);


        return result.value;
    }
}

export const instanceCore = Object.freeze(new InstanceCore());
