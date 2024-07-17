
import { WebSocketServer, WebSocket } from 'ws';
import {  Express, NextFunction, Request, Response} from 'express';
import http from 'node:http';
import qs from 'qs';
import { Socket } from 'net';
import lxdManager from './lxdManager';
import { Logger } from '@itmat-broker/itmat-commons';
import { LXDInstanceState } from '@itmat-broker/itmat-types';
import { createProxyMiddleware } from 'http-proxy-middleware';


const textDecoder = new TextDecoder('utf-8');

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
        // send test message to client
        clientSocket.on('open', () => {
            console.log('client socket open');
            clientSocket.send('test message');
        });

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
                //     }ßßß

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
                // console.log('container websocket close:',code,  reason.toString());
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
        Logger.error(`LXD socket broker errored: ${JSON.stringify(err)}`);
    });
};


// Middleware to fetch the container IP
async function getContainerIP(containerName: string): Promise<string> {
    const response = await lxdManager.getInstanceState(containerName);
    if (response.error || !response.data) {
        Logger.error(`Unable to retrieve instance state: ${containerName}`);
        throw new Error('Unable to retrieve instance state.');
    }

    const instanceState = response.data as LXDInstanceState;
    if (!instanceState.network || !instanceState.network.eth0) {
        Logger.error(`Unable to retrieve network details for instance: ${containerName}`);
        throw new Error('Unable to retrieve network details for instance.');
    }

    const ipv4Address = instanceState.network.eth0.addresses
        .filter((addr: any) => addr.family === 'inet')
        .map((addr: any) => addr.address)[0];

    if (!ipv4Address) {
        Logger.error(`No IPv4 address found for instance: ${containerName}`);
        throw new Error('No IPv4 address found for instance.');
    }

    return ipv4Address;
}


// Middleware to handle proxying Jupyter requests
export const jupyterProxyMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const containerName = req.params.containerName;
    console.log(`Incoming request: ${req.method} ${req.url}`);
    console.log(`jupyterProxyMiddleware  ${containerName}`);
    try {
        // const containerIP = getContainerIP(containerName);
        const containerIP = 'localhost';
        const jupyterPort = 8889;

        const proxy = createProxyMiddleware({
            target: `http://${containerIP}:${jupyterPort}`,
            changeOrigin: true,
            ws: true,
            autoRewrite: true,
            followRedirects: true,
            selfHandleResponse: true, // Enable custom response handling
            protocolRewrite: 'http',
            pathRewrite: (path, req) => {
                return path.replace(`/jupyter/${containerName}`, '');
            },
            onProxyRes: (proxyRes, req, res) => {
                const contentType = proxyRes.headers['content-type'];
                // Handling redirects
                if (proxyRes.statusCode && [307, 308].indexOf(proxyRes.statusCode) > -1 && proxyRes.headers.location) {
                    let redirect = proxyRes.headers.location;
                    Logger.warn('Received code ' + proxyRes.statusCode + ' from Jupyter Server for URL - ' + redirect);
                    redirect = redirect.replace('http://localhost:8889', `/jupyter/${containerName}`);
                    Logger.warn('Manipulating header location and redirecting to - ' + redirect);
                    proxyRes.headers.location = redirect;
                }

                if (contentType && contentType.includes('text/html')) {
                    let body = '';

                    proxyRes.on('data', (chunk) => {
                        body += chunk;
                    });

                    proxyRes.on('end', () => {

                        body = body.replace(/(href|src|data-main)="\/(tree|notebooks|lab|api|files|static|custom|nbconvert|kernelspecs|services|terminals|hub|user)\//g, `$1="/jupyter/${containerName}/$2/`);

                        res.setHeader('Content-Length', Buffer.byteLength(body));
                        res.setHeader('Content-Type', contentType);
                        res.end(body);
                    });
                } else {
                    proxyRes.pipe(res);
                }
            },
            onProxyReq: (proxyReq, req, res) => {

                // Handle body parsing if necessary
                if (req.body && Object.keys(req.body).length) {
                    const contentType = proxyReq.getHeader('Content-Type');
                    proxyReq.setHeader('origin', `http://${containerIP}:${jupyterPort}`);
                    const writeBody = (bodyData: string) => {
                        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                        proxyReq.write(bodyData);
                        proxyReq.end();
                    };

                    if (contentType === 'application/json') {
                        writeBody(JSON.stringify(req.body));
                    }

                    if (contentType === 'application/x-www-form-urlencoded') {
                        writeBody(qs.stringify(req.body));
                    }
                }
            },
            onError: (err, req, res) => {
                Logger.error(`Error proxying to Jupyter: ${err.message}`);
                if (res instanceof http.ServerResponse) {
                    res.writeHead(500, {
                        'Content-Type': 'text/plain'
                    });
                    res.end('Error connecting to Jupyter server');
                }
            }
        });

        proxy(req, res, next);
    } catch (error) {
        Logger.error(`Error in Jupyter proxy middleware: ${error}`);
        res.status(500).send('Error connecting to Jupyter server');
    }
};


// Apply the proxy middleware to the defined paths
export const applyProxyMiddleware = (app: Express) => {
    const proxyRouters = [
        '/jupyter/:containerName',
        '/jupyter/:containerName/*',
        '/static/*',
        '/custom/*',
        '/tree/*',
        '/api/*',
        '/files/*',
        '/lab/*',
        '/nbconvert/*',
        '/notebooks/*'
    ];

    proxyRouters.forEach(router => {
        app.use(router, jupyterProxyMiddleware);
    });

};