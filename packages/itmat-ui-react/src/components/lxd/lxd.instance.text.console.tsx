import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo} from 'react';
import { Terminal } from 'xterm';
// import '@xterm/xterm/css/xterm.css';
// https://www.npmjs.com/package/@xterm/xterm
import { FitAddon } from '@xterm/addon-fit';
// https://www.npmjs.com/package/@xterm/addon-fit
import css from './lxd.module.css';
// import { useWebSocket } from 'react-use-websocket';  // Import the hook
import { trpc } from '../../utils/trpc';
import { message } from 'antd';
import {updateMaxHeight} from './util/updateMaxHeight';
import { LxdGetInstanceConsoleResponse } from '@itmat-broker/itmat-types';

interface LXDTextConsoleProps {
  instanceName: string;
}

const LXDTextConsole: React.FC<LXDTextConsoleProps> = ({ instanceName}) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const textEncoder = useMemo(() => new TextEncoder(), []);
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
    const fetchConsoleLogBuffer = useCallback(async () => {
        try {
            // use trpc to get the console log buffer
            const result = await getInstanceConsolelog.mutateAsync({
                container: instanceName
            });
            if (result && result.data) {

                setConsoleBuffer(result.data);
            }
        } catch (error) {
            void  message.error(`Failed to load console buffer: ${JSON.stringify(error)}`);
        }
    }, [getInstanceConsolelog, instanceName]);


    const initTerminal = useCallback((dataWs: WebSocket, initialMessage?: Uint8Array) => {
        if (terminalRef.current && !terminalInstanceRef.current) {
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
    }, [consoleBuffer, textEncoder]);

    const initiateConnection = useCallback(async (width = 100, height = 100) => {
        setLoading(true);

        try {
            await fetchConsoleLogBuffer();
            // use trpc to get the console log buffer
            const result: LxdGetInstanceConsoleResponse = await getInstanceConsole.mutateAsync({
                container: instanceName,
                options: { height, width, type: 'console' } // Ensure these options match your backend's expected input
            });

            if ('error' in result && result.error) {
                throw new Error(`Failed to initiate console session: ${result.error}`);
            }

            // Type guard to check if result contains operationId and operationSecrets
            if (!('operationId' in result) || !('operationSecrets' in result)) {
                throw new Error(`Failed to initiate console session: ${result.error}`);
            }
            const baseUrl = new URL(window.location.href);
            baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            baseUrl.pathname = '/rtc';
            const dataUrl = `${baseUrl.href}?t=d&o=${result.operationId}&s=${result.operationSecrets['0']}`;
            const controlUrl = `${baseUrl.href}?t=c&o=${result.operationId}&s=${result.operationSecrets.control}`;

            const data_ws = new WebSocket(dataUrl);
            const control_ws = new WebSocket(controlUrl);

            control_ws.onopen = () => {

                setLoading(false);
            };

            data_ws.onopen = () => {
                setDataWs(data_ws);
                initTerminal(data_ws, new Uint8Array(textEncoder.encode('test\r')));
            };
            data_ws.onerror = (error) => {
            // show the message notification no more than 5 seconds
                void message.error(`Console connection error ${JSON.stringify(error)}`, 2);
            };

            data_ws.binaryType = 'arraybuffer';
            data_ws.onmessage =  (message: MessageEvent<ArrayBuffer>) => {
                if (terminalInstanceRef.current) {
                    terminalInstanceRef.current.write(new Uint8Array(message.data));
                } else {
                    initTerminal(data_ws,new Uint8Array(message.data));
                }

            };
            data_ws.onclose = () => {
                setDataWs(null);
            };

            return [data_ws, control_ws];
        } catch (error) {
            void message.error(`Error initiating connection: ${JSON.stringify(error)}`);
            setLoading(false);
            return [];
        }
    }, [fetchConsoleLogBuffer, getInstanceConsole, initTerminal, instanceName, textEncoder]);

    useEffect(() => {
        if (consoleBuffer && terminalInstanceRef.current && !isLoading) {
            terminalInstanceRef.current.write(consoleBuffer);
            setConsoleBuffer('');
        }
    }, [consoleBuffer, isLoading]);

    useEffect(() => {

        if (dataWs || isRendered.current ||!terminalRef.current) return;
        isRendered.current = true;

        const container = terminalRef.current;
        const { clientWidth, clientHeight } = container || document.documentElement;
        const width = Math.floor(clientWidth / 9);
        const height = Math.floor(clientHeight / 17);

        const websocketPromise = initiateConnection(width, height);

        return () => {
            const cleanup = async () => {
                await websocketPromise.then((websockets) => {
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
            void cleanup();
        };
    }, [dataWs, initiateConnection, instanceName]);

    const handleResize = () => {
        updateMaxHeight('p_terminal', undefined, 20);
        try {
            fitAddonRef.current?.fit();
            // terminalInstanceRef.current?.focus();
        } catch (error) {
            void message.error(`Error fitting terminal:${JSON.stringify(error)}`);
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
