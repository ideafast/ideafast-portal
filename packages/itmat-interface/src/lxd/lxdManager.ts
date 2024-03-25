import * as https from 'https';
import * as fs from 'fs';
import { WebSocket } from 'ws';
import axios, { isAxiosError } from 'axios';
import config from '../utils/configManager';
import * as lxdUtil  from './lxd.util';


// Load the SSL certificate and key
const lxdSslCert = fs.readFileSync(process.env.NX_ITMAT_INTERFACE_LXD_CERT_PATH || '/');
const lxdSslKey = fs.readFileSync(process.env.NX_ITMAT_INTERFACE_LXD_KEY_PATH || '/');

const lxdOptions: https.AgentOptions & Pick<https.RequestOptions, 'agent'> = {
    cert: lxdSslCert,
    key: lxdSslKey,
    rejectUnauthorized: false,
    keepAlive: true
};

const lxdAgent = lxdOptions.agent = new https.Agent(lxdOptions);
const lxdInstance = axios.create({
    baseURL: config.lxdEndpoint,
    httpsAgent: lxdAgent
});


export default {

    // get resources.
    getResources: async () => {
        try {
            const response = await lxdInstance.get('/1.0/resources');
            const data = response.data.metadata;

            // Process and format data
            const formattedData = {
                cpu: lxdUtil.formatCPUInfo(data.cpu),
                memory: lxdUtil.formatMemoryInfo(data.memory),
                storage: lxdUtil.formatStorageInfo(data.storage),
                gpu: lxdUtil.formatGPUInfo(data.gpu),
                network: lxdUtil.formatNetworkInfo(data.network),
                pci: lxdUtil.formatPCIInfo(data.pci)
            };

            return {
                data: formattedData
            };
        } catch (e) {
            if (isAxiosError(e)) {
                console.error('getResources axios error', e.message);
                return {
                    error: true,
                    data: e.message
                };
            }
            console.error('getResources unknown error 1', e);
            return {
                error: true,
                data: e
            };
        }
    },

    // This should almost never be run
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
                console.error('getInstances axios error', e.message);
                return {
                    error: true,
                    data: e.message
                };
            }
            console.error('getInstances unknown error 1', e);
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
        return await lxdInstance.get(`/1.0/instances/${instanceName}/state`);
    },
    getInstanceConsole: async (instanceName: string, options: {
        height: number;
        width: number;
        type: string;
    }) => {
        try {
            instanceName = encodeURIComponent(instanceName);
            const consoleInfo = await lxdInstance.post(`/1.0/instances/${instanceName}/console?project=default&wait=10`, options);
            console.log('getInstanceConsole: ',instanceName, consoleInfo.data);
            const operationSecrets = consoleInfo.data.metadata.metadata.fds;

            // Log the operationSecrets object with indentation for readability
            console.log('operationSecrets:', JSON.stringify(operationSecrets, null, 2));
            return {
                operationId: consoleInfo.data.metadata.id,
                operationSecrets: consoleInfo.data.metadata.metadata.fds
            };
        } catch (e) {
            if (isAxiosError(e)) {
                console.error('getInstanceConsole axios error', e.message);
                return {
                    error: true,
                    data: e.message
                };
            }
            console.error('getInstanceConsole unknown error 2', e);
            return {
                error: true,
                data: e
            };
        }
    },
    // getInstanceConsoleLog
    getInstanceConsoleLog: async (instanceName: string): Promise<string> => {
        instanceName = encodeURIComponent(instanceName);
        try {
            const response = await lxdInstance.get(`/1.0/instances/${instanceName}/console?project=default`);
            if (response.status === 200) {
            // Use response.text() to get the response body as text
                return response.data;
            } else {
                throw new Error('Failed to fetch console log data.');
            }
        } catch (error: any) {
            if (error.response && error.response.status === 404) {
                throw new Error('Console log file not found.');
            } else {
                console.error('Error fetching instance console log from LXD:', error);
                throw error; // Rethrow other errors for the caller to handle.
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
                console.error('getOperations axios error', e.message);
                return {
                    error: true,
                    data: e.message
                };
            }
            console.error('getOperations unknown error', e);
            return {
                error: true,
                data: e
            };
        }
    },
    getOperationStatus: async (operationUrl: string) => {
        try {
            const opResponse = await lxdInstance.get(operationUrl);
            console.log('Operation status:', opResponse.data);
            return opResponse.data;
        } catch (error) {
            console.error('Error fetching operation status from LXD:', error);
            throw error; // Rethrow the error for the caller to handle
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

            console.log('Response from LXD:', lxdResponse.data);

            return lxdResponse.data;
        } catch (error) {
            console.error('Error creating instance on LXD:', error);
            // Handle error appropriately
            throw new Error('Error creating instance on LXD');
        }
    },

    // updateInstance
    updateInstance: async (instanceName: string, payload: any) => {
        try {
            // Construct the payload for the LXD API
            // const payload = {
            //     config: {
            //         'limits.cpu': `${updates.cpuLimit}`,
            //         'limits.memory': updates.memoryLimit
            //     }
            // };

            // Perform the PATCH request to LXD to update the instance configuration
            const response = await lxdInstance.patch(`/1.0/instances/${encodeURIComponent(instanceName)}`, payload, {
                headers: { 'Content-Type': 'application/json' }
            });

            console.log('Response from LXD for update:', response.data);
            return response.data; // Return the response or format as needed
        } catch (error) {
            console.error('Error updating instance on LXD:', error);
            throw new Error('Error updating instance on LXD');

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
            console.log('LXD response for start/stop:', response.data);
            return response.data;
        } catch (error) {
            console.error(`Error ${action} instance on LXD:`, error);
            throw error; // Propagate the error
        }
    },

    deleteInstance: async (instanceName: string) => {
        try {
            const response = await lxdInstance.delete(`/1.0/instances/${instanceName}`);
            console.log('LXD response for delete:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error deleting instance on LXD:', error);
            throw error; // Propagate the error
        }
    }
};