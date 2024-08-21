import React, { FunctionComponent, useState, useEffect } from 'react';
import { Alert, Button, Table, Modal, List, message } from 'antd';
import { AuthenticatorDevice } from '@itmat-broker/itmat-types';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../utils/dmpWebauthn/webauthn.context';
import css from './profile.module.css';
import LoadSpinner from '../reusable/loadSpinner';
import { trpc } from '../../utils/trpc';

export const MyWebauthn: FunctionComponent = () => {
    const navigate = useNavigate();
    const { setShowRegistrationDialog } = useAuth();
    const [devices, setDevices] = useState<AuthenticatorDevice[]>([]);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState<AuthenticatorDevice | null>(null);
    const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
    const [tempDeviceNames, setTempDeviceNames] = useState<{ [deviceId: string]: string }>({});

    const { data, isLoading, isError, refetch } = trpc.webauthn.getWebauthnRegisteredDevices.useQuery();

    const deleteDeviceMutation = trpc.webauthn.deleteWebauthnRegisteredDevices.useMutation();
    const updateDeviceNameMutation = trpc.webauthn.updateWebauthnDeviceName.useMutation();

    useEffect(() => {
        if (data) {
            const fetchedDevices = data as AuthenticatorDevice[];
            setDevices(fetchedDevices);
        }
    }, [data]);

    const handleDeleteDevice = async () => {
        if (selectedDevice) {
            try {
                await deleteDeviceMutation.mutateAsync({ deviceId: selectedDevice.id });
                await refetch();
                setDeleteModalVisible(false);
            } catch (error) {
                void message.error('Error deleting device.');
            }
        }
    };

    const handleDeleteDeviceWrapper = () => {
        (async () => {
            await handleDeleteDevice();
        })().catch(() => {
            void message.error('Error deleting device.');
        });
    };

    const handleNameChange = (deviceId: string, newName: string) => {
        setTempDeviceNames(prevNames => ({
            ...prevNames,
            [deviceId]: newName
        }));
    };

    const handleNavigateToRegister = () => {
        setShowRegistrationDialog(true);
        navigate('/register_webauthn');
    };

    const handleUpdateDeviceName = async (deviceId: string, name: string): Promise<void> => {
        try {
            await updateDeviceNameMutation.mutateAsync({ deviceId, name });
            setTempDeviceNames(prevNames => {
                const newNames = { ...prevNames };
                delete newNames[deviceId];
                return newNames;
            });
            setEditingDeviceId(null);
            await refetch();
        } catch (error) {
            void message.error('Error updating device name.');
        }
    };

    const handleEditClick = (deviceId: string, currentName: string) => {
        setEditingDeviceId(deviceId);
        setTempDeviceNames(prevNames => ({
            ...prevNames,
            [deviceId]: currentName
        }));
    };

    const handleCancelEdit = (deviceId: string) => {
        setEditingDeviceId(null);
        setTempDeviceNames(prevNames => {
            const newNames = { ...prevNames };
            delete newNames[deviceId];
            return newNames;
        });
    };

    const renderSetNameColumn = (text: string, record: AuthenticatorDevice) => {
        const isEditing = editingDeviceId === record.id;
        return (
            isEditing ? (
                <>
                    <input
                        value={tempDeviceNames[record.id] || ''}
                        onChange={(e) => handleNameChange(record.id, e.target.value)}
                        placeholder="Enter new name"
                    />
                    <Button
                        onClick={() => {
                            void handleUpdateDeviceName(record.id, tempDeviceNames[record.id] || '');
                        }}
                    >
                        Save
                    </Button>
                    <Button
                        onClick={() => handleCancelEdit(record.id)}
                    >
                        Cancel
                    </Button>
                </>
            ) : (
                <>
                    <span style={{ marginRight: '10px' }}>{record.name || 'N/A'}</span>
                    <Button
                        onClick={() => handleEditClick(record.id, record.name || '')}
                    >
                        Edit
                    </Button>
                </>
            )
        );
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (name: string | undefined) => (name ? name : 'N/A')
        },
        {
            title: 'Credential ID',
            dataIndex: 'credentialID',
            key: 'credentialID'
        },
        {
            title: 'Counter',
            dataIndex: 'counter',
            key: 'counter'
        },
        {
            title: 'Transports',
            dataIndex: 'transports',
            key: 'transports',
            render: (transports: string[]) => transports.join(', ')
        },
        {
            title: 'Origin',
            dataIndex: 'origin',
            key: 'origin',
            render: (origin: string | undefined) => (origin ? origin : 'N/A') // Show N/A if origin is null or undefined
        },
        {
            title: 'Set Name',
            dataIndex: '',
            key: 'setName',
            render: renderSetNameColumn
        },
        {
            title: 'Action',
            dataIndex: 'action',
            key: 'action',
            render: (__unused__text: string, record: AuthenticatorDevice) => (
                <Button onClick={() => {
                    setSelectedDevice(record);
                    setDeleteModalVisible(true);
                }} danger>
                    Delete
                </Button>
            )
        }
    ];

    if (isLoading) return <LoadSpinner />;
    if (isError) return <Alert type="error" message={'Error fetching data.'} />;
    return (
        <div className={css.group_wrapper}>
            <List
                header={
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div className={css['overview-icon']}></div>
                            <div>WebAuthn Devices</div>
                        </div>
                        <div>
                            <Button type="primary" onClick={handleNavigateToRegister}>
                                Register New Device
                            </Button>
                        </div>
                    </div>
                }
            >
                <List.Item>
                    <div className={css.shared_container}>
                        {/* Conditional rendering for devices */}
                        {devices.length > 0 ? (
                            <Table
                                style={{ width: '100%' }}
                                dataSource={devices}
                                columns={columns}
                                rowKey={(record: AuthenticatorDevice) => record.credentialID}
                            />
                        ) : (
                            <div style={{ width: '100%' }}>
                                <p style={{ textAlign: 'left' }}>No WebAuthn devices found for this user.</p>
                            </div>
                        )}
                    </div>
                </List.Item>
            </List>

            <Modal
                title="Confirm Delete"
                open={deleteModalVisible}
                onOk={handleDeleteDeviceWrapper}
                onCancel={() => setDeleteModalVisible(false)}
            >
                <p>Are you sure you want to delete this device?</p>
            </Modal>
        </div>
    );
};
