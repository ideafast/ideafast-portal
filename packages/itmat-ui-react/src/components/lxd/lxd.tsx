import React, { useState, useEffect } from 'react';

export const LXDCommandExecutor: React.FC = () => {
    const [commandOutput, setCommandOutput] = useState('');
    const [ws, setWs] = useState<WebSocket | null>(null);

    useEffect(() => {
        // Call the LXD API to create exec operation

        const initContainerConnection = async () => {
            console.log('start request http://localhost:3333/lxd/1.0/instances/ae002/exec');
            try {
                const response = await fetch('http://localhost:3333/lxd/1.0/instances/ae002/exec', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                        // If authentication is needed, add the appropriate headers here
                    },
                    body: JSON.stringify({
                        'command': ['bash'], // Replace 'bash' with the actual command you want to run
                        'wait-for-websocket': true,
                        'interactive': true,
                        'width': 80,
                        'height': 24,
                        'environment': {
                            TERM: 'xterm'
                        }
                    })
                });
                console.log('End  response', response);

                if (!response.ok) {
                    throw new Error('Failed to initiate connection to container.');
                }

                const data = await response.json();
                // Now use the operation metadata from the response to connect via WebSocket
                const operationId = data.metadata.id;
                const fds = data.metadata.metadata.fds;

                // Establish WebSocket connection for each file descriptor
                Object.entries(fds).forEach(([key, secret]) => {
                    const socket = new WebSocket(`http://localhost:3333/lxd/1.0/operations/${operationId}/websocket?secret=${secret}`);
                    socket.onopen = () => {
                        console.log(`WebSocket ${key} connected`);
                        if (key === '0') {
                            setWs(socket); // Save the WebSocket for sending commands
                        }
                    };
                    socket.onmessage = (event) => {
                        if (key === '0') { // Assuming '0' is the file descriptor for stdout
                            setCommandOutput(prev => prev + '\n' + event.data);
                        }
                    };
                    socket.onerror = (event) => {
                        console.error(`WebSocket error on ${key}:`, event);
                    };
                    socket.onclose = () => {
                        console.log(`WebSocket ${key} disconnected`);
                        if (key === '0') {
                            setWs(null);
                        }
                    };
                });

            } catch (error) {
                console.log('lllllxxxxxd');
                console.error('Error initiating connection to container:', error);
            }
        };

        initContainerConnection();
    }, []);

    const sendCommand = (command: string) => {
        if (ws) {
            ws.send(command);
        }
    };

    return (
        <div>
            <h2>Execute Command in Container</h2>
            <textarea
                readOnly
                value={commandOutput}
                style={{ width: '100%', height: '300px' }}
            />
            <input
                type="text"
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        sendCommand(e.currentTarget.value);
                        e.currentTarget.value = ''; // Clear the input after sending
                    }
                }}
            />
            <button onClick={() => sendCommand('echo "Hello from the container!"')}>Execute Command</button>
        </div>
    );
};
