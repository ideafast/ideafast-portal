import React, { useState, useEffect, useRef} from 'react';
import { XTerm } from 'xterm-for-react';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import axios from 'axios';
import {updateMaxHeight} from './util/updateMaxHeight';
import './lxd.module.css';

export const LXDCommandExecutor: React.FC<{ instanceName: string }> = ({ instanceName }) => {
    const [dataWs, setDataWs] = useState<WebSocket | null>(null);
    const [controlWs, setControlWs] = useState<WebSocket | null>(null);
    const xtermRef = useRef<XTerm>(null);
    const [terminalReady, setTerminalReady] = useState(false);
    // const fitAddon = useRef(new FitAddon()).current;
    const fitAddonRef = useRef(new FitAddon());
    const textEncoder = new TextEncoder();


    // Create a ref for terminal initialization flag
    const isTerminalInitialized = useRef(false);


    const backendEndpoint = 'http://localhost:3333/api/lxd';
    // const backendEndpoint = 'https://192.168.64.4:8443/1.0';


    // Initialize WebSocket connection
    const initWebSocket = async () => {
        try {

            const execPayload = {
                'command': ['bash'],
                'environment': {
                    TERM: 'xterm-256color',
                    HOME: '/root'
                },
                'user': 0, // Use provided user or default to 0
                'group': 0, // Use provided group or default to 0
                'wait-for-websocket': true,
                'interactive': true
            };

            const response = await axios.post(`${backendEndpoint}/instances/${instanceName}/exec`,execPayload
            );
            const { fds, operationId } = response.data;
            console.log('WebSocket request response:', response.data);
            // console.log('Frontend code for response', response);
            if (fds && operationId) {
                // const dataWsUrl = `ws://localhost:3333/lxd/1.0/operations/${operationId}/websocket?secret=${fds['0']}`;
                // const controlWsUrl = `ws://localhost:3333/lxd/1.0/operations/${operationId}/websocket?secret=${fds.control}`;

                // Update these URLs to point directly to LXD server
                // const lxdServerWsBase = 'wss://192.168.64.4:8443';
                // const dataWsUrl = `${lxdServerWsBase}/1.0/operations/${operationId}/websocket?secret=${fds['0']}`;
                // const controlWsUrl = `${lxdServerWsBase}/1.0/operations/${operationId}/websocket?secret=${fds.control}`;

                // const backendWsBase = 'ws://localhost:3333/lxd';
                const backendWsBase = 'ws://localhost:4200/lxd';
                const dataWsUrl = `${backendWsBase}/1.0/operations/${operationId}/websocket?secret=${fds['0']}`;
                const controlWsUrl = `${backendWsBase}/1.0/operations/${operationId}/websocket?secret=${fds.control}`;

                console.log('Data WebSocket URL:', dataWsUrl);
                console.log('Control WebSocket URL:', controlWsUrl);

                const dataSocket = new WebSocket(dataWsUrl);
                console.log('Data WebSocket', dataSocket);
                const controlSocket = new WebSocket(controlWsUrl);

                dataSocket.onopen = () => {
                    console.log('Data WebSocket opened');

                    // Log target information when the dataSocket opens
                    console.log('Target WebSocket server for dataSocket (onopen):', {
                        url: dataSocket.url
                    });

                    setDataWs(dataSocket);

                };

                controlSocket.onopen = () => {
                    console.log('Control WebSocket opened');
                    setControlWs(controlSocket);
                    setTerminalReady(true);
                };

                dataSocket.onmessage = (event: MessageEvent<ArrayBuffer>) => {

                    console.log('dataSocket.onmessage', event.data);
                    if (event.data instanceof Blob) {
                        // If the message is a Blob, read it as text
                        const reader = new FileReader();
                        reader.onload = () => {
                        // Ensure that reader.result is a string before writing to the terminal
                            const result = reader.result;
                            if (typeof result === 'string') {
                                console.log('Received text:', result);
                                xtermRef.current?.terminal.write(result);
                            } else {
                                // Handle the case where reader.result is not a string
                                console.error('Expected a string from FileReader but received:', result);
                            }
                        };
                        reader.onerror = (e) => {
                            console.error('Error reading blob:', e);
                        };
                        reader.readAsText(event.data); // Read blob as text
                    } else if (event.data instanceof ArrayBuffer) {
                        // If the message is an ArrayBuffer, write it to the terminal as UTF-8 text
                        const text = new TextDecoder().decode(new Uint8Array(event.data));
                        xtermRef.current?.terminal.write(text);
                    } else {
                        // Handle other cases or log an error
                        console.error('Received unknown data type from WebSocket');
                    }
                };

                dataSocket.onerror = error => {
                    console.error('Data WebSocket error:', error);
                };

                dataSocket.onclose = (event) => {
                    console.log('Data WebSocket closed', event);
                    if (1005 !== event.code) {
                        console.error('Error', event.reason, event.code);
                    }
                    setDataWs(null);
                };
                controlSocket.onmessage = (message) => {
                    const data = JSON.parse(message.data);
                    console.log('Received control message:', data);
                    // Handle different types of control messages here
                };

                controlSocket.onerror = error => {
                    console.error('Control WebSocket error:', error);
                };

                controlSocket.onclose = () => {
                    console.log('Control WebSocket closed');
                    setControlWs(null);
                };

                return () => {
                    dataSocket.close();
                    controlSocket.close();
                };
            } else {
                throw new Error('Failed to retrieve WebSocket information.');
            }
        } catch (error) {
            console.error('Error initiating connection to container:', error);
            return;
        }
    };
    useEffect(() => {
        initWebSocket();
        return () => {
            dataWs?.close();
            controlWs?.close();
        };
    }, [instanceName]);

    // useEffect to initialize the terminal and handle resizing
    useEffect(() => {
        // This function will handle terminal initialization and resizing
        const initializeAndResizeTerminal = () => {
            if (terminalReady && xtermRef.current && !isTerminalInitialized.current) {
                const terminal = xtermRef.current.terminal;
                if (terminal) {
                    // Delay fitting until the terminal is visible and has dimensions
                    // Make sure the DOM element is available before fitting
                    setTimeout(() => {
                        if (terminal.element) {
                            // fitAddonRef.current.fit();
                            terminal.focus();
                            isTerminalInitialized.current = true;
                        }
                    }, 0); // Using 0 to defer fitting until after the terminal is rendered
                }


            }
        };

        // Initialize and resize terminal when the component mounts
        initializeAndResizeTerminal();

        // Setup the resize event listener
        const handleResize = () => {
            if (!controlWs || controlWs.readyState === WebSocket.CLOSED) {
                return;
            }

            // Adjust the terminal's max height based on the viewport and other elements
            updateMaxHeight('p-terminal', undefined, 10, 'height');

            // Refit the terminal based on the new size
            if (xtermRef.current) {
                fitAddonRef.current.fit();

                // Send the new dimensions to the WebSocket server
                const dimensions = fitAddonRef.current.proposeDimensions();
                if (dimensions && controlWs.readyState === WebSocket.OPEN) {
                    controlWs.send(
                        textEncoder.encode(
                            JSON.stringify({
                                command: 'window-resize',
                                args: {
                                    height: dimensions.rows.toString(),
                                    width: dimensions.cols.toString()
                                }
                            })
                        )
                    );
                }
            }
        };

        window.addEventListener('resize', handleResize);

        // Cleanup function to remove event listener
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [terminalReady]); // Only re-run if terminalReady changes


    const onData = (input) => {

        console.log('ondata command', input);
        if (dataWs && dataWs.readyState === WebSocket.OPEN) {
            console.log('dataWs.send command', textEncoder.encode(input));
            // Send the command as is, no JSON formatting is required here.
            dataWs.send(textEncoder.encode(input));
        }
        else{  console.log('dataWs', dataWs?.readyState);}
    };




    return (
        <div className="p-terminal-fullscreen">
            <h2>Execute Command in Container</h2>
            {terminalReady ? (

                <XTerm
                    ref={xtermRef}
                    addons={[fitAddonRef.current]}
                    options={{ cursorBlink: true }}
                    className="p-terminal"
                    onData={onData}
                />

            ) : (
                <p>Terminal loading...</p>
            )}
            <div style={{ marginTop: '20px' }}>
                <input
                    type="text"
                    placeholder="Type command here..."
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && controlWs) {
                            onData(e.currentTarget.value + '\n');
                            e.currentTarget.value = '';
                        }
                    }}
                    // style={{ width: '100%', padding: '10px', fontSize: '16px' }}
                    className="terminal-input"
                />
            </div>
        </div>
    );

};