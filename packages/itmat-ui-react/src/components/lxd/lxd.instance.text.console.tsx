import React, { useState, useEffect, useRef, useLayoutEffect} from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
// https://www.npmjs.com/package/@xterm/xterm
import { FitAddon } from '@xterm/addon-fit';
// https://www.npmjs.com/package/@xterm/addon-fit
import css from './lxd.module.css';
// import { useWebSocket } from 'react-use-websocket';  // Import the hook
import { trpc } from '../../utils/trpc';
import { message } from 'antd';
import {updateMaxHeight} from './util/updateMaxHeight';

interface LXDTextConsoleProps {
  instanceName: string;
}

const LXDTextConsole: React.FC<LXDTextConsoleProps> = ({ instanceName}) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const textEncoder = new TextEncoder();
    const [isLoading, setLoading] = useState<boolean>(false);

    const [consoleBuffer, setConsoleBuffer] = useState('');
    const [dataWs, setDataWs] = useState<WebSocket | null>(null);
    // const [terminalInstanceRef.current] = useState<Terminal>(new Terminal());
    const terminalInstanceRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const isRendered = useRef<boolean>(false);

    const getInstanceConsole = trpc.lxd.getInstanceConsole.useMutation();
    const getInstanceConsolelog = trpc.lxd.getInstanceConsoleLog.useMutation();


    // New function to fetch console log buffer
    const fetchConsoleLogBuffer = async () => {
        try {
            // use trpc to get the console log buffer
            const result: any = await getInstanceConsolelog.mutateAsync({
                container: instanceName
            });
            if (result && result.data) {
                console.log('Console buffer:', result.data);
                setConsoleBuffer(result.data);
            }
        } catch (error) {
            console.log('Failed to load console buffer:', JSON.stringify(error));
            // message.error(`Failed to load console buffer: ${JSON.stringify(error)}`);
        }
    };

    const initiateConnection = async ( width = 100, height = 100) => {
        setLoading(true);

        try {
            await fetchConsoleLogBuffer();
            // use trpc to get the console log buffer
            const result: any = await getInstanceConsole.mutateAsync({
                container: instanceName,
                options: { height, width, type: 'console' } // Ensure these options match your backend's expected input
            });

            if (result.error) {
                throw new Error(`Failed to initiate console session: ${result.error}`);
            }

            const baseUrl = new URL(window.location.href);  //TODO import  from the common module
            baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            baseUrl.pathname = '/rtc';
            const dataUrl = `${baseUrl.href}?t=d&o=${result.operationId}&s=${result.operationSecrets['0']}`;
            const controlUrl = `${baseUrl.href}?t=c&o=${result.operationId}&s=${result.operationSecrets.control}`;

            const data_ws = new WebSocket(dataUrl);
            const control_ws = new WebSocket(controlUrl);

            control_ws.onopen = () => {
                console.log('Control websocket opened');
                setLoading(false);
            };
            control_ws.onclose = () => {
                console.log('Control websocket closed');
            };
            control_ws.onerror = (error) => {
                console.error('Control WebSocket error:', error);
            };
            control_ws.onmessage = (message) => {
                console.log('Control message:', message);
            };


            data_ws.onopen = () => {
                console.log('Data websocket opened');
                setDataWs(data_ws);
                initTerminal(data_ws, new Uint8Array(textEncoder.encode('test\r')));
            };
            data_ws.onerror = (error) => {
            // show the message notification no more than 5 seconds
                console.log('Data WebSocket error:', error);
                message.error('Console connection error', 2);
            };

            data_ws.binaryType = 'arraybuffer';
            data_ws.onmessage =  (message: MessageEvent<ArrayBuffer>) => {
                console.log('Data message:', message);
                if (terminalInstanceRef.current) {
                    terminalInstanceRef.current.write(new Uint8Array(message.data));
                } else {
                    console.error('Terminal instance is null');
                    initTerminal(data_ws,new Uint8Array(message.data));
                }

            };
            data_ws.onclose = () => {
                setDataWs(null);
            };

            return [data_ws, control_ws];
        } catch (error) {
            // console.error('Error initiating connection:', error);
            message.error(`Error initiating connection: ${JSON.stringify(error)}`);
            setLoading(false);
            return [];
        }
    };

    const initTerminal = (dataWs: WebSocket, initialMessage?: Uint8Array) => {
        if (terminalRef.current && !terminalInstanceRef.current) {
            console.log('Creating terminal instance');
            const terminal = new Terminal({
                convertEol: true,
                cursorStyle: 'block',
                cursorBlink: true,
                fontFamily: 'monospace',
                fontSize: 14,
                fontWeight: '600',
                theme: {
                    background: '#2b2b2b',
                    foreground: '#FFFFFF',
                    cursor: '#00FF00'
                }
            });
            const fitAddon = new FitAddon();
            terminal.loadAddon(fitAddon);
            terminal.open(terminalRef.current);
            terminal.onData((data) => {
                console.log('Sending data:', data);
                dataWs.send(textEncoder.encode(data));
            });
            // write stream to terminal with utf-8 encoding
            terminal.writeln('Connecting to console...');
            if (initialMessage) {
                terminal.write(initialMessage);
            }

            terminal.write(consoleBuffer);
            setConsoleBuffer('');

            terminalInstanceRef.current = terminal;
            fitAddonRef.current = fitAddon;
            fitAddon.fit();
            terminal.focus();
        }
    };

    useEffect(() => {
        if (consoleBuffer && terminalInstanceRef.current && !isLoading) {
            terminalInstanceRef.current.write(consoleBuffer);
            setConsoleBuffer('');
        }
    }, [consoleBuffer, isLoading]);

    useEffect(() => {

        console.log('Rendering terminal');
        if (dataWs || isRendered.current ||!terminalRef.current) return;
        console.log('Initiating connection', terminalRef.current);
        isRendered.current = true;

        const container = terminalRef.current;
        const { clientWidth, clientHeight } = container || document.documentElement;
        const width = Math.floor(clientWidth / 9);
        const height = Math.floor(clientHeight / 17);

        const websocketPromise = initiateConnection(width, height);

        return () => {
            websocketPromise.then((websockets) => {
                websockets?.forEach((ws) => ws.close());
            });
            if (terminalInstanceRef.current) {
                terminalInstanceRef.current.dispose();
                terminalInstanceRef.current = null;
            }
            if (fitAddonRef.current) {
                fitAddonRef.current.dispose();
                fitAddonRef.current = null;
            }
        };
    }, [instanceName]);

    const handleResize = () => {
        updateMaxHeight('p_terminal', undefined, 20);
        try {
            fitAddonRef.current?.fit();
            // terminalInstanceRef.current?.focus();
        } catch (error) {
            console.error('Error fitting terminal:', error);
        }
    };


    useLayoutEffect(() => {

        // Listen to resize event
        window.addEventListener('resize', handleResize);
        handleResize();  // Also apply on mount
        setTimeout(handleResize, 500);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);  // Empty dependency array ensures it runs once on mount and cleanup on unmount


    const handleFullScreen = () => {
        const container = terminalRef.current;
        if (!container) {
            return;
        }
        container
            .requestFullscreen()
            .then(handleResize)
            .catch((e) => {
                message.error(`Failed to enter full-screen mode: ${JSON.stringify(e)}`);
            });
        handleResize();
    };

    return (
        isLoading ? (
            <p>Loading text console...</p>
        ) : (
            <div className={css.consoleContainer}>
                <div ref={terminalRef} className={css.p_terminal} />
            </div>
        )
    );
};

export default LXDTextConsole;
