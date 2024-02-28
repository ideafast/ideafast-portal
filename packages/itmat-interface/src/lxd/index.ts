import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import qs from 'qs';
import lxdManager from './lxdManager';

const lxdCallsRouter = express.Router();

lxdCallsRouter.get('/state', async (req, res) => {
    if (!req.user)
        return res.status(403).send('Unauthorized access');
    const container = req.query.c?.toString();
    if (!container)
        return res.status(400).send('No container specified');
    return res.send(await lxdManager.getInstanceState(req.query.c as string));
});

lxdCallsRouter.get('/operations', async (req, res) => {
    if (!req.user)
        return res.status(403).send('Unauthorized access');
    return res.send(await lxdManager.getOperations());
});

lxdCallsRouter.post('/console', async (req, res) => {
    if (!req.user)
        return res.status(403).send('Unauthorized access');
    const container = req.query.c?.toString();
    if (!container)
        return res.status(400).send('No container specified');
    return res.send(await lxdManager.getInstanceConsole(container, req.body));
});

lxdCallsRouter.get('/', async (req, res) => {
    if (!req.user)
        return res.status(403).send('Unauthorized access');
    // This should never be called from clients
    // Containers must be filtered by DMP users
    return res.send(await lxdManager.getInstances());
});

export const registerContainSocketServer = (server: WebSocketServer) => {
    server.on('connection', (clientSocket, req) => {

        clientSocket.pause();

        // User login should be checked here !
        // Feel free to use the req.headers['cookie']
        // if (...) {
        //     socket.send('Unauthorized access');
        //     return socket.close();
        // }

        let containerSocket: WebSocket | undefined;
        const query = qs.parse(req.url?.split('?')[1] || '');
        const operationId = query['o']?.toString() || '';
        const operationSecret = query['s']?.toString() || '';
        const clientMessageBuffers: Array<[Buffer, boolean]> = [];
        const containerMessageBuffers: Array<[Buffer, boolean]> = [];

        (clientSocket as any).operationId = operationId;

        const flushClientMessageBuffers = () => {
            if (containerSocket && containerSocket.readyState === WebSocket.OPEN) {
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
            if (clientSocket.readyState === WebSocket.OPEN) {
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

        try {

            containerSocket = lxdManager.getOperationSocket(operationId, operationSecret);

            containerSocket.pause();
            containerSocket.on('open', () => {
                flushClientMessageBuffers();
            });

            containerSocket.on('message', (message, isBinary) => {
                const tuple: [Buffer, boolean] = [Buffer.from(message as ArrayBuffer), isBinary];
                containerMessageBuffers.push(tuple);
                flushContainerMessageBuffers();
            });

            containerSocket.on('close', (code, reason) => {
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