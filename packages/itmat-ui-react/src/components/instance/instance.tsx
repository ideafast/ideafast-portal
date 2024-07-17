import React, { FunctionComponent, useState,useRef} from 'react';
import { Button, message, Modal, Form, Select,  Card, Tag, Progress,  Space, Row, Col } from 'antd';
import { trpc } from '../../utils/trpc';
import css from './instance.module.css';
import { enumAppType,enumInstanceType, enumInstanceStatus, IInstance} from '@itmat-broker/itmat-types';
import { LXDConsole , LXDConsoleRef} from '../lxd/lxd.instance.console';
import LXDTextConsole from '../lxd/lxd.instance.text.console';


const { Option } = Select;

type CreateInstanceFormValues = {
    name: string;
    type: 'virtual-machine' | 'container';
    appType: enumAppType;
    instanceType: enumInstanceType;
    lifeSpan: number;
    project: string;
    cpuLimit: number;
    memoryLimit: string;
    token: string;
};


const instanceTypeConfig = {
    [enumInstanceType.SMALL]: { cpuLimit: 4, memoryLimit: '8GB' },
    [enumInstanceType.MIDDLE]: { cpuLimit: 8, memoryLimit: '16GB' },
    [enumInstanceType.LARGE]: { cpuLimit: 12, memoryLimit: '24GB' }
};



export const InstanceSection: FunctionComponent = () => {

    const [consoleModalOpen, setConsoleModalOpen] = useState(false);
    const [selectedInstance, setSelectedInstance] = useState<IInstance | null>(null);

    const [selectedInstanceTypeDetails, setSelectedInstanceTypeDetails] = useState('');
    const [isConnectingToJupyter, setIsConnectingToJupyter] = useState(false);

    const handleFullScreenRef = useRef<LXDConsoleRef>(null);

    const handleConsoleConnect = (instance) => {
        setSelectedInstance(instance);
        setConsoleModalOpen(true);
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
    const startStopInstance = trpc.instance.startStopInstance.useMutation({
        onSuccess: () => {
            message.success('Instance state changed successfully.');
            getInstances.refetch();
        },
        onError: (error) => {
            message.error(`Failed to change instance state: ${error.message}`);
        }
    });
    const restartInstance = trpc.instance.restartInstance.useMutation({
        onSuccess: () => {
            message.success('Instance restarted successfully.');
            getInstances.refetch(); // Optionally refetch the instances to update the list
        },
        onError: (error) => {
            message.error(`Failed to restart instance: ${error.message}`);
        }
    });

    const [isModalOpen, setIsModalOpen] = useState(false);

    const [createForm] = Form.useForm<CreateInstanceFormValues>();

    // Define the initial form values including the default instanceType
    const initialFormValues: Partial<CreateInstanceFormValues> = {
        instanceType: enumInstanceType.SMALL,
        lifeSpan: 360
    };

    // Update the form on component mount to include the default instance type details
    useState(() => {
        const { cpuLimit, memoryLimit } = instanceTypeConfig[enumInstanceType.SMALL];
        setSelectedInstanceTypeDetails(`${cpuLimit} CPU, ${memoryLimit} memory`);
    });


    const handleCreateInstance = (values: CreateInstanceFormValues) => {

        const effectiveLifeSpan = values.lifeSpan || 360;
        const generatedName = `${values.appType}-${Date.now()}`;
        const determinedType = values.appType === enumAppType.MATLAB ? 'virtual-machine' : 'container';
        const { cpuLimit, memoryLimit } = instanceTypeConfig[values.instanceType];
        const defaultProject = 'default';
        createInstance.mutate({
            name: generatedName,
            type: determinedType,
            appType: values.appType,
            lifeSpan: effectiveLifeSpan,
            project: defaultProject,
            cpuLimit: cpuLimit,
            memoryLimit: memoryLimit
        });
        setIsModalOpen(false);
        createForm.resetFields();
    };

    const handleRestartInstance = async (values: { instance_id: string, lifeSpan: number }) => {
        restartInstance.mutate({
            instanceId:values.instance_id,
            lifeSpan: values.lifeSpan
        });

    };

    const connectToJupyterHandler = async (instanceName: string) => {
        setIsConnectingToJupyter(true); // Indicate that connection attempt is in progress

        try {
            // Construct the Jupyter proxy URL directly
            const baseUrl = new URL(window.location.href);
            console.log('baseUrl', baseUrl.href);
            // const jupyterProxyUrl = `${baseUrl.origin}/jupyter/${instanceName}`;
            baseUrl.pathname = '/jupyter';
            const jupyterProxyUrl = `http://localhost:3333/jupyter/${instanceName}`;
            // const jupyterProxyUrl = `${baseUrl.href}/${instanceName}`;
            console.log(jupyterProxyUrl);

            // Open the Jupyter service in a new tab
            window.open(jupyterProxyUrl, '_blank');
        } catch (error: any) {
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
                return '#ffecb3';
            case enumInstanceStatus.RUNNING:
                return '#87d068';
            case enumInstanceStatus.STOPPING:
                return '#ffd8bf';
            case enumInstanceStatus.STOPPED:
                return '#d9d9d9';
            case enumInstanceStatus.DELETED:
                return '#f50';
            default:
                return 'default';
        }
    };
    const enterFullScreen = () => {
        if (handleFullScreenRef.current) {
            handleFullScreenRef.current.handleFullScreen();
        }
    };

    // Reset the connect signal when the modal is closed
    const handleCloseModal = () => {
        setConsoleModalOpen(false);
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
                <Button type="primary" style={{ backgroundColor: '#108ee9', borderColor: '#108ee9', marginRight: '8px' }} onClick={() => setIsModalOpen(true)}>
            Create New Instance
                </Button>
            </div>
            {sortedInstances.map((instance) => (
                <Card
                    key={instance.id}
                    headStyle={{ backgroundColor: getStatusTagColor(instance.status) }}
                    style={{ maxWidth: '600px', margin: '20px', overflow: 'auto' }}
                    title={<span>{instance.name}</span>}
                    extra={<Tag color={getStatusTagColor(instance.status)}>{instance.status}</Tag>}
                    className={css.cardContainer}
                >
                    <Row>
                        <Col span={16}>
                            <p>Application Type: {instance.appType}</p>
                            <p>Created At: {new Date(instance.createAt).toLocaleString()}</p>
                            <p>Life Span: <strong>{Number(instance.lifeSpan).toFixed(2)}</strong> (hours)</p>
                            <p>CPU: {instance.config && instance.config['limits.cpu']} Cores, Memory: {instance.config && instance.config['limits.memory']}</p>
                        </Col>
                        <Col span={8}>
                            {instance.status === enumInstanceStatus.RUNNING && (
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    <Progress
                                        percent={('cpuUsage' in instance.metadata) ? instance.metadata.cpuUsage as number : 0}
                                        status="active"
                                        format={() => (
                                            <span style={{ fontSize: '12px' }}>
                                            CPU: {('cpuUsage' in instance.metadata) ? instance.metadata.cpuUsage as number : 0}%
                                            </span>
                                        )}
                                        strokeWidth={15} // Adjust thickness
                                        style={{ width: '150px' }} // Adjust width
                                    />
                                    <Progress
                                        percent={('memoryUsage' in instance.metadata) ? instance.metadata.memoryUsage as number : 0}
                                        status="active"
                                        format={() => (
                                            <span style={{ fontSize: '12px' }}>
                                            Memory: {('memoryUsage' in instance.metadata) ? Math.round(instance.metadata.memoryUsage as number) : 0}%
                                            </span>
                                        )}
                                        strokeWidth={15} // Adjust thickness
                                        style={{ width: '150px' }} // Adjust width
                                    />
                                </Space>
                            )}
                        </Col>
                    </Row>
                    {/* Conditionally render Launch/Stop button based on status */}
                    <Space>
                        {instance.status === enumInstanceStatus.STOPPED && instance.lifeSpan > 0 && (
                            <Button type="primary" style={{ backgroundColor: '#87d068', borderColor: '#87d068', marginRight: '8px' }} onClick={() => startStopInstance.mutate({ instanceId: instance.id, action: 'start' })}>Launch</Button>
                        )}
                        {instance.status === enumInstanceStatus.RUNNING && (
                            // change the danger to warning color
                            <Button type="primary" danger style={{ backgroundColor: '#ffe7ba', borderColor: '#ffd591', color: '#fa8c16', marginRight: '8px' }}  onClick={() => startStopInstance.mutate({ instanceId: instance.id, action: 'stop' })}>Stop</Button>
                            // <Button type="primary" danger style={{ marginRight: '8px' }} onClick={() => startStopInstance.mutate({ instanceId: instance.id, action: 'stop' })}>Stop</Button>
                        )}
                        {/* Only show Delete button for STOPPED status */}
                        {(instance.status === enumInstanceStatus.STOPPED || instance.status === enumInstanceStatus.FAILED) && (
                            <Button type="primary" danger style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', marginRight: '8px' }} onClick={() => handleDeleteInstance(instance)}>Delete</Button>
                        )}
                        {/*Restart button to reset the instance with new lifespan */}
                        {instance.status === enumInstanceStatus.STOPPED && instance.lifeSpan <= 0 && (
                            <Button type="primary" style={{ backgroundColor: '#2db7f5', borderColor: '#2db7f5', marginRight: '8px' }} onClick={() => handleRestartInstance({instance_id: instance.id, lifeSpan: 360})}>Restart</Button>
                        )}
                        {/** console connection button, only show for RUNNING status */}
                        {instance.appType !== enumAppType.JUPYTER && instance.status === enumInstanceStatus.RUNNING &&  (
                            // set the button color to green
                            <Button type="primary" style={{ backgroundColor: '#108ee9', borderColor: '#108ee9', marginRight: '8px' }} onClick={() => handleConsoleConnect(instance)}>Open Console</Button>
                        )}
                        {instance.appType === enumAppType.JUPYTER && instance.status === enumInstanceStatus.RUNNING && (
                            <Button
                                style={{ backgroundColor: '#108ee9', borderColor: '#108ee9', marginRight: '8px' }}
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
                className='console-modal'
                title={`Console - ${selectedInstance?.name}`}
                open={consoleModalOpen}
                onCancel={handleCloseModal}
                width="100%"
                style={{
                    width: 'auto !important',
                    height: 'auto !important'
                }}
                bodyStyle={{ height: 'calc(100vh - 110px)', overflowY: 'auto' }}
                footer={[
                    <Button key="back" onClick={handleCloseModal}>
                        Cancel
                    </Button>,
                    <Button key="fullScreen" type="primary" onClick={enterFullScreen}>
                        Fullscreen
                    </Button>
                ]}
            >
                {selectedInstance && selectedInstance.name && (selectedInstance.type === 'container' ? (
                    <LXDTextConsole
                        instanceName={selectedInstance.name}
                    />
                ) : (
                    <LXDConsole
                        ref={handleFullScreenRef}
                        instanceName={selectedInstance.name}
                    />
                ))}
            </Modal>›

        </div>
    );
};