import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SpiceMainConn, handle_resize } from './spice/src/main';
import 'xterm/css/xterm.css';

import css from './lxd.module.css';

declare global {
    // eslint-disable-next-line no-unused-vars
    interface Window {
        spice_connection?: SpiceMainConn;
    }
}


const updateVgaConsoleSize = () => {
    const spiceScreen = document.getElementById('spice-screen');
    if (spiceScreen) {
        // Optionally, you can adjust these offsets based on your UI layout
        // const offsetTop = spiceScreen.offsetTop;
        // const height = window.innerHeight - offsetTop;
        // spiceScreen.style.height = `${height}px`;

        // Set minimum dimensions to ensure the console is usable
        const minWidth = 800;
        const minHeight = 600;

        // Calculate available dimensions
        const availableWidth = Math.max(window.innerWidth, minWidth);
        const availableHeight = Math.max(window.innerHeight - spiceScreen.offsetTop, minHeight);

        spiceScreen.style.width = `${availableWidth}px`;
        spiceScreen.style.height = `${availableHeight}px`;
    }
};




export const LXDConsole: React.FC<{ instanceName: string }> = ({ instanceName }) => {

    console.log('>>> Enter the LXDConsole instanceName', instanceName );

    const spiceRef = useRef<HTMLDivElement>(null);
    const [hasStarted, setHasStarted] = useState(false);

    const handleResize = () => {
        updateVgaConsoleSize();
        handle_resize();
    };

    const openVgaConsole = useCallback(async () => {

        // Ensure the size is updated based on the current window size
        updateVgaConsoleSize();

        const spiceScreen = document.getElementById('spice-screen');
        const width = spiceScreen ? spiceScreen.clientWidth : 1024; // Provide fallback dimensions
        const height = spiceScreen ? spiceScreen.clientHeight : 768;

        console.log('spiceScreen width height', width, height);

        const res = await fetch('/lxd/console?c=' + instanceName, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // width: spiceRef.current?.clientWidth,
                // height: spiceRef.current?.clientHeight,
                width: width,
                height: height,
                type: 'vga'
            })
        });

        if (!res) {
            return;
        }
        const result = await res.json();

        const baseUrl = new URL(window.location.href);
        baseUrl.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        baseUrl.pathname = '/rtc';

        const dataUrl = `${baseUrl.href}?t=d&o=${result.operationId}&s=${result.operationSecrets['0']}`;
        const controlUrl = `${baseUrl.href}?t=c&o=${result.operationId}&s=${result.operationSecrets.control}`;

        const control = new WebSocket(controlUrl);

        try {
            window.spice_connection = new SpiceMainConn({
                uri: dataUrl,
                screen_id: 'spice-screen',
                onerror: (e) => {
                    console.error('Error in spice connection', e);
                },
                onsuccess: () => {
                    handleResize();
                },
                onagent: handleResize
            });

            // // Clipboard from client to server
            // document.addEventListener('copy', (e) => {
            //     const clipboardData = e.clipboardData;
            //     if (clipboardData) {
            //         const text = clipboardData.getData('text/plain');
            //         // If window.spice_connection is potentially undefined, check if it's defined before using it
            //         window.spice_connection?.agent.clipboard_grab(text, SpiceMainConn.TYPE_TEXT);
            //     }
            //     e.preventDefault(); // Prevent the default copy action
            // });

            // // Clipboard from server to client
            // window.spice_connection.add_channel_event_listener('spice_channel', 'agent', (agent, type) => {
            //     if (type === SpiceMainConn.TYPE_CLIPBOARD) {
            //         agent.clipboard_request(SpiceMainConn.TYPE_TEXT);
            //     } else if (type === SpiceMainConn.TYPE_CLIPBOARD_SELECTION) {
            //         // Handle clipboard selection if needed
            //     }
            // });

            // window.spice_connection.agent.addEventListener('message', (e) => {
            //     if (e.type === 'clipboard') {
            //         const text = e.data; // The text from the Spice server's clipboard
            //         navigator.clipboard.writeText(text).then(() => {
            //             console.log('Clipboard text copied to client.');
            //         }).catch((err) => {
            //             console.error('Failed to copy text to clipboard:', err);
            //         });
            //     }
            // });
        } catch (e) {
            console.error('Spice create error', e);
        }


        return control;
    }, [instanceName]);


    useEffect(() => {

        // TODO !!!
        // Should be removed and use proper async traps
        if (hasStarted || (window as any).hasSpice)
            return;

        (window as any).hasSpice = true;

        setHasStarted(true);
        const controlWebsocketPromise = openVgaConsole();
        return () => {
            try {
                window.spice_connection?.stop();
            } catch (e) {
                console.error('Connection opening failed', e);
            }
            void controlWebsocketPromise.then((controlWebsocket) => {
                controlWebsocket?.close();
            });
        };
    }, [hasStarted, openVgaConsole]);

    useEffect(() => {
        updateVgaConsoleSize();
        window.addEventListener('resize', updateVgaConsoleSize);

        return () => {
            window.removeEventListener('resize', updateVgaConsoleSize);
        };
    }, []);

    return <div id="spice-area" ref={spiceRef} className={css.spiceArea}>
        <div id="spice-screen" className={css.spiceScreen} />
    </div>;
};