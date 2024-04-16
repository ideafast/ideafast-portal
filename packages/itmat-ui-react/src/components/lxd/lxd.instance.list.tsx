import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Table, Button, message, Spin, Modal, Space, Form, InputNumber, Input } from 'antd';
import {  CloseOutlined, DeleteOutlined } from '@ant-design/icons';
// Additional imports
import { PoweroffOutlined, PlayCircleOutlined } from '@ant-design/icons';

// import { instanceCreationTypes } from './instanceOptions';
import InstanceStatusIcon from '././lxd.Instance.statusIcon';
import CreateInstance from './lxd.instance.create';
import { LXDConsole } from './lxd.instance.console';
import LXDTextConsole from './lxd.instance.text.console';
import { trpc } from '../../utils/trpc';
import css from './lxd.module.css';

interface LXDInstanceType {
    name: string;
    description: string;
    status: string;
    statusCode: number;
    profiles: string[];
    type: 'container' | 'virtual-machine';
    architecture: string;
    creationDate: string;
    lastUsedDate: string;
    username: string;
    cpuLimit: string;
    memoryLimit: string;
    key: string;
}

const LXDInstanceList = () => {
    const [instances, setInstances] = useState<LXDInstanceType[]>([]);
    const [loading, setLoading] = useState(true);
    const [creatingInstance, setCreatingInstance] = useState(false); // New state to toggle views
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [selectedInstance, setSelectedInstance] = useState<LXDInstanceType | null>(null);
    const [selectedTab, setSelectedTab] = useState('overview'); // new state for tab selection
    const [isInstanceDetailsModalVisible, setIsInstanceDetailsModalVisible] = useState(false);
    // state for console connection
    const [connectSignal, setConnectSignal] = useState(false);

    const [isUpdateConfigModalOpen, setIsUpdateConfigModalOpen] = useState(false);
    const [editingInstance, setEditingInstance] = useState<LXDInstanceType | null>(null);

    const [updateConfigForm] = Form.useForm();
    const updateInstanceConfig = trpc.instance.editInstance.useMutation({
        onSuccess: () => {
            message.success('Instance configuration updated successfully.');
        },
        onError: (error) => {
            message.error(`Failed to update instance configuration: ${error.message}`);
        }
    });

    const [systemStats, setSystemStats] = useState({
        cpu: '',
        memory: '',
        storage: '',
        gpu: '',
        network: '',
        pci: ''
    });

    const openUpdateConfigModal = (instance: LXDInstanceType) => {
        setEditingInstance(instance);
        setIsUpdateConfigModalOpen(true);
    };

    // Function to show the modal with the instance details
    const showInstanceDetails = (instance: LXDInstanceType) => {
        setSelectedInstance(instance);
        setIsInstanceDetailsModalVisible(true);
    };


    useEffect(() => {
        axios.get('/lxd')
            .then(async response => {
                const instances = response.data.data;

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

    useEffect(() => {
        axios.get('/lxd/resources')
            .then(response => {
                const { data } = response.data; // Adjust according to the actual response structure
                setSystemStats({
                    cpu: data.cpu,
                    memory: data.memory,
                    storage: data.storage,
                    gpu: data.gpu,
                    network: data.network,
                    pci: data.pci
                });
            })
            .catch(error => {
                console.error('Error fetching system information:', error);
            });
    }, []);


    if (creatingInstance) {
        // Pass a callback function to toggle back to the list view
        return <CreateInstance onInstanceCreated={() => setCreatingInstance(false)} />;
    }

    // Function to start or stop an instance
    const startOrStopInstance = async (instanceName, action) => {
        try {
            await axios.put(`/lxd/instances/${instanceName}/action`, {
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
            await axios.delete(`/lxd/instances/${instanceName}`);
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

    const columns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (text, record) => (
                <button
                    onClick={() => showInstanceDetails(record)}
                    style={{ color: 'blue', cursor: 'pointer', background: 'none', border: 'none', padding: 0, textDecoration: 'none' }}
                >
                    {text}
                </button>
            )
        },

        // username
        {
            title: 'Username',
            dataIndex: 'username', // Use the dataIndex that matches what you set in the state
            key: 'username',
            render: text => <span>{text}</span> // Basic rendering, can be customized
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
                    <Button
                        onClick={() => handleOpenConsole(record)}
                        disabled={record.status !== 'Running'} // Disable if the instance is not running
                    >
                        Open Console
                    </Button>
                    <Button
                        onClick={() => openUpdateConfigModal(record)}
                        disabled={record.type === 'virtual-machine' && record.status === 'Running'}
                    >Update Config</Button>
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

    const handleOpenConsole = (instance: LXDInstanceType) => {
        console.log('handleOpenConsole', instance.name);
        setSelectedInstance(instance);
        setSelectedTab('console');
        setIsModalVisible(true);
        // setConnectSignal(prevSignal => !prevSignal);
        setConnectSignal(true);
    };

    // Reset the connect signal when the modal is closed
    const handleCloseModal = () => {
        setIsModalVisible(false);
        setConnectSignal(false);
        // TODO !!!
        // Should be removed and use proper async traps
        (window as any).hasSpice = false;
    };

    const handleUpdateInstanceConfig = async (values: { cpuLimit: number; memoryLimit: number; }) => {
        if (!editingInstance) return; // Guard clause in case no instance is selected

        try {
            // Assuming your tRPC hook is named `updateInstanceConfig`
            await updateInstanceConfig.mutateAsync({
                instanceName: editingInstance.key, // Make sure this matches the actual ID field of your instance object
                updates: {
                    cpuLimit: values.cpuLimit,
                    memoryLimit: `${values.memoryLimit}GB`
                }
            });

            setIsUpdateConfigModalOpen(false); // Close modal on success
            // Optionally refresh instance list or update local state
        } catch (error) {
            message.error(`Failed to update instance configuration: ${error instanceof Error ? error.message : String(error)}`);
        }
    };


    return (
        <div>
            {/* <Button type="primary" icon={<ContainerOutlined />} onClick={handleCreateInstance}>
                Create Instance
            </Button> */}
            <div className="system-stats">
                <h2>System Resources</h2>
                <p><strong>CPU:</strong> {systemStats.cpu}</p>
                <p><strong>Memory:</strong> {systemStats.memory}</p>
                <p><strong>Storage:</strong> {systemStats.storage}</p>
                <p><strong>GPU:</strong> {systemStats.gpu}</p>
                {/* <p><strong>Network:</strong> {systemStats.network}</p> */}
                {/* <p><strong>PCI:</strong> {systemStats.pci}</p> */}
            </div>
            {loading ? <Spin /> : <Table dataSource={instances} columns={columns} rowKey="key" />}
            <Modal
                title="Instance Details"
                open={isInstanceDetailsModalVisible}
                onCancel={() => setIsInstanceDetailsModalVisible(false)}
                footer={null} // If you don't need a footer
            >
                {/* Render the details of the selectedInstance here */}
                {selectedInstance && (
                    <div>
                        <p><strong>Name:</strong> {selectedInstance.name}</p>
                        <p><strong>Status:</strong> {selectedInstance.status}</p>
                        <p><strong>Type:</strong> {selectedInstance.type}</p>
                        <p><strong>Architecture:</strong> {selectedInstance.architecture}</p>
                        <p><strong>Creation Date:</strong> {selectedInstance.creationDate}</p>
                        <p><strong>Last Used Date:</strong> {selectedInstance.lastUsedDate}</p>
                        <p><strong>Username:</strong> {selectedInstance.username}</p>
                        <p><strong>CPU Limit:</strong> {selectedInstance.cpuLimit}</p>
                        <p><strong>Memory Limit:</strong> {selectedInstance.memoryLimit}</p>
                        <p><strong>Profiles:</strong> {selectedInstance.profiles?.join(', ')}</p>
                    </div>
                )}
            </Modal>

            <Modal
                // className='console-modal'
                title={`Instance ${selectedTab.charAt(0).toUpperCase() + selectedTab.slice(1) +': '+ selectedInstance?.name}`}
                open={isModalVisible}
                onOk={handleCloseModal}
                onCancel={handleCloseModal}
                // style={selectedTab !== 'overview' ? fullScreenModalStyle : { width: '800px' }}
                style={{
                    width: 'auto !important',
                    height: 'auto !important'
                }}
                bodyStyle={{ height: 'calc(100vh - 110px)', overflowY: 'auto' }}
                className={css.modalOverrides}
                footer={null} // Hide footer when terminal is displayed
                closable={true} // Always allow closing the modal
                closeIcon={selectedTab !== 'overview' ? <CloseOutlined /> : undefined}
                destroyOnClose={true} // Destroy Terminal on close
                forceRender // Pre-render Modal for immediate open
            >
                {selectedInstance && selectedTab === 'console' && (
                    <div className={css.consoleContainer}>
                        {selectedInstance.type === 'container' ?
                            <LXDTextConsole
                                instanceName={selectedInstance.name}
                                connectSignal={connectSignal}
                                onConnectionClose={() => setConnectSignal(false)}
                            /> : // Render LXDTextConsole for containers
                            <LXDConsole instanceName={selectedInstance.name} /> // Render LXDConsole for virtual machines
                        }
                    </div>
                )}

            </Modal>
            <Modal
                title="Update Instance Configuration"
                open={isUpdateConfigModalOpen}
                onCancel={() => setIsUpdateConfigModalOpen(false)}
                onOk={() => updateConfigForm.submit()}
            >
                <Form
                    form={updateConfigForm}
                    layout="vertical"
                    onFinish={handleUpdateInstanceConfig}
                >
                    {/* CPU and Memory Form Items */}
                    <Form.Item name="cpuLimit" label="CPU Limit (Cores)" rules={[{ required: true, message: 'Please input the CPU limit!' }]}>
                        <InputNumber min={1} max={10} />
                    </Form.Item>
                    <Form.Item
                        name="memoryLimit"
                        label="Memory Limit"
                        rules={[
                            { required: true, message: 'Please input the memory limit!' },
                            // Custom validator to check if the InputNumber has a value
                            ({ getFieldValue }) => ({
                                validator() {
                                    if (typeof getFieldValue('memoryLimit') === 'number') {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error('Please input the memory limit!'));
                                }
                            })
                        ]}
                    >
                        <Input.Group compact>
                            <Form.Item
                                noStyle
                                name="memoryLimit"
                                rules={[{ required: true, message: 'Please input the memory limit!' }]}
                            >
                                <InputNumber min={1} max={64} style={{ width: 'calc(100% - 50px)' }} />
                            </Form.Item>
                            <Input style={{ width: '50px' }} defaultValue="GB" disabled />
                        </Input.Group>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default LXDInstanceList;
