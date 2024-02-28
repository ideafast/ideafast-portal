import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Table, Button, message, Spin, Modal, Space } from 'antd';
import { ContainerOutlined, CloseOutlined, DeleteOutlined } from '@ant-design/icons';
// Additional imports
import { PoweroffOutlined, PlayCircleOutlined } from '@ant-design/icons';

// import { instanceCreationTypes } from './instanceOptions';
import InstanceStatusIcon from '././lxd.Instance.statusIcon';
import CreateInstance from './lxd.instance.create';
import InstanceOverview from './lxd.insatnce.detail';
import { LXDCommandExecutor } from './lxd.instance.terminal';
import { LXDConsole } from './lxd.instance.console';
import css from './lxd.module.css';

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
        axios.get('/lxd')
            .then(async response => {
                const instances = response.data.data;
                // console.log(instances);

                // // New code to get network info for each instance
                // const networkInfoPromises = instances.map(res =>
                //     fetchInstanceState(res.name)
                // );
                // const networkInfoResponses = await Promise.all(networkInfoPromises);

                // console.log(networkInfoResponses);
                // // Merge the detailed instances with network info
                // const detailedInstances = instances.map((res, index) => ({
                //     ...res.data.metadata,
                //     network: networkInfoResponses[index], // This will add the network info to your instance data
                //     key: res.data.metadata.name // Assuming 'name' is unique for each instance
                // }));

                setInstances(instances.map((instance) => ({
                    ...instance,
                    key: instance.name
                })));
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
        // {
        //     title: 'Type',
        //     dataIndex: 'type',
        //     key: 'type',
        //     render: (text) => instanceCreationTypes.find(type => type.value === text)?.label || text
        // },
        // {
        //     title: 'Description',
        //     dataIndex: 'description',
        //     key: 'description'
        // },
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
                    <Button
                        onClick={() => connectToJupyter(record)}
                        disabled={record.status !== 'Running'} // Disable if the instance is not running
                        style={{ display: 'none' }}
                    >
                        Connect to Jupyter
                    </Button>
                    {/* <Button
                        onClick={() => handleOpenTerminal(record.name)}
                        disabled
                    // disabled={record.status !== 'Running'} // Disable if the instance is not running
                    >
                        Open Terminal
                    </Button> */}
                    <Button
                        onClick={() => handleOpenConsole(record.name)}
                        disabled={record.status !== 'Running' || record.type !== 'virtual-machine'} // Disable if the instance is not running
                    >
                        Open Console
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
                        icon={<DeleteOutlined />}
                        danger
                    >
                        Delete
                    </Button>
                    {/* Other actions can be added here */}
                </Space>
            )
        }
        // Add more columns as needed
    ];

    const handleOpenConsole = (instanceName) => {
        setSelectedInstanceName(instanceName);
        setSelectedTab('console');
        setIsModalVisible(true);
    };

    // const handleOpenTerminal = (instanceName) => {
    //     setSelectedInstanceName(instanceName);
    //     setSelectedTab('terminal');
    //     setIsModalVisible(true);
    // };


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
                onCancel={() => {
                    setIsModalVisible(false);
                    // TODO !!!
                    // Should be removed and use proper async traps
                    (window as any).hasSpice = false;
                }}
                // style={selectedTab !== 'overview' ? fullScreenModalStyle : { width: '800px' }}
                style={{
                    width: 'auto !important'
                }}
                className={css.modalOverrides}
                footer={null} // Hide footer when terminal is displayed
                closable={true} // Always allow closing the modal
                closeIcon={selectedTab !== 'overview' ? <CloseOutlined /> : undefined}
                destroyOnClose={true} // Destroy Terminal on close
            // forceRender // Pre-render Modal for immediate open
            >
                {selectedInstanceName && selectedTab === 'overview' && (
                    <InstanceOverview instanceName={selectedInstanceName} />
                )}
                {selectedInstanceName && selectedTab === 'terminal' && (
                    <LXDCommandExecutor instanceName={selectedInstanceName} />
                )}
                {selectedInstanceName && selectedTab === 'console' && (
                    <div style={{
                        height: '100%',
                        width: '100%'
                    }}>
                        <LXDConsole instanceName={selectedInstanceName} />
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default LXDInstanceList;
