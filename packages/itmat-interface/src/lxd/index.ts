import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import qs from 'qs';
import lxdManager from './lxdManager';

import jwt from 'jsonwebtoken';
import { GraphQLError } from 'graphql';
import { ApolloServerErrorCode } from '@apollo/server/errors';
import { userRetrieval, userRetrievalByUserId } from '../authentication/pubkeyAuthentication';


const lxdCallsRouter = express.Router();

// Middleware for JWT verification and user retrieval, in the style of createContext
const LXDauthenticateRequest = async (req: any, res: any, next: any) => {

    const token: string = req.headers.authorization || '';
    if ((token !== '') && (token !==undefined) && (req.user === undefined)) {
        // skip the token start with '_xsrf'
        if (token.startsWith('_xsrf')) {
            next();
            return;
        }
        const decodedPayload = jwt.decode(token);
        const pubkey = (decodedPayload as any).publicKey;
        // verify the JWT
        jwt.verify(token, pubkey, function (error: any) {
            if (error) {
                throw new GraphQLError('JWT verification failed. ' + error, { extensions: { code: ApolloServerErrorCode.BAD_USER_INPUT, error } });
            }
        });
        const userId = (decodedPayload as any).userId;
        let associatedUser;
        if (userId){
            console.log('using the system token to login:', userId);
            associatedUser = await userRetrievalByUserId(pubkey, userId);
        } else {
            associatedUser = await userRetrieval(pubkey);
        }
        req.user = associatedUser;
    }
    next();
};

lxdCallsRouter.use(LXDauthenticateRequest);

lxdCallsRouter.get('/resources', async (req, res) => {
    console.log('get resources lxd');
    if (!req.user)
        return res.status(403).send('Unauthorized access');
    try {
        const resources = await lxdManager.getResources();
        return res.send(resources);
    } catch (error) {
        console.error('Error fetching LXD resources:', error);
        return res.status(500).send('Failed to fetch LXD resources');
    }
});


lxdCallsRouter.get('/state', async (req, res) => {
    if (!req.user)
        return res.status(403).send('Unauthorized access');
    const container = req.query.c?.toString();
    if (!container)
        return res.status(400).send('No container specified');
    return res.send(await lxdManager.getInstanceState(req.query.c as string));
});

// jupyter url
lxdCallsRouter.get('/instances/:instanceName/jupyter', async (req, res) => {
    if (!req.user)
        return res.status(403).send('Unauthorized access');
    const { instanceName } = req.params;
    return res.send(await lxdManager.getJupyterServiceUrl(instanceName));
});


lxdCallsRouter.get('/operations', async (req, res) => {
    console.log('dmp, /operations');
    if (!req.user)
        return res.status(403).send('Unauthorized access');
    return res.send(await lxdManager.getOperations());
});

// operations url
lxdCallsRouter.get('/operation/:operationId', async (req, res) => {
    console.log('dmp, /operation/:operationId');
    const { operationId } = req.params;

    if (!req.user)
        return res.status(403).send('Unauthorized access');

    try {
        const operationStatus = await lxdManager.getOperationStatus(`/1.0/operations/${operationId}`);
        return res.send(operationStatus);
    } catch (error) {
        console.error('Error fetching operation status:', error);
        return res.status(500).send(`Error fetching operation status: ${error}`);
    }
});


lxdCallsRouter.post('/console', async (req, res) => {
    if (!req.user)
        return res.status(403).send('Unauthorized access');
    const container = req.query.c?.toString();
    if (!container)
        return res.status(400).send('No container specified');
    return res.send(await lxdManager.getInstanceConsole(container, req.body));
});
// fetching console log buffer
lxdCallsRouter.get('/instances/:instanceName/console', async (req, res) => {
    if (!req.user){
        res.status(403).send('Unauthorized access');
        return;
    }
    const { instanceName } = req.params;
    if (!instanceName)
        res.status(400).send('No container specified');
    try {
        const consoleLogBuffer = await lxdManager.getInstanceConsoleLog(instanceName);
        res.send(consoleLogBuffer);
    } catch (error) {
        console.error('Error fetching console log buffer:', error, instanceName);
        res.status(500).send(`Error fetching console log buffer: ${error}`);
    }
});

lxdCallsRouter.get('/', async (req, res) => {
    if (!req.user)
        return res.status(403).send('Unauthorized access');
    // This should never be called from clients
    // Containers must be filtered by DMP users
    return res.send(await lxdManager.getInstances());
});

//instance create
lxdCallsRouter.post('/instances/create', async (req, res) => {
    console.log('dmp, /instances/create');
    console.log('Received create instance request. User:', req.user);
    if (!req.user)
        return res.status(403).send('Unauthorized access');

    try {
        const payload = req.body;

        const createResponse = await lxdManager.createInstance(payload);

        return res.status(201).send(createResponse);
    } catch (error) {

        return res.status(500).send(`Error creating instance: ${error}`);
    }
});

// updateInstance
lxdCallsRouter.patch('/instances/:instanceName/update', async (req, res) => {
    console.log('Received update instance config request for:', req.params.instanceName);

    if (!req.user) return res.status(403).send('Unauthorized access');

    const { instanceName } = req.params;
    const payload = req.body; // Contains fields like cpuLimit, memoryLimit

    try {

        const updateResponse = await lxdManager.updateInstance(instanceName, payload);
        return res.status(200).send({ message: `Instance ${instanceName} updated successfully`, data: updateResponse });
    } catch (error) {
        console.error(`Error updating instance ${instanceName}:`, error);
        return res.status(500).send(`Error updating instance: ${error instanceof Error ? error.message : String(error)}`);
    }
});

// Start or stop an instance
lxdCallsRouter.put('/instances/:instanceName/action', async (req, res) => {
    if (!req.user)
        return res.status(403).send('Unauthorized access');
    const { instanceName } = req.params;
    const { action } = req.body; // Expecting 'start' or 'stop'
    try {
        const response = await lxdManager.startStopInstance(instanceName, action);
        return res.send(response);
    } catch (error) {
        console.error(`Error performing ${action} on instance ${instanceName}:`, error);
        return res.status(500).send(`Error performing ${action} on instance: ${error}`);
    }
});

// Delete an instance
lxdCallsRouter.delete('/instances/:instanceName', async (req, res) => {
    if (!req.user)
        return res.status(403).send('Unauthorized access');
    const { instanceName } = req.params;
    try {
        const response = await lxdManager.deleteInstance(instanceName);
        return res.send(response);
    } catch (error) {
        console.error('[LXD API]Failed to delete instance:', error);
        return res.status(500).send('Failed to delete instance: ' + error);
    }
});


export const registerContainSocketServer = (server: WebSocketServer) => {
    server.on('connection', (clientSocket, req) => {

        clientSocket.pause();

        let containerSocket: WebSocket | undefined;
        const query = qs.parse(req.url?.split('?')[1] || '');
        const operationId = query['o']?.toString() || '';
        const operationSecret = query['s']?.toString() || '';
        const clientMessageBuffers: Array<[Buffer, boolean]> = [];
        const containerMessageBuffers: Array<[Buffer, boolean]> = [];

        (clientSocket as any).operationId = operationId;

        const flushClientMessageBuffers = () => {
            // console.log(' containerSocket.readyState 1', containerSocket?.readyState);
            if (containerSocket && containerSocket.readyState === WebSocket.OPEN) {
                // console.log(' containerSocket.readyState 2',containerSocket.readyState);
                // containerSocket.send('hello');
                const curr = clientMessageBuffers[0];
                if (curr) {
                    containerSocket.send(curr[0], { binary: curr[1] }, (err) => {
                        if (err) {
                            console.error('Error sending message to container', err);
                        } else {
                            clientMessageBuffers.shift();
                            if (clientMessageBuffers.length > 0)
                                flushClientMessageBuffers();
                        }
                    });
                }
            }
        };

        const flushContainerMessageBuffers = () => {
            // console.log(' clientSocket.readyState 11',clientSocket?.readyState);
            if (clientSocket.readyState === WebSocket.OPEN) {
                // console.log(' clientSocket.readyState 12',clientSocket.readyState);
                const curr = containerMessageBuffers[0];
                if (curr) {
                    clientSocket.send(curr[0], { binary: curr[1] }, (err) => {
                        if (err) {
                            console.error('Error sending message to client', err);
                        } else {
                            containerMessageBuffers.shift();
                            if (containerMessageBuffers.length > 0)
                                flushContainerMessageBuffers();
                        }
                    });
                }
            }
        };

        clientSocket.on('message', (message, isBinary) => {
            // console.log(`Message from client: ${message}`);
            const tuple: [Buffer, boolean] = [Buffer.from(message as ArrayBuffer), isBinary];
            clientMessageBuffers.push(tuple);
            flushClientMessageBuffers();
        });

        clientSocket.on('close', (code, reason) => {
            if (containerSocket?.readyState === WebSocket.OPEN)
                containerSocket?.close(4110, `The client socket was closed with code ${code}: ${reason.toString()}`);
        });

        clientSocket.on('error', () => {
            if (containerSocket?.readyState === WebSocket.OPEN)
                containerSocket?.close(4115, 'The client socket errored');
        });

        // let containerSocket = activeContainerConnections.get(container);
        // let containerSocket = null;

        // if (!containerSocket) {
        console.log('DMP backend, create the new container websockect connection: ');

        try {

            console.log('try to build the container socket');
            containerSocket = lxdManager.getOperationSocket(operationId, operationSecret);

            containerSocket.pause();
            containerSocket.on('open', () => {
                console.log('backend instance websocket connection build!', operationId, req.url);
                flushClientMessageBuffers();
            });

            containerSocket.on('message', (message: ArrayBuffer | Uint8Array[], isBinary: boolean) => {
                // let arrayBuffer;

                // if (isBinary) {
                //     // message will be one of ArrayBuffer | Buffer[] | Buffer
                //     if (Array.isArray(message)) {
                //         // If it's an array, we need to concatenate into a single buffer
                //         const combinedBuffer = Buffer.concat(message);
                //         arrayBuffer = combinedBuffer.buffer.slice(
                //             combinedBuffer.byteOffset,
                //             combinedBuffer.byteOffset + combinedBuffer.byteLength
                //         );
                //     } else if (message instanceof Buffer) {
                //         // Node.js Buffer instance, we need to slice the ArrayBuffer it references
                //         arrayBuffer = message.buffer.slice(
                //             message.byteOffset,
                //             message.byteOffset + message.byteLength
                //         );
                //     } else {
                //         // It's already an ArrayBuffer
                //         arrayBuffer = message;
                //     }

                //     const messageContent = `Binary message: ${textDecoder.decode(arrayBuffer)}`;
                //     console.log(`Message from container: ${messageContent}`);
                // } else {
                //     // If it's not binary, we expect a text message, which should be a string
                //     const messageContent = `Text message: ${message.toString()}`;
                //     console.log(`Message from container: ${messageContent}`);
                // }
                const tuple: [Buffer, boolean] = [Buffer.from(message as ArrayBuffer), isBinary];
                containerMessageBuffers.push(tuple);
                flushContainerMessageBuffers();
            });

            containerSocket.on('close', (code, reason) => {
                console.log('container websocket close:',code,  reason.toString());
                flushContainerMessageBuffers();
                if (clientSocket?.readyState === WebSocket.OPEN)
                    clientSocket?.close(4010, `The container socket was closed with code${code}: ${reason.toString()}`);
            });

            containerSocket.on('error', () => {
                if (clientSocket?.readyState === WebSocket.OPEN)
                    clientSocket?.close(4015, 'The container socket errored');
            });

            containerSocket.resume();
            clientSocket.resume();

        } catch (e) {
            if (clientSocket?.readyState === WebSocket.OPEN)
                clientSocket?.close(4015, 'The container socket failed to open');
        }
    });
    server.on('error', (err) => {
        console.error('LXD socket broker errored', err);
    });
};

export default lxdCallsRouter;