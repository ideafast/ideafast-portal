import React, { useEffect, useRef, useState} from 'react';
import { Table, Button, message, Spin, Modal, Space, Form, InputNumber, Input } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
// Additional imports
import { PoweroffOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { LXDInstanceType, enumOpeType} from '@itmat-broker/itmat-types';

// import { instanceCreationTypes } from './instanceOptions';
import InstanceStatusIcon from '././lxd.Instance.statusIcon';
import { LXDConsole, LXDConsoleRef} from './lxd.instance.console';
import {LXDTextConsole, LXDTextConsoleRef} from './lxd.instance.text.console';
import { trpc } from '../../utils/trpc';
import css from './lxd.module.css';
import { formatCPUInfo, formatMemoryInfo, formatStorageInfo, formatGPUInfo} from './util/formatUtils';



const LXDInstanceList = () => {
    const [instances, setInstances] = useState<LXDInstanceType[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [selectedInstance, setSelectedInstance] = useState<LXDInstanceType | null>(null);
    const [isInstanceDetailsModalVisible, setIsInstanceDetailsModalVisible] = useState(false);

    const [isUpdateConfigModalOpen, setIsUpdateConfigModalOpen] = useState(false);
    const [editingInstance, setEditingInstance] = useState<LXDInstanceType | null>(null);

    const [updateConfigForm] = Form.useForm();

    const [systemStats, setSystemStats] = useState({
        cpu: '',
        memory: '',
        storage: '',
        gpu: ''

    });

    const [isFullscreen, setIsFullscreen] = useState(false); // <-- Manage fullscreen state

    // const handleFullScreenRef = useRef<LXDConsoleRef>(null);
    const handleFullScreenRef = useRef<LXDConsoleRef | LXDTextConsoleRef>(null);
    const updateInstanceConfig = trpc.instance.editInstance.useMutation({
        onSuccess: () => {
            void message.success('Instance configuration updated successfully.');
        },
        onError: (error) => {
            void message.error(`Failed to update instance configuration: ${error.message}`);
        }
    });

    const getInstances = trpc.lxd.getInstances.useQuery(undefined, {
        refetchInterval: 60 * 1000 // Refetch every 60 seconds
    });
    const getResources = trpc.lxd.getResources.useQuery();


    // Function to refresh the list of instances
    const refreshInstancesList = async () => {
        try {
            await getInstances.refetch();
        } catch (error) {
            console.error('Failed to refresh instances list:', error);
        }
    };

    const startStopInstance = trpc.lxd.startStopInstance.useMutation({
        onSuccess: async () => {
            void message.success('Operation successful');
            await refreshInstancesList();
        },
        onError: (error) => {
            void message.error(`Failed operation: ${error.message}`);
        }
    });

    const deleteInstance = trpc.lxd.deleteInstance.useMutation({
        onSuccess: async () => {
            void message.success('Instance deleted successfully');
            await refreshInstancesList();
        },
        onError: (error) => {
            void message.error(`Failed to delete instance: ${error.message}`);
        }
    });
    const handleStartStop = (instanceName: string , action: enumOpeType.START | enumOpeType.STOP) => {
        startStopInstance.mutate({ instanceName, action });
    };

    const handleDelete = (instanceName: string) => {
        deleteInstance.mutate({ instanceName });
    };
    const enterFullScreen = () => {
        if (handleFullScreenRef.current) {
            handleFullScreenRef.current.handleFullScreen();
            setIsFullscreen(true); // Set fullscreen state
        }
    };


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
            void message.error('Failed to load instance state: ' + getInstances.error.message);
            setLoading(false);
        }
    }, [getInstances.isLoading, getInstances.data, getInstances.isError, getInstances.error?.message]);


    useEffect(() => {
        if (!getResources.isLoading && getResources.data && typeof getResources.data.data !== 'string') {

            const data = getResources.data.data;
            setSystemStats({
                cpu: formatCPUInfo(data.cpu),
                memory: formatMemoryInfo(data.memory),
                storage: formatStorageInfo(data.storage),
                gpu: formatGPUInfo(data.gpu)
            });
        }

        if (getResources.isError) {
            void message.error('Error fetching system information'); // getResources?.error?.message
        }
    }, [getResources.isLoading, getResources.data, getResources.isError]);


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
                        type="primary"
                        style={{ backgroundColor: '#1890ff', borderColor: '#1890ff', marginRight: '8px' }}
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
                        onClick={() => handleStartStop(record.name, enumOpeType.START)}
                        icon={<PlayCircleOutlined />}
                        disabled={record.status === 'Running'}
                    >
                        Start
                    </Button>
                    <Button
                        type="link"
                        onClick={() => handleStartStop(record.name, enumOpeType.STOP)}
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
        setIsModalVisible(true);
    };

    // TDDO:  Reset the connect signal when the modal is closed
    const handleCloseModal = () => {
        setIsModalVisible(false);
        setIsFullscreen(false); // Reset fullscreen state when modal is closed
    };

    const handleUpdateInstanceConfig = async (values: { cpuLimit: number; memoryLimit: number; }) => {
        if (!editingInstance) return; // Guard clause in case no instance is selected

        try {
            await updateInstanceConfig.mutateAsync({
                instanceName: editingInstance.key,
                updates: {
                    cpuLimit: values.cpuLimit,
                    memoryLimit: `${values.memoryLimit}GB`
                },
                instanceId: ''
            });

            setIsUpdateConfigModalOpen(false);

        } catch (error) {
            void message.error(`Failed to update instance configuration: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    // onChildMount function to pass the handleFullScreen function to the child component
    // const onChildMount = (childHandleFullScreen) => {
    //     handleFullScreenRef.current = childHandleFullScreen;
    // };

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
                className={css['console-modal']}
                title={`Console - ${selectedInstance?.name}`}
                open={isModalVisible}
                onCancel={handleCloseModal}
                width="100%"
                // styles={{ body: { height: 'calc(100vh - 110px)', overflowY: 'auto' } }}
                styles={{ body: { height: isFullscreen ? '100vh' : 'calc(100vh - 110px)', overflowY: 'hidden' } }}
                footer={[
                    <Button key="back" onClick={handleCloseModal}>
      Cancel
                    </Button>,
                    <Button key="fullScreen" type="primary" onClick={enterFullScreen}>
      Fullscreen
                    </Button>
                ]}
            >
                {selectedInstance?.name && (selectedInstance.type === 'container' ? (
                    <LXDTextConsole
                        ref = {handleFullScreenRef}
                        instanceName={selectedInstance.name}
                    />
                ) : (
                    <LXDConsole
                        ref={handleFullScreenRef}
                        instanceName={selectedInstance.name}
                    />
                ))}
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
                    onFinish={(values) => {
                        void handleUpdateInstanceConfig(values);
                    }}
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
                                async validator() {
                                    if (typeof getFieldValue('memoryLimit') === 'number') {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error('Please input the memory limit!'));
                                }
                            })
                        ]}
                    >
                        <Space.Compact>
                            <Form.Item
                                noStyle
                                name="memoryLimit"
                                rules={[{ required: true, message: 'Please input the memory limit!' }]}
                            >
                                <InputNumber min={1} max={64} style={{ width: 'calc(100% - 50px)' }} />
                            </Form.Item>
                            <Input style={{ width: '50px' }} defaultValue="GB" disabled />
                        </Space.Compact>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default LXDInstanceList;
