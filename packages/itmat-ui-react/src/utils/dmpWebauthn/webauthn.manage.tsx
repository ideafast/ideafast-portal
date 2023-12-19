import React, { FunctionComponent, useState, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_DEVICES, DELETE_DEVICE } from '@itmat-broker/itmat-models';
import { Alert, Button, Table, Modal } from 'antd';
import { removeTypenameDeep } from './webauthn.utils';
import { AuthenticatorDevice } from '@itmat-broker/itmat-types';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './webauthn.context';

export const WebauthnManagement: FunctionComponent = () => {
    const navigate = useNavigate();
    const { setShowRegistrationDialog } = useAuth();
    const { loading, error, data, refetch } = useQuery(GET_DEVICES, { fetchPolicy: 'network-only' });
    const [devices, setDevices] = useState<AuthenticatorDevice[]>([]);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState<AuthenticatorDevice | null>(null);
    const [deleteDeviceMutation] = useMutation(DELETE_DEVICE);

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

    const handleNavigateToRegister = () => {
        setShowRegistrationDialog(true);
        navigate('/register_webauthn');
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

    if (loading) {
        return <p>Loading...</p>;
    }

    if (error) {
        return <Alert type="error" message={error.message || 'No data available.'} />;
    }

    return (
        <>
            {devices.length > 0 ? (
                <div>
                    <Table dataSource={devices} columns={columns} rowKey={(record: any) => record.credentialID} />
                </div>
            ) : (
                <p>No WebAuthn devices found for this user.</p>
            )}
            <Button
                type="primary"
                onClick={handleNavigateToRegister} // Use navigate to go to registration route
            >
                Register New Device
            </Button>

            <Modal
                title="Confirm Delete"
                open={deleteModalVisible}
                onOk={handleDeleteDevice}
                onCancel={() => setDeleteModalVisible(false)}
            >
                <p>Are you sure you want to delete this device?</p>
            </Modal>
        </>
    );
};
