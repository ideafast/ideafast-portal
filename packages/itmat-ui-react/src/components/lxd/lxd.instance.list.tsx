import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Table, Button, message, Spin ,Modal, Space} from 'antd';
import { ContainerOutlined, CloseOutlined } from '@ant-design/icons';
// Additional imports
import { PoweroffOutlined, PlayCircleOutlined } from '@ant-design/icons';

import { instanceCreationTypes } from './instanceOptions';
import InstanceStatusIcon from '././lxd.Instance.statusIcon';
import { COLUMN_WIDTHS } from './instanceTable';
import CreateInstance from './lxd.instance.create';
import InstanceOverview from './lxd.insatnce.detail';
import {LXDCommandExecutor} from './lxd.instance.terminal';

interface NetworkAddresses {
    family: string;
    address: string;
  }

interface NetworkInterface {
addresses: NetworkAddresses[];
}

interface NetworkData {
[interfaceName: string]: NetworkInterface;
}

interface LXDInstanceType {
    name: string;
    status: string;
    network: NetworkData;
    key: string;
}

// Add a new function to get the instance state which includes network info
const fetchInstanceState = async (name) => {
    try {
        const response = await axios.get(`http://localhost:3333/lxd/1.0/instances/${name}/state`);
        return response.data.metadata.network;
    } catch (error) {
        // Use a type assertion to tell TypeScript that error is of type Error
        const messageText = error instanceof Error ? error.message : 'An unknown error occurred';
        message.error('Failed to load instance state: ' + messageText);
    }
};

// Define the full-screen style for the terminal modal
const fullScreenModalStyle: React.CSSProperties = {
    position: 'absolute', // Use 'absolute' as a specific value instead of a string
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    margin: 0,
    padding: 0,
    overflow: 'hidden'
};

const LXDInstanceList = () => {
    const [instances, setInstances] = useState<LXDInstanceType[]>([]);
    const [loading, setLoading] = useState(true);
    const [creatingInstance, setCreatingInstance] = useState(false); // New state to toggle views
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [selectedInstanceName, setSelectedInstanceName] = useState(null);
    const [selectedTab, setSelectedTab] = useState('overview'); // new state for tab selection

    // Function to show the modal with the instance details
    const showInstanceDetails = (instanceName) => {
        setSelectedInstanceName(instanceName);
        setIsModalVisible(true);
    };


    useEffect(() => {
        axios.get('http://localhost:3333/lxd/1.0/instances')
            .then(async response => {
                const instanceUrls = response.data.metadata;
                const instanceDetailsPromises = instanceUrls.map(url =>
                    axios.get(url.replace('/1.0/instances/', 'http://localhost:3333/lxd/1.0/instances/'))
                );
                const instancesResponses = await Promise.all(instanceDetailsPromises);

                // New code to get network info for each instance
                const networkInfoPromises = instancesResponses.map(res =>
                    fetchInstanceState(res.data.metadata.name)
                );
                const networkInfoResponses = await Promise.all(networkInfoPromises);

                // Merge the detailed instances with network info
                const detailedInstances = instancesResponses.map((res, index) => ({
                    ...res.data.metadata,
                    network: networkInfoResponses[index], // This will add the network info to your instance data
                    key: res.data.metadata.name // Assuming 'name' is unique for each instance
                }));

                setInstances(detailedInstances);
                setLoading(false);
            })
            .catch(error => {
                const messageText = error instanceof Error ? error.message : 'An unknown error occurred';
                message.error('Failed to load instance state: ' + messageText);
                setLoading(false);
            });
    }, []);

    const handleCreateInstance = () => {
        // message.info('Create instance logic not implemented.');
        setCreatingInstance(true); // Set to true to show the create instance form
    };

    if (creatingInstance) {
        // Pass a callback function to toggle back to the list view
        return <CreateInstance onInstanceCreated={() => setCreatingInstance(false)} />;
    }

    //  extractIPv4 function to handle multiple network interfaces
    const extractIPv4 = (networkData: NetworkData): string[] => {
        const ipv4Addresses: string[] = [];
        // Check if networkData is defined and not null
        if (networkData) {
            // Iterate over all network interfaces
            Object.values(networkData).forEach(networkInterface => {
                // Ensure networkInterface and networkInterface.addresses are defined
                if (networkInterface && networkInterface.addresses) {
                    networkInterface.addresses.forEach(addr => {
                        if (addr.family === 'inet' && addr.address !== '127.0.0.1') { // inet is typically used for IPv4
                            ipv4Addresses.push(addr.address);
                        }
                    });
                }
            });
        }
        return ipv4Addresses;
    };

    // Function to start or stop an instance
    const startOrStopInstance = async (instanceName, action) => {
        try {
            await axios.put(`http://localhost:3333/api/lxd/instances/${instanceName}/action`, {
                action: action // 'start' or 'stop'
            });
            message.success(`Instance ${instanceName} ${action}ed`);
            refreshInstancesList(); // Refresh the instances list after the action
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'An unknown error occurred';
            message.error(`Failed to ${action} instance ${instanceName}: ${messageText}`);
        }
    };

    const deleteInstance = async (instanceName) => {
        try {
            await axios.delete(`http://localhost:3333/api/lxd/instances/${instanceName}`);
            message.success(`Instance ${instanceName} deleted`);
            refreshInstancesList(); // Refresh the instances list after the action
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'An unknown error occurred';
            message.error(`Failed to delete instance ${instanceName}: ${messageText}`);
        }
    };


    // Function to refresh the list of instances
    const refreshInstancesList = async () => {
        setLoading(true);
        try {
            const response = await axios.get('http://localhost:3333/lxd/1.0/instances');
            const instanceDetailsPromises = response.data.metadata.map(url =>
                axios.get(url.replace('/1.0/instances/', 'http://localhost:3333/lxd/1.0/instances/'))
            );
            const instancesResponses = await Promise.all(instanceDetailsPromises);

            const networkInfoPromises = instancesResponses.map(res =>
                fetchInstanceState(res.data.metadata.name)
            );
            const networkInfoResponses = await Promise.all(networkInfoPromises);

            const detailedInstances = instancesResponses.map((res, index) => ({
                ...res.data.metadata,
                network: networkInfoResponses[index],
                key: res.data.metadata.name
            }));

            setInstances(detailedInstances);
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'An unknown error occurred';
            message.error(`Failed to refresh instances: ${messageText}`);
        } finally {
            setLoading(false);
        }
    };

    // Function to handle the Connect to Jupyter button click
    const connectToJupyter = async (instance) => {
        try {
        // Construct the URL to include the instance name
        // Ensure this URL matches the route defined in your backend
            const url = `http://localhost:3333/api/connect-jupyter/${instance.name}`;

            // Make a GET request to your backend
            const response = await axios.get(url);

            // Open the Jupyter server in a new tab using the URL returned from the backend
            // The backend should return the full URL to access Jupyter, including the http:// prefix
            if (response.data.jupyterUrl) {
                window.open(response.data.jupyterUrl, '_blank');
            } else {
                throw new Error('Jupyter URL not provided by the backend.');
            }
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'An unknown error occurred';
            console.error(`Failed to connect to Jupyter: ${messageText}`);
            // Replace `message.error` with your frontend's method of showing errors, if necessary
            alert(`Failed to connect to Jupyter: ${messageText}`);
        }
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (text, record) => (
                <button
                    onClick={() => showInstanceDetails(record.name)}
                    style={{ color: 'blue', cursor: 'pointer', background: 'none', border: 'none', padding: 0, textDecoration: 'none' }}
                >
                    {text}
                </button>
            )
        },
        {
            title: 'Type',
            dataIndex: 'type',
            key: 'type',
            render: (text) => instanceCreationTypes.find(type => type.value === text)?.label || text
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description'
        },
        {
            title: 'IPv4',
            dataIndex: 'network',
            key: 'ipv4',
            render: (networkData: NetworkData) => extractIPv4(networkData).join(', ') || 'No IP',
            width: COLUMN_WIDTHS.IPV4
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status) => <InstanceStatusIcon status={status} />
        },
        {
            title: 'Connect to Jupyter',
            key: 'connectToJupyter',
            render: (_, record) => (
                record.status === 'Running' && (
                    <Button onClick={() => connectToJupyter(record)}>Connect to Jupyter</Button>
                )
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space size="middle">
                    <Button
                        type="link"
                        onClick={() => handleOpenTerminal(record.name)}
                        disabled={record.status !== 'Running'} // Disable if the instance is not running
                    >
                    Open Terminal
                    </Button>
                    <Button
                        type="link"
                        onClick={() => startOrStopInstance(record.name, 'start')}
                        icon={<PlayCircleOutlined />}
                        disabled={record.status === 'Running'}
                    >
                        Start
                    </Button>
                    <Button
                        type="link"
                        onClick={() => startOrStopInstance(record.name, 'stop')}
                        icon={<PoweroffOutlined />}
                        disabled={record.status !== 'Running'}
                    >
                        Stop
                    </Button>
                    <Button
                        type="link"
                        onClick={() => deleteInstance(record.name)}
                        icon={<CloseOutlined />}
                        disabled={record.status === 'Running'} // Optional: Disable if instance is running
                    >
                        Delete
                    </Button>
                    {/* Other actions can be added here */}
                </Space>
            )
        }
        // Add more columns as needed
    ];

    const handleOpenTerminal = (instanceName) => {
        setSelectedInstanceName(instanceName);
        setSelectedTab('terminal');
        setIsModalVisible(true);
    };


    return (
        <div>
            <Button type="primary" icon={<ContainerOutlined />} onClick={handleCreateInstance}>
            Create Instance
            </Button>
            {loading ? <Spin /> : <Table dataSource={instances} columns={columns} rowKey="key" />}
            <Modal
                title={`Instance ${selectedTab.charAt(0).toUpperCase() + selectedTab.slice(1)}`}
                open={isModalVisible}
                onOk={() => setIsModalVisible(false)}
                onCancel={() => setIsModalVisible(false)}
                style={selectedTab === 'terminal' ? fullScreenModalStyle : { width: '800px' }}
                footer={null} // Hide footer when terminal is displayed
                closable={true} // Always allow closing the modal
                closeIcon={selectedTab === 'terminal' ? <CloseOutlined /> : undefined}
                destroyOnClose={true} // Destroy Terminal on close
                forceRender // Pre-render Modal for immediate open
            >
                {selectedInstanceName && selectedTab === 'overview' && <InstanceOverview instanceName={selectedInstanceName} />}
                {selectedInstanceName && selectedTab === 'terminal' && (
                    <LXDCommandExecutor instanceName={selectedInstanceName} />
                )}
            </Modal>
        </div>
    );
};

export default LXDInstanceList;
