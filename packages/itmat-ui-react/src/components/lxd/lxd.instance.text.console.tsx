import React, { useState, useEffect, useRef, useCallback, useLayoutEffect , useReducer} from 'react';
import { XTerm } from 'xterm-for-react';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import axios from 'axios';
import css from './lxd.module.css';

interface LXDTextConsoleProps {
  instanceName: string;
  connectSignal: boolean; // Add a new prop to receive the signal
  onConnectionClose: () => void; // Callback to reset the signal in the parent
}

const ActionTypes = {
    CONNECTING: 'CONNECTING',
    OPEN: 'OPEN',
    CLOSED: 'CLOSED'
};

const textDecoder = new TextDecoder('utf-8');

const updateMaxHeight = (targetElement, additionalOffset = 0) => {
    const above = targetElement.getBoundingClientRect().top;
    const offset = Math.ceil(above + additionalOffset);
    const height = `calc(100vh - ${offset}px)`;
    targetElement.style.height = height;
};


const connectionReducer = (state, action) => {
    switch (action.type) {
        case ActionTypes.CONNECTING:
            return { ...state, status: WebSocket.CONNECTING };
        case ActionTypes.OPEN:
            return { ...state, status: WebSocket.OPEN, socket: action.socket };
        case ActionTypes.CLOSED:
            return { ...state, status: WebSocket.CLOSED, socket: null };
        default:
            throw new Error();
    }
};

// const LXDTextConsole: React.FC<LXDTextConsoleProps> = React.memo(({ instanceName,connectSignal, onConnectionClose }) => {
const LXDTextConsole: React.FC<LXDTextConsoleProps> = ({ instanceName,connectSignal, onConnectionClose }) => {

    const [{ status, socket }, dispatch] = useReducer(connectionReducer, { status: WebSocket.CLOSED, socket: null });

    console.log('Test accessing the text console component >>>');
    const xtermRef = useRef<XTerm>(null);
    const [isLoading, setLoading] = useState<boolean>(true);

    const fitAddon = useRef(new FitAddon()).current;
    const [consoleBuffer, setConsoleBuffer] = useState('');

    const [dataWs, setDataWs] = useState<WebSocket | null>(null);
    const [wsStatus, setWsStatus] = useState(WebSocket.CLOSED);

    console.log('11 status', status);

    // New function to fetch console log buffer
    const fetchConsoleLogBuffer = useCallback(async () => {
        try {
            const response = await axios.get(`/lxd/instances/${instanceName}/console`);
            if (response.status === 200 && response.data) {
                setConsoleBuffer(response.data);
            } else {
                throw new Error('Failed to fetch console log buffer.');
            }
        } catch (error) {
            console.error('Failed to load console buffer:', error);
        }
    }, [instanceName]);


    const initiateConnection = useCallback(async () => {

        if (status !== WebSocket.CLOSED || !connectSignal) return;

        dispatch({ type: ActionTypes.CONNECTING });
        setLoading(true);
        fetchConsoleLogBuffer();


        onConnectionClose();
        try {
            // exec
            console.log('Attempting to fetch the LXD console WebSocket for:', instanceName);
            console.log('status:', status);

            const response = await fetch(`/lxd/console?c=${instanceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 'wait-for-websocket': true, 'type': 'console' })
            });

            if (!response.ok) throw new Error('Failed to initiate console session');

            const result = await response.json();
            const baseUrl = new URL(window.location.href);
            baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            baseUrl.pathname = '/rtc';
            const dataUrl = `${baseUrl.href}?t=d&o=${result.operationId}&s=${result.operationSecrets['0']}`;

            const ws = new WebSocket(dataUrl);

            ws.onopen = () => {
                console.log('Data WebSocket connection established');
                setLoading(false);
                dispatch({ type: ActionTypes.OPEN, socket: ws });
            };

            ws.binaryType = 'arraybuffer';

            ws.onmessage = (message) => {
                console.log('message from backend:', message.data);
                const decodedMessage = textDecoder.decode(new Uint8Array(message.data));
                xtermRef.current?.terminal.write(decodedMessage);
            };

            ws.onclose = () => {
                console.log('WebSocket connection closed');
                setLoading(false);
                dispatch({ type: ActionTypes.CLOSED });
                onConnectionClose();
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                setLoading(false);
                dispatch({ type: ActionTypes.CLOSED });
                onConnectionClose();
            };
        } catch (error) {
            console.error('Connection initiation failed:', error);
            setLoading(false);
            dispatch({ type: ActionTypes.CLOSED });
            onConnectionClose();
        }
    }, [instanceName, connectSignal, status, onConnectionClose, fetchConsoleLogBuffer]);

    const handleResize = useCallback(() => {
        if (xtermRef.current) {
            const terminalElement = xtermRef.current.terminal.element;
            updateMaxHeight(terminalElement, 10); // You might need to adjust the offset value
            fitAddon.fit(); // This will fit the terminal within the new dimensions
            xtermRef.current?.terminal.focus();
        }
    }, [xtermRef, fitAddon]);


    useEffect(() => {
        if (connectSignal && status === WebSocket.CLOSED) {
            initiateConnection();
        }

        return () => {
            if (socket) {
                console.log('Cleaning up WebSocket connection');
                socket?.close();
                dispatch({ type: ActionTypes.CLOSED });
                onConnectionClose();
            }
        };
    }, [connectSignal, status, socket, initiateConnection, onConnectionClose]);


    useEffect(() => {
        handleResize();
        // Other initialization code if necessary
    }, [handleResize]);

    // useEffect(() => {
    //     fitAddon.fit();
    //     xtermRef.current?.terminal.focus();
    // }, []);

    // useEffect(() => {
    //     handleResize();

    //     window.addEventListener('resize', handleResize);
    //     return () => {
    //         window.removeEventListener('resize', handleResize);
    //     };
    // }, []);

    useLayoutEffect(() => {
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [handleResize]);

    useLayoutEffect(() => {
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [handleResize]);

    // Write the console buffer to the XTerm component when it's available
    useEffect(() => {
        if (consoleBuffer && xtermRef.current && !isLoading) {
            xtermRef.current.terminal.write(consoleBuffer);
            // Optionally, clear the buffer state if you don't need it anymore
            setConsoleBuffer('');
        }
    }, [consoleBuffer, isLoading]);

    return (
        <div className={css.pTerminalFullscreen}>
            {isLoading ? (
                <p>Loading text console...</p>
            ) : (
                <XTerm
                    ref={xtermRef}
                    addons={[fitAddon]}
                    options={{ cursorBlink: true }}
                    className="p-terminal"
                    onData={(data) => {
                        if (socket && socket.readyState === WebSocket.OPEN) {
                            const encodedData = new TextEncoder().encode(data);
                            socket.send(encodedData);
                        } else {
                            console.error('WebSocket is not open');
                        }
                    }}
                />
            )}
        </div>
    );
};

export default LXDTextConsole;
