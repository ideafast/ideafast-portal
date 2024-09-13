import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef} from 'react';
import { SpiceMainConn, handle_resize } from './spice/src/main';
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
  }

export interface LXDConsoleRef {
    handleFullScreen: () => void
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


export const LXDConsole = forwardRef<LXDConsoleRef, LXDConsoleProps>(({ instanceName }, ref) => {

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

        const res = await getInstanceConsole.mutateAsync({
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
        // Check if the response is an error
        if ('error' in res) {
            void message.error(`Error in console connection: ${res.data}`);
            return;
        }


        const result = res;

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
                    void message.error(`Error in console connection ${JSON.stringify(e)}`);
                },
                onsuccess: () => {
                    setIsVgaLoading(false);
                    handleResize();
                },
                onagent: handleResize
            });

        } catch (e) {
            void message.error(`Console create error ${e}`);
        }

        return control;
    };

    const handleFullScreen = () => {
        const container = spiceRef.current;
        if (!container) {
            return;
        }
        container
            .requestFullscreen()
            .then(handleResize)
            .catch((e) => {
                void message.error(`Failed to enter full-screen mode: ${JSON.stringify(e)}`);
            });
        handleResize();


    };

    useImperativeHandle(ref, () => ({
        handleFullScreen
    }));

    useEffect(() => {

        const controlWebsocketPromise = openVgaConsole();

        return () => {
            controlWebsocketPromise.then((controlWebsocket) => {
                if (controlWebsocket && controlWebsocket.readyState === WebSocket.OPEN) {
                    controlWebsocket.close();
                }
            }).catch(e => {
                void message.error(`Error closing WebSocket: ${JSON.stringify(e)}`);
            });

            // Ensure that the SPICE connection is stopped properly
            if (window.spice_connection) {
                try {
                    window.spice_connection.stop();
                } catch (e) {
                    void message.error(`Error stopping Console connection:  ${JSON.stringify(e)}`);
                }
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instanceName]);

    useEffect(() => {
        handleResize();

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [instanceName]);

    return isVgaLoading ? (
        <div className={css.loading}>Loading VGA console...</div>
    ) : (
        <div id="spice-area" ref={spiceRef} className={css.spiceArea}>
            <div id="spice-screen" className={css.spiceScreen} />
        </div>
    );
});