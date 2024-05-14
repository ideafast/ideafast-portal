
import { WebSocketServer, WebSocket } from 'ws';
import qs from 'qs';
import lxdManager from './lxdManager';
import { Logger } from '@itmat-broker/itmat-commons';

// define text decoder
const textDecoder = new TextDecoder();

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
            if (containerSocket && containerSocket.readyState === WebSocket.OPEN) {

                const curr = clientMessageBuffers[0];
                if (curr) {
                    containerSocket.send(curr[0], { binary: curr[1] }, (err) => {
                        if (err) {
                            Logger.error('Error sending message to container' + err);
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

        try {
            containerSocket = lxdManager.getOperationSocket(operationId, operationSecret);

            containerSocket.pause();
            containerSocket.on('open', () => {
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