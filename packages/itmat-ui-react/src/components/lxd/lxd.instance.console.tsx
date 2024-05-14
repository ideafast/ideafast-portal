import React, { useState, useEffect, useRef} from 'react';
import { SpiceMainConn, handle_resize } from './spice/src/main';
import 'xterm/css/xterm.css';
import {message} from 'antd';

import css from './lxd.module.css';
import { trpc } from '../../utils/trpc';

declare global {
    interface Window {
        spice_connection?: SpiceMainConn;
    }
}

interface LXDConsoleProps {
    instanceName: string;
    onMount: (handler: () => void) => void;
  }

const updateVgaConsoleSize = () => {
    const spiceScreen = document.getElementById('spice-screen');
    if (spiceScreen) {

        // Set minimum dimensions to ensure the console is usable
        const minWidth = 1024;
        const minHeight = 768;

        // Calculate available dimensions
        const availableWidth = Math.max(window.innerWidth, minWidth);
        const availableHeight = Math.max(window.innerHeight - spiceScreen.offsetTop, minHeight);

        spiceScreen.style.width = `${availableWidth}px`;
        spiceScreen.style.height = `${availableHeight}px`;
    }
};


export const LXDConsole: React.FC<LXDConsoleProps> = ({ instanceName, onMount}) => {

    console.log('Rendering LXDConsole');

    const spiceRef = useRef<HTMLDivElement>(null);
    const [isVgaLoading, setIsVgaLoading] = useState<boolean>(false);

    const getInstanceConsole = trpc.lxd.getInstanceConsole.useMutation();

    const handleResize = () => {
        updateVgaConsoleSize();
        handle_resize();

    };

    const openVgaConsole = async () => {
        setIsVgaLoading(true);
        // Ensure the size is updated based on the current window size90hjhh]
        handleResize();

        const spiceScreen = document.getElementById('spice-screen');
        const width = spiceScreen ? spiceScreen.clientWidth : 1024; // Provide fallback dimensions
        const height = spiceScreen ? spiceScreen.clientHeight : 768;

        // use trpc to get the console console
        const res: any = await getInstanceConsole.mutateAsync({
            container: instanceName,
            options: {
                height: height,
                width: width,
                type: 'vga'
            }
        });
        setIsVgaLoading(false);

        if (!res) {
            return;
        }

        const result = res;

        // TODO, import from common files
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
                    message.error(`Error in console connection ${JSON.stringify(e)}`);
                },
                onsuccess: () => {
                    setIsVgaLoading(false);
                    handleResize();
                },
                onagent: handleResize
            });

        } catch (e) {
            message.error(`Console create error ${e}`);
        }

        return control;
    };

    const handleFullScreen = () => {
        console.log('2222 Entering full-screen mode');
        const container = spiceRef.current;
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


    useEffect(() => {

        const controlWebsocketPromise = openVgaConsole();

        return () => {
            controlWebsocketPromise.then((controlWebsocket) => {
                if (controlWebsocket && controlWebsocket.readyState === WebSocket.OPEN) {
                    controlWebsocket.close();
                    console.log('WebSocket connection closed.');
                }
            }).catch(e => {
                message.error(`Error closing WebSocket: ${JSON.stringify(e)}`);
            });

            // Ensure that the SPICE connection is stopped properly
            if (window.spice_connection) {
                try {
                    window.spice_connection.stop();
                } catch (e) {
                    message.error(`Error stopping Console connection:  ${JSON.stringify(e)}`);
                }
            }
        };
    }, [instanceName]);

    useEffect(() => {
        handleResize();

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [instanceName]);

    useEffect(() => {
        console.log('222222 attached the  full-screen function to the onMount event.');
        onMount(handleFullScreen);
    }, [instanceName, onMount]);


    return isVgaLoading ? (
        <div className={css.loading}>Loading VGA console...</div>
    ) : (
        <div id="spice-area" ref={spiceRef} className={css.spiceArea}>
            <div id="spice-screen" className={css.spiceScreen} />
        </div>
    );
};