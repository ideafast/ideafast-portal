import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SpiceMainConn, handle_resize } from './spice/src/main';
// import { XTerm } from 'xterm-for-react';
// import { FitAddon } from 'xterm-addon-fit';
// import 'xterm/css/xterm.css';
// import axios from 'axios';
// import { updateMaxHeight } from './util/updateMaxHeight';
import css from './lxd.module.css';

declare global {
    // eslint-disable-next-line no-unused-vars
    interface Window {
        spice_connection?: SpiceMainConn;
    }
}

export const LXDConsole: React.FC<{ instanceName: string }> = ({ instanceName }) => {

    const spiceRef = useRef<HTMLDivElement>(null);
    const [hasStarted, setHasStarted] = useState(false);

    const handleResize = () => {
        handle_resize();
    };

    const openVgaConsole = useCallback(async () => {
        const res = await fetch('/lxd/console?c=' + instanceName, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                width: spiceRef.current?.clientWidth,
                height: spiceRef.current?.clientHeight,
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
            void controlWebsocketPromise.then((/* controlWebsocket */) => {
                // controlWebsocket?.close();
            });
        };
    }, [hasStarted, openVgaConsole]);

    return <div id="spice-area" ref={spiceRef} className={css.spiceArea}>
        <div id="spice-screen" className={css.spiceScreen} />
    </div>;
};