import React, { useState, useEffect, useRef, useLayoutEffect} from 'react';
import { XTerm } from 'xterm-for-react';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import css from './lxd.module.css';
// import { useWebSocket } from 'react-use-websocket';  // Import the hook
import { trpc } from '../../utils/trpc';
import { message } from 'antd';
import {updateMaxHeight} from './util/updateMaxHeight';

interface LXDTextConsoleProps {
  instanceName: string;
}

const LXDTextConsole: React.FC<LXDTextConsoleProps> = ({ instanceName}) => {
    console.log('Rendering LXDTextConsole');
    const xtermRef = useRef<XTerm>(null);
    const textEncoder = new TextEncoder();
    const [isLoading, setLoading] = useState<boolean>(false);

    const [consoleBuffer, setConsoleBuffer] = useState('');
    const [dataWs, setDataWs] = useState<WebSocket | null>(null);
    const [fitAddon] = useState<FitAddon>(new FitAddon());

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
                setConsoleBuffer(result.data);
            }
        } catch (error) {
            message.error(`Failed to load console buffer: ${error}`);
        }
    };

    const initiateConnection = async (width = 100, height = 100) => {
        setLoading(true);
        fetchConsoleLogBuffer();

        // use trpc to get the console log buffer
        const result: any = await getInstanceConsole.mutateAsync({
            container: instanceName,
            options: { height, width, type: 'console' } // Ensure these options match your backend's expected input
        }).catch((error) => {   setLoading(false); throw new Error(`Failed to initiate console session: ${error}`); });

        if (result.error) {
            setLoading(false);
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
            setDataWs(data_ws);
        };
        data_ws.onerror = (error) => {
            // show the message notification no more than 5 seconds
            message.error(`Console connection error: ${JSON.stringify(error)}`, 5);
        };

        data_ws.binaryType = 'arraybuffer';
        data_ws.onmessage =  (message: MessageEvent<ArrayBuffer>) => {
            xtermRef.current?.terminal.writeUtf8(new Uint8Array(message.data));
        };
        data_ws.onclose = () => {
            setDataWs(null);
        };

        return [data_ws, control_ws];
    };

    useEffect(() => {
        xtermRef.current?.terminal.focus();
    }, [xtermRef.current, instanceName]);

    useEffect(() => {

        if (dataWs) return;
        let isActive = true;
        const container = document.querySelector('.console-modal .ant-modal-body');
        const { clientWidth, clientHeight } = container || document.documentElement;
        const width = Math.floor(clientWidth / 9);
        const height = Math.floor(clientHeight / 17);

        const websocketPromise = initiateConnection(width, height);

        return () => {
            isActive = false;
            void websocketPromise.then((websockets) => {
                if(!isActive) websockets?.map((ws) => ws.close());
            });
        };

    }, [xtermRef, fitAddon, instanceName]);

    useEffect(() => {
        if (!consoleBuffer || !xtermRef.current || isLoading) {
            return;
        }
        xtermRef.current.terminal.write(consoleBuffer);
        setConsoleBuffer('');
    }   , [consoleBuffer, xtermRef, isLoading]);

    // Make sure to apply the fit only when the terminal is rendered and visible
    useLayoutEffect(() => {
        const handleResize = () => {

            if (xtermRef.current) {

                updateMaxHeight('p_terminal', undefined, 20);

                try {
                    fitAddon.fit();
                } catch (error) {
                    console.error('Error fitting terminal:', error);
                }
            }
        };

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
                <XTerm
                    ref={xtermRef}
                    addons={[fitAddon]}
                    className={css.p_terminal}
                    onData={(data) => {
                        dataWs?.send(textEncoder.encode(data));
                    }}
                />
            </div>
        )
    );
};

export default LXDTextConsole;
