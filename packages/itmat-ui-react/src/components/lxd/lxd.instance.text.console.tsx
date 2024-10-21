import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
// import { Terminal } from 'xterm';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { message } from 'antd';
import { trpc } from '../../utils/trpc';
import css from './lxd.module.css';
import { LxdGetInstanceConsoleResponse } from '@itmat-broker/itmat-types';

interface LXDTextConsoleProps {
    instanceName: string;
}

export interface LXDTextConsoleRef {
    handleFullScreen: () => void;
}

export const LXDTextConsole = forwardRef<LXDTextConsoleRef, LXDTextConsoleProps>(({ instanceName }, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const terminalInstanceRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const [dataWs, setDataWs] = useState<WebSocket | null>(null);
    const [controlWs, setControlWs] = useState<WebSocket | null>(null);
    const [isLoading, setLoading] = useState<boolean>(false);
    const [consoleBuffer, setConsoleBuffer] = useState('');
    const isRendered = useRef<boolean>(false);
    const textEncoder = useMemo(() => new TextEncoder(), []);
    // const textDecoder = useMemo(() => new TextDecoder('utf-8'), []);
    const textDecoder = useMemo(() => new TextDecoder('utf-8', { fatal: false }), []);



    const getInstanceConsole = trpc.lxd.getInstanceConsole.useMutation();
    const getInstanceConsoleLog = trpc.lxd.getInstanceConsoleLog.useMutation();

    let messageBuffer: string[] = [];

    const flushMessageBuffer = () => {
        if (terminalInstanceRef.current) {
            messageBuffer.forEach(message => terminalInstanceRef.current?.write(message));
            messageBuffer = [];
        }
    };


    // Fetch console log buffer before connecting the terminal.
    const fetchConsoleLogBuffer = useCallback(async () => {
        try {
            const result = await getInstanceConsoleLog.mutateAsync({ container: instanceName });
            if (result?.data) {
                setConsoleBuffer(result.data);
            }
        } catch (error) {
            void message.error(`Failed to load console buffer: ${JSON.stringify(error)}`);
        }
    }, [getInstanceConsoleLog, instanceName]);

    const initTerminal = useCallback((dataWs: WebSocket) => {
        if (terminalRef.current && !terminalInstanceRef.current) {

            const terminal = new Terminal({
                convertEol: true,
                cursorStyle: 'block',
                cursorWidth: 1,
                cursorBlink: true,
                fontFamily: 'Times New Roman',  // Ensure it is truly monospaced
                fontSize: 16,
                fontWeight: 'normal',
                letterSpacing: -1,  // Adjust this to 1 or -1 if spacing issues persist
                lineHeight: 1.2,  // Adjust this to 1.2 or 1.5 if line spacing issues persist
                scrollback: 1000,  // Adding more scrollback to prevent visual overflow issues
                theme: {
                    background: '#2b2b2b',
                    foreground: '#FFFFFF',
                    cursor: '#00FF00'
                },
                disableStdin: false,  // Ensure terminal input is enabled
                allowProposedApi: true,  // Allow the use of advanced APIs
                windowsMode: true  // Try setting this to true if using Windows (for line ending compatibility)
            });
            const fitAddon = new FitAddon();
            terminal.loadAddon(fitAddon);
            terminal.open(terminalRef.current);

            terminal.onData((data) => {
                dataWs.send(textEncoder.encode(data));
                terminal.focus();
            });
            fitAddon.fit();
            terminal.focus();
            // // Adjust terminal size after initial messages
            // setTimeout(() => {
            //     fitAddon.fit();
            //     terminal.focus();
            // }, 100);


            terminal.writeln('Connecting to console...\r\n');
            // Write initial message
            setTimeout(() => {
                fitAddon.fit();  // Ensure fit after writing
                terminal.focus();  // Refocus after connecting message
            }, 500);

            if (consoleBuffer) {
                terminal.write(consoleBuffer);
                setConsoleBuffer('');
                setTimeout(() => {
                    fitAddon.fit(); // Ensure fit after writing the buffer
                    terminal.focus(); // Refocus after writing
                }, 200);
            }

            terminalInstanceRef.current = terminal;
            fitAddonRef.current = fitAddon;

            // Flush any buffered messages once the terminal is ready
            flushMessageBuffer();
            // Ensure terminal height is adjusted after initialization
            // updateMaxHeight('p-terminal', undefined, 10);
            handleResize();  // Ensure terminal is resized properly on initialization
        }
    }, [consoleBuffer, textEncoder]);

    const initiateConnection = useCallback(async (width: number, height: number) => {
        setLoading(true);
        try {
            await fetchConsoleLogBuffer();

            const result: LxdGetInstanceConsoleResponse = await getInstanceConsole.mutateAsync({
                container: instanceName,
                options: { height, width, type: 'console' }
            });

            // Check if the result contains the operationId (indicating success)
            if ('operationId' in result && result.operationId) {
                const baseUrl = new URL(window.location.href);
                baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
                baseUrl.pathname = '/rtc';

                // Data WebSocket connection
                const dataUrl = `${baseUrl.href}?t=d&o=${result.operationId}&s=${result.operationSecrets['0']}`;
                const data_ws = new WebSocket(dataUrl);
                data_ws.binaryType = 'arraybuffer';

                // Control WebSocket connection
                const controlUrl = `${baseUrl.href}?t=c&o=${result.operationId}&s=${result.operationSecrets.control}`;
                const control_ws = new WebSocket(controlUrl);

                // Setup Data WebSocket
                data_ws.onopen = () => {
                    setDataWs(data_ws);
                    initTerminal(data_ws);
                };

                data_ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
                    try {
                        const messageData = new Uint8Array(event.data);
                        let  decodedMessage = textDecoder.decode(messageData, { stream: true });

                        // Remove excessive carriage returns
                        decodedMessage = decodedMessage.replace(/\r+/g, '');

                        // console.log(decodedMessage);  // For debugging

                        if (terminalInstanceRef.current) {
                            setTimeout(() => {
                                terminalInstanceRef.current?.write(decodedMessage);
                                fitAddonRef.current?.fit();  // Fit after each message
                                terminalInstanceRef.current?.focus();
                            }, 50);  // Add a slight delay to prevent overflow
                        } else {
                            messageBuffer.push(decodedMessage); // Buffer messages until terminal is ready
                        }
                    } catch (error) {
                        console.error('Error decoding WebSocket message:', error);
                    }
                };


                data_ws.onerror = (error) => {
                    void message.error(`Console connection error: ${JSON.stringify(error)}`);
                };

                data_ws.onclose = () => {
                    // Finalize the decoder
                    const finalMessage = textDecoder.decode();
                    if (finalMessage) {
                        if (terminalInstanceRef.current) {
                            terminalInstanceRef.current.write(finalMessage);
                        } else {
                            messageBuffer.push(finalMessage);
                        }
                    }
                    setDataWs(null);
                };

                // Setup Control WebSocket
                control_ws.onopen = () => {
                    setControlWs(control_ws);
                };

                control_ws.onerror = (error) => {
                    void message.error(`Control connection error: ${JSON.stringify(error)}`);
                };

                control_ws.onclose = () => {
                    setControlWs(null);
                };

            } else if ('error' in result && result.error) {
                throw new Error(`Failed to initiate console session: ${result.data}`);
            }
        } catch (error) {
            void message.error(`Error initiating connection: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setLoading(false);
        }
    }, [fetchConsoleLogBuffer, getInstanceConsole, initTerminal, instanceName]);

    // Handle terminal resizing
    const handleResize = () => {
        if (fitAddonRef.current && terminalInstanceRef.current) {
            fitAddonRef.current.fit();
            terminalInstanceRef.current?.focus();

            // console.log('Resizing Terminal:', fitAddonRef.current.proposeDimensions());

            const dimensions = fitAddonRef.current.proposeDimensions();

            if (dimensions && controlWs?.readyState === WebSocket.OPEN) {
                // Update the terminal dimensions based on the proposed dimensions
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


    const forceRedraw = () => {
        if (terminalInstanceRef.current) {
            const dimensions = fitAddonRef.current?.proposeDimensions();
            if (dimensions) {
                terminalInstanceRef.current.resize(dimensions.cols, dimensions.rows);
                terminalInstanceRef.current.refresh(0, dimensions.rows - 1);  // Force a full refresh
            }
        }
    };

    // Call this after resize or after writing content
    setTimeout(() => {
        forceRedraw();  // Force terminal redraw after certain events
    }, 200);


    useEffect(() => {
        if (consoleBuffer && terminalInstanceRef.current && !isLoading) {
            // const consoleBufferData = textEncoder.encode(consoleBuffer);
            terminalInstanceRef.current.write(consoleBuffer);
            setConsoleBuffer('');
        }
    }, [consoleBuffer, isLoading]);

    useEffect(() => {
        if (!terminalRef.current || isRendered.current) return;
        isRendered.current = true;

        const { clientWidth, clientHeight } = terminalRef.current || document.documentElement;
        const width = Math.floor(clientWidth / 9);
        const height = Math.floor(clientHeight / 17);

        initiateConnection(width, height).catch(error => {
            void message.error(`Failed to initiate connection: ${error instanceof Error ? error.message : String(error)}`);
        });

        return () => {
            if (dataWs) {
                dataWs.close();
            }
            if (controlWs) {
                controlWs.close();
            }
            if (terminalInstanceRef.current) {
                terminalInstanceRef.current.dispose();
                terminalInstanceRef.current = null;
            }
            if (fitAddonRef.current) {
                fitAddonRef.current.dispose();
                fitAddonRef.current = null;
            }
        };
    }, [dataWs, controlWs, initiateConnection, instanceName]);

    useLayoutEffect(() => {
        const handleResizeWithDelay = () => {
            handleResize();
            setTimeout(() => fitAddonRef.current?.fit(), 500);  // Delay to avoid race condition
        };

        window.addEventListener('resize', handleResizeWithDelay);
        return () => {
            window.removeEventListener('resize', handleResizeWithDelay);
        };
    }, [controlWs]);

    // Fullscreen handler similar to the VGA console's `handleFullScreen`
    const handleFullScreen = () => {
        const container = terminalRef.current;
        if (!container) {
            return;
        }
        container
            .requestFullscreen()
            .then(handleResize).then(() => {
                // container.classList.add(css['fullscreen-terminal']);  // Add the CSS module class for fullscreen
                if (fitAddonRef.current) {
                    fitAddonRef.current.fit();  // Ensure terminal fits the fullscreen container
                }
                terminalInstanceRef.current?.focus();  // Focus the terminal after entering fullscreen
            })
            .catch((e) => {
                void message.error(`Failed to enter full-screen mode: ${JSON.stringify(e)}`);
            });
    };

    // Expose the fullscreen handler to the parent via `useImperativeHandle`
    useImperativeHandle(ref, () => ({
        handleFullScreen
    }));


    return (
        isLoading ? (
            <p>Loading text console...</p>
        ) : (
            <div className={css.consoleContainer}>
                <div ref={terminalRef} className="p-terminal" />
            </div>
        )
    );
});
