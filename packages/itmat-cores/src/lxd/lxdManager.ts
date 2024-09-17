import * as https from 'https';
import * as fs from 'fs';
import { WebSocket } from 'ws';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import { LXDInstanceState, LxdConfiguration, Cpu, Memory, Storage, Gpu , LxdOperation, LxdGetInstanceConsoleResponse} from '@itmat-broker/itmat-types';
import { Logger } from '@itmat-broker/itmat-commons';
import { sanitizeUpdatePayload } from './lxd.util';
import { IConfiguration } from '../utils/configManager';

export class LxdManager {
    private lxdInstance: AxiosInstance;
    private lxdAgent: https.Agent;
    config: IConfiguration;

    constructor(config: IConfiguration) {
        this.config = config;
        let lxdSslCert: string;
        let lxdSslKey: string;

        // Load the SSL certificate and key
        // Determine if cert and key are file paths or direct content
        if (config.lxdCertFile['cert'].includes('-----BEGIN')) {
            lxdSslCert = config.lxdCertFile['cert'];
        } else {
            lxdSslCert = fs.readFileSync(config.lxdCertFile['cert'], 'utf8');
        }

        if (config.lxdCertFile['key'].includes('-----BEGIN')) {
            lxdSslKey = config.lxdCertFile['key'];
        } else {
            lxdSslKey = fs.readFileSync(config.lxdCertFile['key'], 'utf8');
        }

        const lxdOptions: https.AgentOptions & Pick<https.RequestOptions, 'agent'> = {
            cert: lxdSslCert,
            key: lxdSslKey,
            rejectUnauthorized: config.lxdRejectUnauthorized
        };

        this.lxdAgent = lxdOptions.agent = new https.Agent(lxdOptions);
        this.lxdInstance = axios.create({
            baseURL: config.lxdEndpoint,
            httpsAgent: this.lxdAgent
        });
    }

    // get resources of lxd server.
    async getResources() {
        try {
            const response = await this.lxdInstance.get('/1.0/resources');
            const data = response.data.metadata;

            return {
                data: {
                    cpu: data.cpu as Cpu,
                    memory: data.memory as Memory,
                    storage: data.storage as Storage,
                    gpu: data.gpu as Gpu
                }
            };

        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                Logger.error('getResources axios error' + error.message);
                return {
                    error: true,
                    data: error.message
                };
            }
            Logger.error('getResources unknown error 1' + error);
            return {
                error: true,
                data: String(error)
            };
        }
    }

    // getProfile
    async getProfile(profileName: string) {
        try {
            const response = await this.lxdInstance.get(`/1.0/profiles/${encodeURIComponent(profileName)}`);
            if (response.status === 200) {
                return {
                    data: response.data.metadata // assuming this is the format in which LXD returns profile data
                };
            } else {
                Logger.error(`Failed to fetch profile data. ${response.data}`);
                return {
                    error: true,
                    data: `Failed to fetch profile data. ${response.data}`
                };
            }
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                Logger.error(`Failed to fetch profile data. ${error.response}`);
                return {
                    error: true,
                    data: `Failed to fetch profile data. ${error.response}`
                };
            } else {
                Logger.error('Error fetching profile data from LXD:' + error);
                return {
                    error: true,
                    data: String(error)
                };
            }
        }
    }

    // This should almost never be run, only for admin user
    async getInstances() {
        try {
            const instanceUrls = await this.lxdInstance.get('/1.0/instances');
            const instances = await Promise.allSettled(instanceUrls.data.metadata.map(async (instanceUrl: string) => await this.lxdInstance.get(instanceUrl)));

            const sanitizedInstances = instances.map((instance) => {
                if (instance.status === 'fulfilled') {
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
                        username: metadata.config['user.username'] || 'N/A',
                        cpuLimit: metadata.config['limits.cpu'] || 'N/A',
                        memoryLimit: metadata.config['limits.memory'] || 'N/A'
                    };
                } else {
                    Logger.error('Error fetching instance data: ' + instance.reason);
                    return null;
                }
            }).filter(instance => instance !== null);

            return {
                data: sanitizedInstances
            };
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                Logger.error('getInstances axios error' + error.message);
                return {
                    error: true,
                    data: error.message
                };
            }
            Logger.error('getInstances unknown error 1' + error);
            return {
                error: true,
                data: String(error)
            };
        }
    }

    async getInstanceInfo(instanceName: string) {
        instanceName = encodeURIComponent(instanceName);
        return await this.lxdInstance.get(`/1.0/instances/${instanceName}`);
    }

    async getInstanceState(instanceName: string) {
        instanceName = encodeURIComponent(instanceName);
        try {
            const response = await this.lxdInstance.get(`/1.0/instances/${instanceName}/state`);
            const instanceState: LXDInstanceState = response.data.metadata;
            return {
                data: instanceState
            };
        } catch (error: unknown) {
            Logger.error('Error fetching Instance state from LXD:' + error);
            if (axios.isAxiosError(error)) {
                Logger.error(`Error fetching Instance state from LXD: ${error.message}`);
                if (error.response) {
                    Logger.error(`Status: ${error.response.status}`);
                    Logger.error(`Headers: ${JSON.stringify(error.response.headers)}`);
                    Logger.error(`Data: ${JSON.stringify(error.response.data)}`);
                }
            } else {
                Logger.error(`Error fetching Instance state from LXD: ${String(error)}`);
            }
            return {
                error: true,
                data: String(error)
            };
        }
    }

    async getInstanceConsole(instanceName: string, options: { height: number; width: number; type: string; }): Promise<LxdGetInstanceConsoleResponse>  {
        try {
            instanceName = encodeURIComponent(instanceName);
            const consoleInfo = await this.lxdInstance.post<LxdOperation>(`/1.0/instances/${instanceName}/console?project=default&wait=10`, options);
            return {
                operationId: consoleInfo.data.metadata.id,
                operationSecrets: consoleInfo.data.metadata.metadata.fds
            };
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                Logger.error(`getInstanceConsole unknown error : ${error.message}`);
                return {
                    error: true,
                    data: error.message
                };
            }
            Logger.error(`getInstanceConsole unknown error : ${error}`);
            return {
                error: true,
                data: String(error)
            };
        }
    }

    async getInstanceConsoleLog(instanceName: string) {
        instanceName = encodeURIComponent(instanceName);
        try {
            const response = await this.lxdInstance.get(`/1.0/instances/${instanceName}/console?project=default`);
            if (response.status === 200) {
                return response.data;
            } else {
                Logger.error(`Failed to fetch Logger log data. ${response.data}`);
                return {
                    error: true,
                    data: `Failed to fetch Logger log data. ${JSON.stringify(response.data)}`
                };
            }
        } catch (error: unknown) {
            if (axios.isAxiosError(error) && error.response && error.response.status === 404) {
                Logger.error(`Logger log file not found.${error.response}`);
                return {
                    error: true,
                    data: `Logger log file not found.${error.response}`
                };
            } else {
                Logger.error(`Error fetching instance Logger log from LXD:${error}`);
                return {
                    error: true,
                    data: String(error)
                };
            }
        }
    }

    async getOperations() {
        try {
            const operationUrls = await this.lxdInstance.get('/1.0/operations');
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
    }

    async getOperationStatus(operationUrl: string) {
        try {
            const opResponse = await this.lxdInstance.get(operationUrl);
            return opResponse.data;
        } catch (error) {
            Logger.error('Error fetching operation status from LXD:' + error);
            throw error;
        }
    }

    getOperationSocket(operationId: string, operationSecret: string) {
        operationId = encodeURIComponent(operationId);
        operationSecret = encodeURIComponent(operationSecret);
        const containerConsoleSocket = new WebSocket(`wss://${this.config.lxdEndpoint.replace('https://', '')}/1.0/operations/${operationId}/websocket?secret=${operationSecret}`, {
            agent: this.lxdAgent
        });
        containerConsoleSocket.binaryType = 'arraybuffer';
        return containerConsoleSocket;
    }

    async createInstance(payload: LxdConfiguration) {
        try {
            const lxdResponse = await this.lxdInstance.post('/1.0/instances', payload, {
                headers: { 'Content-Type': 'application/json' },
                httpsAgent: this.lxdAgent
            });
            return lxdResponse.data;
        } catch (error) {
            Logger.error(`Error creating instance on LXD: ${error}`);
            throw new Error('Error creating instance on LXD');
        }
    }

    async updateInstance(instanceName: string, payload: LxdConfiguration) {
        try {
            const sanitizedPayload = sanitizeUpdatePayload(payload);
            // Perform the PATCH request to LXD to update the instance configuration
            const response = await this.lxdInstance.patch(`/1.0/instances/${encodeURIComponent(instanceName)}`, sanitizedPayload, {
                headers: { 'Content-Type': 'application/json' }
            });
            return response.data; // Return the response or format as needed
        } catch (error) {
            Logger.error('Error updating instance on LXD:' + error);
            throw error;
        }
    }

    async startStopInstance(instanceName: string, action: string) {
        try {
            const response = await this.lxdInstance.put(`/1.0/instances/${instanceName}/state`, {
                action: action,
                timeout: 30, // adjust as needed
                force: false,
                stateful: false
            });
            return response.data;
        } catch (error) {
            Logger.error(`Error ${action} instance on LXD: ${error}`);
            throw error; // Propagate the error
        }
    }

    async deleteInstance(instanceName: string) {
        try {
            const response = await this.lxdInstance.delete(`/1.0/instances/${instanceName}`);
            return response.data;
        } catch (error) {
            Logger.error(`Error deleting instance on LXD: ${error}`);
            throw error; // Propagate the error
        }
    }
}