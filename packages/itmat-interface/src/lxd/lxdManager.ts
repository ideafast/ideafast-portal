import * as https from 'https';
import * as fs from 'fs';
import { WebSocket } from 'ws';
import axios, { isAxiosError } from 'axios';
import config from '../utils/configManager';
import { LXDInstanceState } from '@itmat-broker/itmat-types';
import { Logger } from '@itmat-broker/itmat-commons';
import { sanitizeUpdatePayload}  from './lxd.util';
import { Cpu, Memory, Storage, Gpu} from '@itmat-broker/itmat-types';


// Load the SSL certificate and key
const lxdSslCert = fs.readFileSync(config.lxdCertFile.cert);
const lxdSslKey = fs.readFileSync(config.lxdCertFile.key);

const lxdOptions: https.AgentOptions & Pick<https.RequestOptions, 'agent'> = {
    cert: lxdSslCert,
    key: lxdSslKey,
    rejectUnauthorized: config.lxdRejectUnauthorized
};


const lxdAgent = lxdOptions.agent = new https.Agent(lxdOptions);
const lxdInstance = axios.create({
    baseURL: config.lxdEndpoint,
    httpsAgent: lxdAgent
});


export default {

    // get resources of lxd server.
    getResources: async () => {
        try {
            const response = await lxdInstance.get('/1.0/resources');
            const data = response.data.metadata;

            return {
                data: {
                    cpu: data.cpu as Cpu,
                    memory: data.memory as Memory,
                    storage: data.storage as Storage,
                    gpu: data.gpu as Gpu
                }
            };

        } catch (e) {
            if (isAxiosError(e)) {
                Logger.error('getResources axios error' + e.message);
                return {
                    error: true,
                    data: e.message
                };
            }
            Logger.error('getResources unknown error 1' + e);
            return {
                error: true,
                data: e
            };
        }
    },
    // getProfile
    getProfile: async (profileName: string) => {
        try {
            const response = await lxdInstance.get(`/1.0/profiles/${encodeURIComponent(profileName)}`);
            if (response.status === 200) {
                return {
                    data: response.data.metadata// assuming this is the format in which LXD returns profile data
                };
            } else {
                Logger.error(`Failed to fetch profile data. ${response.data}`);
                return {
                    error: true,
                    data: `Failed to fetch profile data. ${response.data}`
                };
            }
        } catch (error: any) {
            if (error.response) {
                Logger.error(`Failed to fetch profile data. ${error.response}`);
                return {
                    error: true,
                    data: `Failed to fetch profile data. ${error.response}`
                };
            } else {
                Logger.error('Error fetching profile data from LXD:' + error);
                return {
                    error: true,
                    data: error
                };
            }
        }
    },

    // This should almost never be run, only for admin user
    getInstances: async () => {
        try {
            const instanceUrls = await lxdInstance.get('/1.0/instances');
            const instances = await Promise.allSettled(instanceUrls.data.metadata.map(async (instanceUrl: string) => await lxdInstance.get(instanceUrl)));

            const sanitizedIntances = instances.map((instance: any) => {

                const { metadata } = instance.value.data;
                return {
                    name: metadata.name,
                    description: metadata.description,
                    status: metadata.status,
                    statusCode: metadata.status_code,
                    profiles: metadata.profiles,
                    type: metadata.type,
                    architecture: metadata.architecture,
                    creationDate: metadata.created_at,
                    lastUsedDate: metadata.last_used_at,
                    // config: metadata.config
                    username: metadata.config['user.username'] || 'N/A',
                    cpuLimit: metadata.config['limits.cpu'] || 'N/A',
                    memoryLimit: metadata.config['limits.memory'] || 'N/A'
                };
            });

            return {
                data: sanitizedIntances
            };
        } catch (e) {
            if (isAxiosError(e)) {
                Logger.error('getInstances axios error' + e.message);
                return {
                    error: true,
                    data: e.message
                };
            }
            Logger.error('getInstances unknown error 1' + e);
            return {
                error: true,
                data: e
            };
        }
    },
    getInstanceInfo: async (instanceName: string) => {
        instanceName = encodeURIComponent(instanceName);
        return await lxdInstance.get(`/1.0/instances/${instanceName}`);
    },
    getInstanceState: async (instanceName: string) => {
        instanceName = encodeURIComponent(instanceName);
        try {
            const response = await lxdInstance.get(`/1.0/instances/${instanceName}/state`);
            const instanceState: LXDInstanceState = response.data.metadata;
            return {
                data: instanceState
            };
        } catch (error) {
            Logger.error('Error fetching Instance state from LXD:' +  error);
            return {
                error: true,
                data: error
            };
        }

    },

    getInstanceConsole: async (instanceName: string, options: {
        height: number;
        width: number;
        type: string;
    }) => {
        try {
            instanceName = encodeURIComponent(instanceName);
            const consoleInfo = await lxdInstance.post(`/1.0/instances/${instanceName}/console?project=default&wait=10`, options);
            return {
                operationId: consoleInfo.data.metadata.id,
                operationSecrets: consoleInfo.data.metadata.metadata.fds
            };
        } catch (e) {
            if (isAxiosError(e)) {
                Logger.error(`getInstanceConsole unknown error : ${e.message}`);
                return {
                    error: true,
                    data: e.message
                };
            }
            Logger.error(`getInstanceConsole unknown error : ${e}`);
            return {
                error: true,
                data: e
            };
        }
    },

    getInstanceConsoleLog: async (instanceName: string) => {
        instanceName = encodeURIComponent(instanceName);
        try {
            const response = await lxdInstance.get(`/1.0/instances/${instanceName}/console?project=default`);
            if (response.status === 200) {
                return response.data;
            } else {
                Logger.error(`Failed to fetch Logger log data. ${response.data}`);
                return {
                    error: true,
                    data: `Failed to fetch Logger log data. ${JSON.stringify(response.data)}`
                };
            }
        } catch (error: any) {
            if (error.response && error.response.status === 404) {
                Logger.error(`Logger log file not found.${error.response}`);
                return {
                    error: true,
                    data: `Logger log file not found.${error.response}`
                };
            } else {
                Logger.error(`Error fetching instance Logger log from LXD:${error}`);
                return {
                    error: true,
                    data: error
                };
            }
        }
    },

    getOperations: async () => {
        try {
            const operationUrls = await lxdInstance.get('/1.0/operations');
            return {
                data: operationUrls.data.metadata
            };
        } catch (e) {
            if (isAxiosError(e)) {
                Logger.error('getOperations axios error' + e.message);
                return {
                    error: true,
                    data: e.message
                };
            }
            Logger.error('getOperations unknown error' + e);
            return {
                error: true,
                data: e
            };
        }
    },
    getOperationStatus: async (operationUrl: string) => {
        try {
            const opResponse = await lxdInstance.get(operationUrl);
            return opResponse.data;
        } catch (error) {
            Logger.error('Error fetching operation status from LXD:' + error);
            throw error;
        }
    },

    getOperationSocket: (operationId: string, operationSecret: string) => {
        operationId = encodeURIComponent(operationId);
        operationSecret = encodeURIComponent(operationSecret);
        const containerConsoleSocket = new WebSocket(`wss://${config.lxdEndpoint.replace('https://', '')}/1.0/operations/${operationId}/websocket?secret=${operationSecret}`, {
            agent: lxdAgent
        });
        containerConsoleSocket.binaryType = 'arraybuffer';
        return containerConsoleSocket;
    },
    createInstance:  async (payload: any) => {
        try {
            const lxdResponse = await lxdInstance.post('/1.0/instances', payload, {
                headers: { 'Content-Type': 'application/json' },
                httpsAgent: lxdAgent
            });
            return lxdResponse.data;
        } catch (error) {
            Logger.error(`Error creating instance on LXD: ${error}`);
            throw new Error('Error creating instance on LXD');
        }
    },

    // updateInstance
    updateInstance: async (instanceName: string, payload: any) => {
        try {
            const sanitizedPayload = sanitizeUpdatePayload(payload);
            // Perform the PATCH request to LXD to update the instance configuration
            const response = await lxdInstance.patch(`/1.0/instances/${encodeURIComponent(instanceName)}`, sanitizedPayload, {
                headers: { 'Content-Type': 'application/json' }
            });
            return response.data; // Return the response or format as needed
        } catch (error) {
            Logger.error('Error updating instance on LXD:' + error);
            throw error;
        }
    },

    startStopInstance: async (instanceName:string, action:string) => {
        try {
            const response = await lxdInstance.put(`/1.0/instances/${instanceName}/state`, {
                action: action,
                timeout: 30, // Optional, adjust as needed
                force: false,
                stateful: false
            });
            return response.data;
        } catch (error) {
            Logger.error(`Error ${action} instance on LXD: ${error}`);
            throw error; // Propagate the error
        }
    },

    deleteInstance: async (instanceName: string) => {
        try {
            const response = await lxdInstance.delete(`/1.0/instances/${instanceName}`);
            return response.data;
        } catch (error) {
            Logger.error(`Error deleting instance on LXD: ${error}`);
            throw error; // Propagate the error
        }
    }
};