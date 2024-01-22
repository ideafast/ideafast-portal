import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Table, Button, message, Spin ,Modal, Space} from 'antd';
import { ContainerOutlined, CloseOutlined } from '@ant-design/icons';
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

interface NetworkData {
    eth0: {
      addresses: NetworkAddresses[];
    };
  }

interface LXDInstanceType {
    // Define properties of your instance type
    name: string;
    status: string;
    // ... other properties
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
                // message.error('Failed to load instances: ' + error.message);
                // Use a type assertion to tell TypeScript that error is of type Error
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

    const extractIPv4 = (networkData: NetworkData) => {
        const ipv4Addresses: string[] = [];
        if (networkData?.eth0?.addresses) {
            for (const addr of networkData.eth0.addresses) {
                if (addr.family === 'inet') { // inet is typically used for IPv4
                    ipv4Addresses.push(addr.address);
                }
            }
        }
        return ipv4Addresses;
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
            // You might need to transform the 'type' if it's not directly available
            render: (text) => instanceCreationTypes.find(type => type.value === text)?.label || text
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description'
            // Make sure 'description' is included in the data you fetch
        },
        {
            title: 'IPv4',
            dataIndex: 'network', // Adjust the 'dataIndex' if your network data is stored differently
            key: 'ipv4',
            render: (networkData) => extractIPv4(networkData).join(', ') || 'No IP',
            width: COLUMN_WIDTHS.IPV4 // You can set the width of the column as defined in your constants
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status) => <InstanceStatusIcon status={status} />
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space size="middle">
                    <Button type="link" onClick={() => handleOpenTerminal(record.name)}>
                  Open Terminal
                    </Button>
                    {/* Other actions can be added here */}
                </Space>
            )
        }
        // Add more columns as needed
    ];

    // When opening the terminal, set a state to manage whether it should take up the full page
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
