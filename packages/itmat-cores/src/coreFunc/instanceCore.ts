import { CoreError, enumCoreErrors, IInstance, LXDInstanceTypeEnum, enumInstanceStatus, enumAppType, IUser, enumUserTypes, enumJobType, enumOpeType, enumMonitorType, enumJobStatus} from '@itmat-broker/itmat-types';
import { v4 as uuid } from 'uuid';
import { DBType } from '../database/database';
import { Logger, Mailer} from '@itmat-broker/itmat-commons';
import { IConfiguration} from '../utils';
import { ConfigCore } from './configCore';
import { JobCore} from './jobCore'; // Ensure you have the correct import path
import { UserCore } from './userCore';

export class InstanceCore {
    db: DBType;
    mailer: Mailer;
    config: IConfiguration;
    configCore: ConfigCore;
    JobCore: JobCore;
    UserCore: UserCore;
    private previousCpuUsage: Record<string, number> = {};
    private previousCpuTimestamp: Record<string, number> = {};

    constructor(db: DBType, mailer: Mailer, config: IConfiguration, jobCore: JobCore, userCore: UserCore) {
        this.db = db;
        this.mailer = mailer;
        this.config = config;
        this.configCore = new ConfigCore(db);
        this.JobCore = jobCore;
        this.UserCore = userCore;
    }

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
        const instance = await this.db.collections.instance_collection.findOne({ id: instanceId });
        if (!instance) {
            throw new CoreError(enumCoreErrors.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY,
                'Instance not found.'
            );
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
    public async createInstance(userId: string, username: string, name: string, type: LXDInstanceTypeEnum,
        appType: enumAppType, lifeSpan: number, project = 'default', cpuLimit?: number, memoryLimit?: string): Promise<IInstance> {

        const instance_id = uuid();  // Generate a unique ID for the instance

        // generate the token for instance
        let instanceSystemToken;
        try {
            // fake Id
            const data = await this.UserCore.issueSystemAccessToken(userId);
            instanceSystemToken = data.accessToken;
        } catch (error) {
            Logger.error(`Error generating token: ${error}`);
            throw new Error('Error generating instance token.');
        }

        const webdavServer = this.config.webdavServer;
        const webdavMountPath = `/home/ubuntu/${username}_Drive`;

        const instanceProfile = type===LXDInstanceTypeEnum.VIRTUAL_MACHINE? 'matlab-profile' : 'jupyter-profile';

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
  - path: /root/.jupyter/jupyter_notebook_config.py
    content: |
      c.NotebookApp.ip = "0.0.0.0"
      c.NotebookApp.port = ${this.config.jupyterPort}
      c.NotebookApp.open_browser = False
      c.NotebookApp.token = ""
      c.NotebookApp.password = ""
      c.NotebookApp.allow_root = True
      c.NotebookApp.base_url = "/jupyter/${instance_id}"
      c.NotebookApp.notebook_dir = "/home/ubuntu"
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

        const cloudInitUserData = type ===LXDInstanceTypeEnum.VIRTUAL_MACHINE? cloudInitUserDataVM : cloudInitUserDataContainer;
        // add boot-time script, to be executed on first boot
        const instaceConfig = {
            'limits.cpu': cpuLimit ? cpuLimit.toString() : '2',
            'limits.memory': memoryLimit ? memoryLimit : '4GB',   // TODO,set all create to be a default size, only open to admin to choose the size.
            'user.username': username, // store username to instance config
            'user.user-data': cloudInitUserData // set the cloud-init user-data
        };

        const instanceEntry: IInstance = {
            id: instance_id,
            name,
            userId,
            username,
            status: enumInstanceStatus.PENDING,
            type,
            appType,
            createAt: Date.now(),
            lifeSpan,
            instanceToken: instanceSystemToken,
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

        await this.db.collections.instance_collection.insertOne(instanceEntry);

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
                    alias: type===LXDInstanceTypeEnum.VIRTUAL_MACHINE? 'ubuntu-matlab-image' : 'ubuntu-jupyter-container-image'
                },
                profiles: [instanceProfile],
                type: type // 'virtual-machine' or 'container'
            }
        };

        // Call the createJob method of JobCore to create a new job
        await this.JobCore.createJob(
            userId,
            jobName,
            jobType,
            undefined,
            undefined,
            { path: executorPath, type: 'lxd', id: instance_id },
            null,
            null,
            1,
            lxd_metadata);

        return instanceEntry;
    }

    /**
     * Start and Stop instance
     */
    public async startStopInstance(userId: string, instanceId: string, action: enumOpeType.START | enumOpeType.STOP): Promise<IInstance> {
        // Retrieve instance details from the database
        const instance = await this.db.collections.instance_collection.findOne({ id: instanceId });
        if (!instance) {
            throw new Error('Instance not found.');
        }
        // update the instance status
        // Optimistically update the instance status
        const newStatus = action === 'start' ? enumInstanceStatus.STARTING : enumInstanceStatus.STOPPING;
        await this.db.collections.instance_collection.updateOne({ id: instanceId }, {
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
        await this.JobCore.createJob(userId, jobName, jobType, undefined, undefined, { id: instanceId, type: 'lxd', path: executorPath }, null, null, 1, lxd_metadata);

        // Optionally, immediately return the instance object or wait for the job to complete based on your application's needs
        return instance;
    }

    /**
     * restartInstance with new lifespan, and update the instance's create time
     * TODO: also generate and update the instance token
     */
    public async restartInstance(userId: string, instanceId: string, lifeSpan: number): Promise<IInstance> {

        // Update the instance's create time and lifespan
        const result = await this.db.collections.instance_collection.findOneAndUpdate({ id: instanceId }, {
            $set: {
                createAt: Date.now(),
                lifeSpan: lifeSpan,
                status: enumInstanceStatus.STARTING

            }
        }, {
            returnDocument: 'after'
        });

        if (!result) { // Check if a document was found and updated
            throw new CoreError(
                enumCoreErrors.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY,
                'Instance does not exist or update failed.');
        }
        const instance = result;

        // Create the job to update the LXD instance on the LXD server
        const jobName = `Restart ${instance.appType} Instance: ${instance.name} for user ${userId}`;
        const jobType = enumJobType.LXD;
        const executorPath = '/lxd/start';

        const lxd_metadata = {
            operation: enumOpeType.START,
            instanceId: instance.id
        };

        // Call the createJob method of JobCore to create a new job for restarting the instance
        await this.JobCore.createJob(userId, jobName, jobType, undefined, undefined, { id: instanceId, type: 'lxd', path: executorPath }, null, null, 1, lxd_metadata);


        return instance;
    }


    /**
     * Delete an instance.
     */
    public async deleteInstance(UserId: string, instanceId: string): Promise<boolean> {
        const result = await this.db.collections.instance_collection.findOneAndUpdate({ id: instanceId }, {
            $set: {
                'life.deletedTime': Date.now(),
                'life.deletedUser': UserId,
                'status': enumInstanceStatus.DELETED
            }
        }, {
            returnDocument: 'after'
        });

        if (!result) { // Check if a document was found and updated
            throw new CoreError(
                enumCoreErrors.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY,
                'Instance does not exist or delete failed.');
        }

        const instance = result; // Access the updated document
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
        await this.JobCore.createJob(instance.userId, jobName, jobType, undefined, undefined, { id: instanceId, type: 'lxd', path: executorPath }, null, null, 1, lxd_metadata);
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
        const instances = await this.db.collections.instance_collection.find({
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
        const existingJobs = await this.JobCore.getJob({ name: jobName, type: jobType, status: enumJobStatus.PENDING });

        if (existingJobs.length === 0) {
            const metadata = {
                operation: enumMonitorType.STATE,
                userId: userId
            };
            const instanceIds = instances.map(instance => instance.id).join('|');
            await this.JobCore.createJob(userId, jobName, jobType, undefined, period, { id: instanceIds, type: 'lxd', path: executorPath }, null, null, 1, metadata);
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
                    await this.startStopInstance(userId, instance.id, enumOpeType.STOP);
                }

                await this.db.collections.instance_collection.updateOne(
                    { id: instance.id },
                    {
                        $set: {
                            lifeSpan: 0  // Reset lifespan to zero as it's now considered ended
                        }
                    }
                );

            }
            // Ensure instance config and limits exist
            const cpuLimit = 'limits.cpu' in instance.config ? parseInt(instance.config['limits.cpu'] as string) : 1;
            const memoryLimit = 'limits.memory' in instance.config ? this.parseMemory(instance.config['limits.memory'] as string) : 4 * 1024 * 1024 * 1024; // Default to 4GB

            let cpuUsage = 0;
            let memoryUsage = 0;

            if (instance.status === enumInstanceStatus.RUNNING && instance.lxdState) {
                const cpuUsageRaw = instance.lxdState.cpu.usage;
                const memoryUsageRaw = instance.lxdState.memory.usage;

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
    public async editInstance(requester: IUser, instanceId: string | null | undefined, instanceName: string | null | undefined, updates: Record<string, unknown>): Promise<IInstance> {

        // Check that at least one of the identifier fields is provided
        if (!instanceId && !instanceName) {
            throw new CoreError(
                enumCoreErrors.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY,
                'Instance ID or name must be provided.'
            );
        }

        // Find the instance by either ID or name
        const instanceQuery: Record<string, unknown> = {};
        if (instanceId) instanceQuery['id'] = instanceId;
        if (instanceName) instanceQuery['name'] = instanceName;

        const instance = await this.db.collections.instance_collection.findOne(instanceQuery);

        if (!instance) {
            throw new CoreError(
                enumCoreErrors.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY,
                'Instance does not exist.'
            );
        }


        // Check if the requester has permission to edit the instance
        if (requester.username !== instance.username && requester.type !== enumUserTypes.ADMIN) {
            throw new CoreError(
                enumCoreErrors.NO_PERMISSION_ERROR,
                'User does not have permission to edit this instance.'
            );
        }

        // Update the config object directly if cpuLimit or memoryLimit are provided
        if (updates['cpuLimit'] || updates['memoryLimit']) {
            const currentConfig = instance.config ?? {};

            updates['config'] = {
                ...currentConfig, // Preserve existing config values
                'limits.cpu': updates['cpuLimit']?.toString() || currentConfig['limits.cpu'],
                'limits.memory': updates['memoryLimit'] || currentConfig['limits.memory']
            };

            // Remove top-level cpuLimit and memoryLimit after applying to config
            delete updates['cpuLimit'];
            delete updates['memoryLimit'];
        }
        // Update the instance in the database
        const result = await this.db.collections.instance_collection.findOneAndUpdate(
            { _id: instance._id }, // Use the unique `_id` from MongoDB
            { $set: updates },
            { returnDocument: 'after' }
        );

        if (!result) {
            throw new CoreError(
                enumCoreErrors.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY,
                'Failed to update the instance.'
            );
        }

        // Create the job to update the LXD instance on the LXD server
        // Prepare job metadata for the LXD update operation
        const metadata = {
            operation: enumOpeType.UPDATE,
            instanceToken: instance.instanceToken ?? '',
            instanceId: result.id,
            updates: updates
        };
        const appType = result.appType;

        // Create the job for the LXD operation
        // TODO: better to package all of them to the jobCore as a attch function
        const jobName = `Update Config for ${appType} Instance: ${result.name}`;
        const executorPath = '/lxd/update';
        await this.JobCore.createJob(requester.id, jobName, enumJobType.LXD, undefined, undefined, { id: instanceId || instanceName || '', type: 'lxd', path: executorPath }, null, null, 1, metadata);


        return result;
    }

    // get the ip of the instance by instanceId or update the state of the instance

    /**
     * Get or update the container IP (state) from the database or trigger monitor if not available.
     *
     * @param instance_id - The ID of the instance.
     * @param user_id - The user ID (optional, for ownership validation).
     * @return string | null - The container IP, or null if not available.
     */
    public async getContainerIP(instance_id: string, user_id?: string) {
        // Retrieve the instance by the instance_id
        const instance: IInstance = await this.getInstanceById(instance_id);

        // Check instance ownership
        if (user_id && instance.userId !== user_id) {
            Logger.error('User not authorized to access the instance');
            throw new Error('User not authorized to access the instance');
        }

        // If instance is not running, return null (no IP available)
        if (instance.status !== 'RUNNING') {
            Logger.warn(`Instance ${instance_id} is not running, no IP available.`);
            return null;
        }

        // Check if the instance state is available in the database (via the monitor job)
        if (instance.lxdState && instance.lxdState.network && instance.lxdState.network['eth0']) {
            const ipv4Address = instance.lxdState.network['eth0'].addresses
                .filter((addr) => addr.family === 'inet')
                .map((addr) => addr.address)[0];

            if (ipv4Address) {
                return {ip: ipv4Address, port: this.config.jupyterPort};
            }
        }

        // If the state is not available, trigger the monitor job if it doesn't exist
        const existingMonitorJob = await this.JobCore.getJob({
            name: `Update Instance Status of User: ${instance.userId}`,
            type: enumJobType.LXD_MONITOR,
            status: enumJobStatus.PENDING
        });

        if (existingMonitorJob.length === 0) {
            // No pending monitor job, create one
            const jobName = `Update Instance Status of User: ${instance.userId}`;
            const jobType = enumJobType.LXD_MONITOR;
            const executorPath = '/lxd/monitor';
            const period = 60 * 1000; // 1 minute

            const metadata = {
                operation: enumMonitorType.STATE,
                userId: user_id
            };

            await this.JobCore.createJob(
                instance.userId,
                jobName,
                jobType,
                undefined,
                period,
                { id: instance.id, type: 'lxd', path: executorPath },
                null,
                null,
                1,
                metadata
            );

            Logger.warn(`Monitor job created for instance ${instance_id} to update state.`);
        }
        // Return null IP for now, as the monitor job will update the instance state
        return null;
    }
}