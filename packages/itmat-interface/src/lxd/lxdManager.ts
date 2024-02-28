import * as https from 'https';
import * as fs from 'fs';
import { WebSocket } from 'ws';
import axios, { isAxiosError } from 'axios';
import config from '../utils/configManager';

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
                    lastUsedDate: metadata.last_used_at
                    // config: metadata.config
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
    getOperationSocket: (operationId: string, operationSecret: string) => {
        operationId = encodeURIComponent(operationId);
        operationSecret = encodeURIComponent(operationSecret);
        const containerConsoleSocket = new WebSocket(`wss://${config.lxdEndpoint.replace('https://', '')}/1.0/operations/${operationId}/websocket?secret=${operationSecret}`, {
            agent: lxdAgent
        });
        containerConsoleSocket.binaryType = 'arraybuffer';
        return containerConsoleSocket;
    }
};