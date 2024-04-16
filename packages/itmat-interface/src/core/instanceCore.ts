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
// import the config and rename to dmpConfig
import config  from '../utils/configManager';
import * as yaml from 'js-yaml';
import lxdManager from '../lxd/lxdManager';
import { deepMerge } from '../lxd/lxd.util';

export class InstanceCore {

    // Method to fetch the vendor-data from the profile
    private async getVendorData(profileName: string): Promise<string> {
        const profileData = await lxdManager.getProfile(profileName);
        if (profileData.error) {
            throw new Error(`Error fetching profile data: ${profileData.data}`);
        }
        return profileData.data.config['user.vendor-data'];
    }


    // Function to merge cloud-init configurations
    // define the type of the vendorData and userData and the return type
    public mergeCloudInitConfigs(vendorData: string, userData: string): string {
        // Parse YAML strings into objects
        const vendorConfig: any = yaml.load(vendorData);
        const userConfig: any = yaml.load(userData);

        // Merge runcmd arrays
        // const combinedRuncmd = [].concat(vendorConfig.runcmd || [], userConfig.runcmd || []);
        // const mergedConfig = { ...vendorConfig, ...userConfig, runcmd: combinedRuncmd };
        // const mergedConfig = _.merge({}, vendorConfig, userConfig, { runcmd: combinedRuncmd });


        // Deeply merge vendor and user configurations
        const mergedConfig = deepMerge(vendorConfig, userConfig);

        // Convert the merged object back into a YAML string
        // Properly structured YAML dump with correct options
        const yamlOptions = {
            indent: 2,
            noArrayIndent: true,
            flowLevel: -1,
            lineWidth: -1,
            noRefs: true,
            sortKeys: true  // Adjust based on your requirements
        };

        // Now pass the mergedConfig and options as a single object
        const yamlString = yaml.dump({ data: mergedConfig, options: yamlOptions });

        console.log('YAML String:', yamlString);
        return yamlString;
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
            console.log('Token issueSystemAccessToken', instanceSystemToken);
        } catch (error) {
            console.error('Error generating token:', error);
            throw new Error('Error generating instance token.');
        }
        const notebookToken = mfa.generateSecret(20);

        // TDDO, replace the url, WebDAV mount configuration
        const webdavServer = `http://localhost:${config.webdavPort}`;
        const webdavMountPath = '/mnt/webdav'; // Adjust as necessary

        const instanceProfile = type==='virtual-machine'? 'matlab-profile' : 'jupyter-profile'; // Assuming 'default' profile, adjust as necessary

        // Prepare user-data for cloud-init to append the token to /etc/profile
        const cloudInitUserDataComntainer = `
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
      export INSTANCE_TOKEN="${instanceSystemToken}"
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
      export INSTANCE_TOKEN="${instanceSystemToken}"
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
  - source /etc/profile.d/dmpy.sh
  - source /etc/profile.d/instance_token.sh
`;

        const cloudInitUserData = type==='virtual-machine'? cloudInitUserDataVM : cloudInitUserDataComntainer;
        // add boot-time script, to be executed on first boot
        const instaceConfig = {
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
            config: instaceConfig
        };

        await db.collections!.instance_collection.insertOne(instanceEntry);

        // Create the job to create the LXD instance on LXD server
        const jobName = `Create LXD Instance: ${name}`;
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
                    alias: type==='virtual-machine'? 'ubuntu-matlab-image' : 'ubuntu-jupyter-container-image' // Example fingerprint, adjust as necessary
                },
                profiles: [instanceProfile],
                type: type // 'virtual-machine' or 'container'
            }
        };
        // console.log('lxd_metadata', lxd_metadata);

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
 * Get all instances and update their status based on lifespan.
 *
 * @param userId The ID of the user managing instances.
 * @return IInstance[] The list of instances.
 */
    public async getInstances(userId: string): Promise<IInstance[]> {
    // Retrieve all instances that haven't been deleted
        const instances = await db.collections!.instance_collection.find({
            status: { $ne: enumInstanceStatus.DELETED },
            userId: userId  // Ensure to only fetch instances related to the userId if necessary
        }).toArray();

        const now = Date.now();

        // Create a series of promises to handle lifespan and status updates
        const updates = instances.map(async (instance) => {
            const lifeDuration = now - instance.createAt;
            const remainingLife = instance.lifeSpan * 3600000 - lifeDuration;

            // Check if the lifespan has been exceeded
            if (remainingLife <= 0) {
            // Check if the instance is not already stopped
                if (instance.status !== enumInstanceStatus.STOPPED && instance.status !== enumInstanceStatus.STOPPING) {
                    // Stop the instance and update status in the database
                    await this.startStopInstance(userId, instance.id, 'stop');
                }

                return await db.collections!.instance_collection.updateOne(
                    { id: instance.id },
                    {
                        $set: {
                            lifeSpan: 0  // Reset lifespan to zero as it's now considered ended
                            // status: enumInstanceStatus.STOPPED  // Ensure the status is set to STOPPED
                        }
                    }
                );

            } else {
                // resolve the promise with the instance object
                return instance;

            }
        });

        // Wait for all updates to complete
        await Promise.all(updates);

        // Fetch and return the updated list of instances
        return instances.map(instance => {
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
