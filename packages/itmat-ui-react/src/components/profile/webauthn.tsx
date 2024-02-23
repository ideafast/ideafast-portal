import React, { FunctionComponent, useState, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_DEVICES, DELETE_DEVICE, UPDATE_DEVICE_NAME} from '@itmat-broker/itmat-models';
import { Alert, Button, Table, Modal, List } from 'antd';
import { removeTypenameDeep } from '../../utils/dmpWebauthn/webauthn.utils';
import { AuthenticatorDevice } from '@itmat-broker/itmat-types';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../utils/dmpWebauthn/webauthn.context';
import css from './profile.module.css';
import LoadSpinner from '../reusable/loadSpinner';

export const MyWebauthn: FunctionComponent = () => {
    const navigate = useNavigate();
    const { setShowRegistrationDialog } = useAuth();
    const { loading, error, data, refetch } = useQuery(GET_DEVICES, { fetchPolicy: 'network-only' });
    const [devices, setDevices] = useState<AuthenticatorDevice[]>([]);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState<AuthenticatorDevice | null>(null);
    const [deleteDeviceMutation] = useMutation(DELETE_DEVICE);
    const [updateDeviceNameMutation] = useMutation(UPDATE_DEVICE_NAME);
    const [deviceNames, setDeviceNames] = useState<{ [deviceId: string]: string }>({});

    useEffect(() => {
        if (data && data.getWebauthnRegisteredDevices) {
            const fetchedDevices = removeTypenameDeep(data.getWebauthnRegisteredDevices);
            setDevices(fetchedDevices);
        }
    }, [data]);

    const handleDeleteDevice = async () => {
        if (selectedDevice) {
            try {
                await deleteDeviceMutation({ variables: { deviceId: selectedDevice.id } });

                const refetchedData = await refetch();

                if (refetchedData && refetchedData.data && refetchedData.data.getWebauthnRegisteredDevices) {
                    const updatedDevices = removeTypenameDeep(refetchedData.data.getWebauthnRegisteredDevices);
                    setDevices(updatedDevices);
                }

                setDeleteModalVisible(false);
            } catch (error) {
                console.error('Error deleting device:', error);
            }
        }
    };

    // This function is called whenever an input field is changed
    const handleNameChange = (deviceId: string, newName: string) => {
        setDeviceNames(prevNames => ({
            ...prevNames,
            [deviceId]: newName
        }));
    };


    const handleNavigateToRegister = () => {
        setShowRegistrationDialog(true);
        navigate('/register_webauthn');
    };


    // Update the handleUpdateDeviceName function to accept a deviceId and a name
    const handleUpdateDeviceName = async (deviceId: string, name: string) => {
        try {
            const response = await updateDeviceNameMutation({
                variables: { deviceId, name }
            });

            // If the mutation was successful, clear the input field and refetch the devices
            if (response.data.updateWebauthnDeviceName) {
                setDeviceNames(prevNames => {
                    const newNames = { ...prevNames };
                    delete newNames[deviceId];
                    return newNames;
                });
                await refetch();
            }
        } catch (error) {
            console.error('Error updating device name:', error);
        }
    };

    //  render an input for each device
    const renderSetNameColumn = (text: string, record: AuthenticatorDevice) => {
        return (
            <>
                <input
                    value={deviceNames[record.id] || record.name || ''}
                    onChange={(e) => handleNameChange(record.id, e.target.value)}
                    placeholder="Enter new name"
                />
                <Button
                    onClick={() => handleUpdateDeviceName(record.id, deviceNames[record.id] || '')}
                >
                    Update Name
                </Button>
            </>
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
            title: 'Set Name',
            dataIndex: '',
            key: 'setName',
            render: renderSetNameColumn
        },
        {
            title: 'Action',
            dataIndex: 'action',
            key: 'action',
            render: (__unused__text: string, record: any) => (
                <Button type="primary" onClick={() => {
                    setSelectedDevice(record);
                    setDeleteModalVisible(true);
                }}>
                    Delete
                </Button>
            )
        }
    ];

    if (loading) return <LoadSpinner />;
    if (error) return <Alert type="error" message={error.message || 'No data available.'} />;
    if (devices.length === 0) return <p>No WebAuthn devices found for this user.</p>;

    return (
        <div className={css.group_wrapper}>
            <List
                header={
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div className={css['overview-icon']}></div>
                            <div>WebAuthn Devices</div>
                        </div>
                        <Button type="primary" onClick={handleNavigateToRegister}>
                            Register New Device
                        </Button>
                    </div>
                }
            >
                <List.Item>
                    <div className={css.shared_container}>
                        {devices.length > 0 ? (
                            <Table dataSource={devices} columns={columns} rowKey={(record: any) => record.credentialID} />
                        ) : (
                            <p>No WebAuthn devices found for this user.</p>
                        )}
                    </div>
                </List.Item>
            </List>

            <Modal
                title="Confirm Delete"
                open={deleteModalVisible}
                onOk={handleDeleteDevice}
                onCancel={() => setDeleteModalVisible(false)}
            >
                <p>Are you sure you want to delete this device?</p>
            </Modal>
        </div>
    );

};
