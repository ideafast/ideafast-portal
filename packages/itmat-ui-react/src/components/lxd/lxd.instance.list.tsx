import React, { useEffect, useState, useRef} from 'react';
import { Table, Button, message, Spin, Modal, Space, Form, InputNumber, Input } from 'antd';
import {  CloseOutlined, DeleteOutlined } from '@ant-design/icons';
// Additional imports
import { PoweroffOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { LXDInstanceType } from '@itmat-broker/itmat-types';

// import { instanceCreationTypes } from './instanceOptions';
import InstanceStatusIcon from '././lxd.Instance.statusIcon';
import { LXDConsole } from './lxd.instance.console';
import LXDTextConsole from './lxd.instance.text.console';
import { trpc } from '../../utils/trpc';
import css from './lxd.module.css';
import { formatCPUInfo, formatMemoryInfo, formatStorageInfo, formatGPUInfo} from './util/formatUtils';



const LXDInstanceList = () => {
    const [instances, setInstances] = useState<LXDInstanceType[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [selectedInstance, setSelectedInstance] = useState<LXDInstanceType | null>(null);
    const [selectedTab, setSelectedTab] = useState('overview'); // new state for tab selection
    const [isInstanceDetailsModalVisible, setIsInstanceDetailsModalVisible] = useState(false);

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

    const getInstances = trpc.lxd.getInstances.useQuery();
    const getResources = trpc.lxd.getResources.useQuery();

    const startStopInstance = trpc.lxd.startStopInstance.useMutation({
        onSuccess: () => {
            message.success('Operation successful');
            refreshInstancesList();
        },
        onError: (error) => {
            message.error(`Failed operation: ${error.message}`);
        }
    });

    const deleteInstance = trpc.lxd.deleteInstance.useMutation({
        onSuccess: () => {
            message.success('Instance deleted successfully');
            refreshInstancesList();
        },
        onError: (error) => {
            message.error(`Failed to delete instance: ${error.message}`);
        }
    });
    const handleStartStop = (instanceName: string , action: 'start' | 'stop') => {
        startStopInstance.mutate({ instanceName, action });
    };

    const handleDelete = (instanceName: string) => {
        deleteInstance.mutate({ instanceName });
    };


    const [systemStats, setSystemStats] = useState({
        cpu: '',
        memory: '',
        storage: '',
        gpu: ''

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

    const handleFullScreenRef = useRef(undefined);


    useEffect(() => {
        if (!getInstances.isLoading && getInstances.data) {
            const instancesList = getInstances.data.data as LXDInstanceType[];
            const formattedInstances = instancesList.map(instance => ({
                ...instance, // Spread all existing properties to cover all required fields
                key: instance.name // Add 'key' if it's additional and not already included in the instance object
            }));
            setInstances(formattedInstances);
            setLoading(false);
        }

        if (getInstances.isError) {
            message.error('Failed to load instance state: ' + getInstances.error.message);
            setLoading(false);
        }
    }, [getInstances.isLoading, getInstances.data, getInstances.isError, getInstances.error?.message]);


    useEffect(() => {
        if (!getResources.isLoading && getResources.data && getResources.data.data) {

            const data = getResources.data.data;
            setSystemStats({
                cpu: formatCPUInfo(data.cpu),
                memory: formatMemoryInfo(data.memory),
                storage: formatStorageInfo(data.storage),
                gpu: formatGPUInfo(data.gpu)
            });
        }

        if (getResources.isError) {
            message.error('Error fetching system information'); // getResources?.error?.message
        }
    }, [getResources.isLoading, getResources.data, getResources.isError]);

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
            dataIndex: 'username',
            key: 'username',
            render: text => <span>{text}</span>
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
                        onClick={() => handleStartStop(record.name, 'start')}
                        icon={<PlayCircleOutlined />}
                        disabled={record.status === 'Running'}
                    >
                        Start
                    </Button>
                    <Button
                        type="link"
                        onClick={() => handleStartStop(record.name, 'stop')}
                        icon={<PoweroffOutlined />}
                        disabled={record.status !== 'Running'}
                    >
                        Stop
                    </Button>
                    <Button
                        type="link"
                        onClick={() => handleDelete(record.name)}
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
        setSelectedInstance(instance);
        setSelectedTab('console');
        setIsModalVisible(true);
    };

    // TDDO:  Reset the connect signal when the modal is closed
    const handleCloseModal = () => {
        setIsModalVisible(false);
    };

    const handleUpdateInstanceConfig = async (values: { cpuLimit: number; memoryLimit: number; }) => {
        if (!editingInstance) return; // Guard clause in case no instance is selected

        try {
            await updateInstanceConfig.mutateAsync({
                instanceName: editingInstance.key,
                updates: {
                    cpuLimit: values.cpuLimit,
                    memoryLimit: `${values.memoryLimit}GB`
                }
            });

            setIsUpdateConfigModalOpen(false);

        } catch (error) {
            message.error(`Failed to update instance configuration: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    // onChildMount function to pass the handleFullScreen function to the child component
    const onChildMount = (childHandleFullScreen) => {
        handleFullScreenRef.current = childHandleFullScreen;
    };

    return (
        <div>

            <div className="system-stats">
                <h2>System Resources</h2>
                <p><strong>CPU:</strong> {systemStats.cpu}</p>
                <p><strong>Memory:</strong> {systemStats.memory}</p>
                <p><strong>Storage:</strong> {systemStats.storage}</p>
                <p><strong>GPU:</strong> {systemStats.gpu}</p>
            </div>
            {loading ? <Spin /> : <Table dataSource={instances} columns={columns} rowKey="key" />}
            <Modal
                title="Instance Details"
                open={isInstanceDetailsModalVisible}
                onCancel={() => setIsInstanceDetailsModalVisible(false)}
                footer={null}
            >
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
                title={`Instance ${selectedTab.charAt(0).toUpperCase() + selectedTab.slice(1) +': '+ selectedInstance?.name}`}
                open={isModalVisible}
                onOk={handleCloseModal}
                onCancel={handleCloseModal}
                style={{
                    width: 'auto !important'
                }}
                className={css.modalOverrides}
                footer={null}
                closable={true}
                closeIcon={selectedTab !== 'overview' ? <CloseOutlined /> : undefined}
                destroyOnClose={true} // Destroy Terminal on close
                forceRender // Pre-render Modal for immediate open
            >
                {selectedInstance && selectedTab === 'console' && (
                    <div className={css.consoleContainer}>
                        {/* {selectedInstance.type === 'container' ?
                            <LXDTextConsole
                                instanceName={selectedInstance.name}
                            /> : // Render LXDTextConsole for containers
                            <LXDConsole
                                instanceName={selectedInstance.name}
                            /> // Render LXDConsole for virtual machines
                        } */}
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
