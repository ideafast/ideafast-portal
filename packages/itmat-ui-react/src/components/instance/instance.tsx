import React, { FunctionComponent, useState} from 'react';
// import { Button, Table, message, Modal, Form, Select, InputNumber, Input } from 'antd';
import { Button, message, Modal, Form, Select, InputNumber, Card, Tag, Space } from 'antd';
import { trpc } from '../../utils/trpc';
import css from './instance.module.css';
import { enumAppType,enumInstanceType, enumInstanceStatus, IInstance } from '@itmat-broker/itmat-types';
import { LXDConsole } from '../lxd/lxd.instance.console';
import LXDTextConsole from '../lxd/lxd.instance.text.console';



const { Option } = Select;

type CreateInstanceFormValues = {
    name: string;
    type: 'virtual-machine' | 'container';
    appType: enumAppType;
    instanceType: enumInstanceType;
    lifeSpan: number;
    project: string;
    cpuLimit: number; // Added field for CPU limit
    memoryLimit: string; // Added field for memory limit (e.g., '3GB')
    token: string;
};


const instanceTypeConfig = {
    [enumInstanceType.SMALL]: { cpuLimit: 2, memoryLimit: '4GB' },
    [enumInstanceType.MIDDLE]: { cpuLimit: 4, memoryLimit: '8GB' },
    [enumInstanceType.LARGE]: { cpuLimit: 6, memoryLimit: '12GB' }
};



export const InstanceSection: FunctionComponent = () => {

    const [editForm] = Form.useForm();

    // Console
    const [consoleModalOpen, setConsoleModalOpen] = useState(false);
    const [selectedInstance, setSelectedInstance] = useState<IInstance | null>(null);

    const [connectSignal, setConnectSignal] = useState(false);

    const [selectedInstanceTypeDetails, setSelectedInstanceTypeDetails] = useState('');
    const [isConnectingToJupyter, setIsConnectingToJupyter] = useState(false); // New state for managing Jupyter connection attempts


    const handleConsoleConnect = (instance) => {
        setSelectedInstance(instance);
        setConsoleModalOpen(true);
        setConnectSignal(true);
    };

    const getInstances = trpc.instance.getInstances.useQuery(undefined, {
        refetchInterval: 60 * 1000
    });
    const createInstance = trpc.instance.createInstance.useMutation({
        onSuccess: () => {
            message.success('Instance created successfully.');
            getInstances.refetch();
        },
        onError: (error) => {
            message.error(`Failed to create instance: ${error.message}`);
        }
    });
    const deleteInstance = trpc.instance.deleteInstance.useMutation({
        onSuccess: () => {
            message.success('Instance deleted successfully.');
            getInstances.refetch();
        },
        onError: (error) => {
            message.error(`Failed to delete instance: ${error.message}`);
        }
    });
    const editInstance = trpc.instance.editInstance.useMutation({
        onSuccess: () => {
            message.success('Instance updated successfully.');
            getInstances.refetch();
        },
        onError: (error) => {
            message.error(`Failed to update instance: ${error.message}`);
        }
    });
    const startStopInstance = trpc.instance.startStopInstance.useMutation({
        onSuccess: () => {
            message.success('Instance state changed successfully.');
            getInstances.refetch();
        },
        onError: (error) => {
            message.error(`Failed to change instance state: ${error.message}`);
        }
    });


    // const getInstanceJupyterUrl = trpc.instance.getInstanceJupyterUrl.useMutation();
    // const getInstanceJupyterUrl = trpc.instance.getInstanceJupyterUrl.useMutation<JupyterUrlResponse>();

    // instance edit state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentInstance, setCurrentInstance] = useState<Partial<IInstance| null>>(null);

    const openEditModal = (instance: Partial<IInstance>) => {
        console.log('Opening edit modal with instance:', instance); // update the instance life span
        setCurrentInstance(instance);
        setIsEditModalOpen(true);
    };

    const [isModalOpen, setIsModalOpen] = useState(false);

    const [createForm] = Form.useForm<CreateInstanceFormValues>();

    // Define the initial form values including the default instanceType
    const initialFormValues: Partial<CreateInstanceFormValues> = {
        instanceType: enumInstanceType.SMALL
    };

    // Update the form on component mount to include the default instance type details
    useState(() => {
        const { cpuLimit, memoryLimit } = instanceTypeConfig[enumInstanceType.SMALL];
        setSelectedInstanceTypeDetails(`${cpuLimit} CPU, ${memoryLimit} memory`);
    });


    const handleCreateInstance = (values: CreateInstanceFormValues) => {
        const generatedName = `${values.appType}-${Date.now()}`;
        const determinedType = values.appType === enumAppType.MATLAB ? 'virtual-machine' : 'container';
        const { cpuLimit, memoryLimit } = instanceTypeConfig[values.instanceType];
        const defaultProject = 'default';
        createInstance.mutate({
            name: generatedName,
            type: determinedType,
            appType: values.appType,
            lifeSpan: values.lifeSpan,
            project: defaultProject,
            cpuLimit: cpuLimit,
            memoryLimit: memoryLimit

        });
        setIsModalOpen(false);
        createForm.resetFields();
    };

    const connectToJupyterHandler = async (instanceName: string) => {
        console.log('Connecting to Jupyter...', instanceName);
        setIsConnectingToJupyter(true); // Indicate that connection attempt is in progress

        try {
            const encodedInstanceName = encodeURIComponent(instanceName);
            const response = await fetch(`/lxd/instances/${encodedInstanceName}/jupyter`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to connect to Jupyter. Please try again.');
            }

            const data = await response.json(); // Assuming the server responds with JSON containing the Jupyter URL

            if (data && data.jupyterUrl) {
                console.log('Successfully connected to Jupyter:', data.jupyterUrl);
                window.open(data.jupyterUrl, '_blank');
            } else {
                console.error('Jupyter URL not found.');
                message.error('Jupyter URL not found.');
            }
        } catch (error: any) {
            console.error('Failed to connect to Jupyter:', error);
            message.error(error?.message || 'Failed to connect to Jupyter. Please try again.');
        } finally {
            setIsConnectingToJupyter(false); // Reset the connection attempt status
        }
    };

    const handleDeleteInstance = (instance) => {
        Modal.confirm({
            title: 'Are you sure to delete this instance?',
            content: `This will delete the instance "${instance.name}". This action cannot be undone.`,
            okText: 'Yes, delete it',
            okType: 'danger',
            cancelText: 'No, cancel',
            onOk: () => {
                deleteInstance.mutate({ instanceId: instance.id });
            }
        });
    };

    if (getInstances.isLoading) {
        return <div>Loading instances...</div>;
    }

    if (getInstances.isError) {
        return <div>Error loading instances: {getInstances.error.message}</div>;
    }

    const getStatusTagColor = (status: enumInstanceStatus) => {
        switch (status) {
            case enumInstanceStatus.PENDING:
                return 'gold';
            case enumInstanceStatus.RUNNING:
                return 'green';
            case enumInstanceStatus.STOPPING:
                return 'volcano';
            case enumInstanceStatus.STOPPED:
                return 'gray';
            case enumInstanceStatus.DELETED:
                return 'red';
            default:
                return 'default';
        }
    };


    const handleEditInstance = (values: { name?: string; lifeSpan?: number }) => {
        if (currentInstance && currentInstance.id) {
            const updates = {
                ...(values.lifeSpan && { lifeSpan: values.lifeSpan })
                // cpu and memory
            };

            editInstance.mutate({
                instanceId: currentInstance.id,
                updates
            });

            // Close the modal and reset the form after mutation
            setIsEditModalOpen(false);
            editForm.resetFields();
        } else {
            // Handle the undefined case, e.g., show an error message
            message.error('No instance selected for editing or instance ID is missing.');
        }
    };

    // Reset the connect signal when the modal is closed
    const handleCloseModal = () => {
        setConsoleModalOpen(false);
        setConnectSignal(false);
        // TODO !!!
        // Should be removed and use proper async traps
        (window as any).hasSpice = false;
    };

    // sorting function
    const sortedInstances = [...getInstances.data].sort((a, b) => {
        if (a.status === enumInstanceStatus.RUNNING && b.status !== enumInstanceStatus.RUNNING) {
            return -1; // a comes first
        }
        if (b.status === enumInstanceStatus.RUNNING && a.status !== enumInstanceStatus.RUNNING) {
            return 1; // b comes first
        }
        if (a.status === enumInstanceStatus.FAILED && b.status !== enumInstanceStatus.FAILED) {
            return 1; // b comes before a if a is FAILED and b is not
        }
        if (b.status === enumInstanceStatus.FAILED && a.status !== enumInstanceStatus.FAILED) {
            return -1; // a comes before b if b is FAILED and a is not
        }
        // Within the same status, sort by creation time, most recent first
        return new Date(b.createAt).getTime() - new Date(a.createAt).getTime();
    });


    return (
        <div className={css.page_container}>
            <div className={css.marginBottom}>
                <Button type="primary" onClick={() => setIsModalOpen(true)}>
            Create New Instance
                </Button>
            </div>
            {/* <Table dataSource={getInstances.data} columns={columns} rowKey="id" /> */}
            {sortedInstances.map((instance) => (
                <Card
                    key={instance.id}
                    headStyle={{ backgroundColor: getStatusTagColor(instance.status) }}
                    style={{ maxWidth: '600px', margin: '20px', overflow: 'auto' }}
                    title={<span>{instance.name}</span>}
                    extra={<Tag color={getStatusTagColor(instance.status)}>{instance.status}</Tag>}
                    className={css.cardContainer}
                >
                    <p>Username: {instance.username}</p>
                    <p>Application Type: {instance.appType}</p>
                    <p>Created At: {new Date(instance.createAt).toLocaleString()}</p>
                    <p>Life Span (hours): {Number(instance.lifeSpan).toFixed(2)}</p>
                    {/* Conditionally render Launch/Stop button based on status */}
                    <Space>
                        {instance.status === enumInstanceStatus.STOPPED && instance.lifeSpan > 0 && (
                            <Button type="primary" style={{ marginRight: '8px' }} onClick={() => startStopInstance.mutate({ instanceId: instance.id, action: 'start' })}>Launch</Button>
                        )}
                        {instance.status === enumInstanceStatus.RUNNING && (
                            <Button type="primary" danger style={{ marginRight: '8px' }} onClick={() => startStopInstance.mutate({ instanceId: instance.id, action: 'stop' })}>Stop</Button>
                        )}
                        {/* Only show Delete button for STOPPED status */}
                        {(instance.status === enumInstanceStatus.STOPPED || instance.status === enumInstanceStatus.FAILED) && (
                            <Button danger style={{ marginRight: '8px' }} onClick={() => handleDeleteInstance(instance)}>Delete</Button>
                        )}
                        {/* Modify button only for statuses where it makes sense */}
                        {/* {instance.status === enumInstanceStatus.RUNNING && (
                        <Button onClick={() => openEditModal(instance)}>Modify</Button>
                    )} */}
                        {/** console connection button, only show for RUNNING status */}
                        {instance.status === enumInstanceStatus.RUNNING && (
                            <Button style={{ marginRight: '8px' }} onClick={() => handleConsoleConnect(instance)}>Open Console</Button>
                        )}
                        {instance.appType === enumAppType.JUPYTER && instance.status === enumInstanceStatus.RUNNING && (
                            <Button
                                style={{ marginRight: '8px' }}
                                onClick={() => connectToJupyterHandler(instance.name)}
                                disabled={isConnectingToJupyter} // Disable button during connection attempt
                            >
                           Connect to Jupyter
                            </Button> )}
                    </Space>
                </Card>
            ))}
            <Modal title="Create New Instance" open={isModalOpen} onCancel={() => setIsModalOpen(false)} onOk={() => createForm.submit()}>
                <Form form={createForm}
                    layout="vertical"
                    onFinish={handleCreateInstance}
                    initialValues={initialFormValues}
                >
                    <Form.Item name="appType" label="Application Type" rules={[{ required: true, message: 'Please select the application type!' }]}>
                        <Select placeholder="Select an application type">
                            <Option value={enumAppType.JUPYTER}>Jupyter</Option>
                            <Option value={enumAppType.MATLAB}>MATLAB</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="lifeSpan"
                        label="Life Span (hours)"
                        initialValue={10} // Set the default value for lifeSpan
                        rules={[{ required: true, message: 'Please input the life span!' }]}>
                        <InputNumber min={1} max={100}/>
                    </Form.Item>
                    <Form.Item
                        name="instanceType"
                        label="Instance Type"
                        rules={[{ required: true, message: 'Please select the instance type!' }]}>
                        <Select
                            placeholder="Select an instance type"
                            onChange={(value) => {
                                const { cpuLimit, memoryLimit } = instanceTypeConfig[value];
                                setSelectedInstanceTypeDetails(`${cpuLimit} CPU, ${memoryLimit} memory`);
                            }}
                        >
                            <Option value={enumInstanceType.SMALL}>Small</Option>
                            <Option value={enumInstanceType.MIDDLE}>Middle</Option>
                            <Option value={enumInstanceType.LARGE}>Large</Option>
                        </Select>
                    </Form.Item>
                    {selectedInstanceTypeDetails && (
                        <div style={{ marginTop: '10px' }}>{selectedInstanceTypeDetails}</div>
                    )}
                </Form>
            </Modal>
            <Modal
                title="Edit Instance"
                open={isEditModalOpen}
                onCancel={() => setIsEditModalOpen(false)}
                onOk={() => editForm.submit()}
            >
                <Form
                    form={editForm}
                    layout="vertical"
                    initialValues={{ ...currentInstance }}
                    onFinish={handleEditInstance}
                >
                    <Form.Item
                        name="lifeSpan"
                        label="Life Span (hours)"
                        rules={[{ required: true, message: 'Please input the life span!' }]}
                    >
                        <InputNumber min={1} />
                    </Form.Item>
                </Form>
            </Modal>
            <Modal
                className='console-modal'
                title={`Console - ${selectedInstance?.name}`}
                open={consoleModalOpen}
                onOk={handleCloseModal}
                onCancel={handleCloseModal}
                width="100%"
                // height="100%"
                // style={{ top: 0, paddingBottom: 0, height: '100vh' }}
                style={{
                    width: 'auto !important',
                    height: 'auto !important'
                }}
                bodyStyle={{ height: 'calc(100vh - 110px)', overflowY: 'auto' }}
            >
                {selectedInstance && selectedInstance.name && (selectedInstance.type === 'container' ? (
                    <LXDTextConsole
                        instanceName={selectedInstance.name}
                        connectSignal={connectSignal}
                        onConnectionClose={() => setConnectSignal(false)}
                    />
                ) : (
                    <LXDConsole
                        instanceName={selectedInstance.name}
                    /> ))}
            </Modal>

        </div>
    );
};