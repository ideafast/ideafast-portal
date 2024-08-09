import React, { FunctionComponent, useState, useEffect} from 'react';
import { Modal, Input, message } from 'antd';
import { useAuth } from './webauthn.context';
import { trpc } from '../trpc';

export const DeviceNicknameModal: FunctionComponent = () => {
    const {
        handleCancelRegistration,
        showNicknameModal,
        setShowNicknameModal,
        newDeviceId

    } = useAuth();

    const [deviceName, setDeviceName] = useState('');

    useEffect(() => {
        if (showNicknameModal) {
            setDeviceName('');
        }
    }, [showNicknameModal]);

    const updateDeviceNameMutation = trpc.webauthn.updateWebauthnDeviceName.useMutation();

    const handleSetDeviceNickname = async () => {
        if (deviceName && newDeviceId) {
            try {
                await updateDeviceNameMutation.mutateAsync({
                    deviceId: newDeviceId,
                    name: deviceName
                });
                void message.success('Device nickname updated.');
            } catch (error) {
                void message.error('Failed to update device nickname.');
            }
        }
        setShowNicknameModal(false);
        handleCancelRegistration(); // Close the registration dialog after setting the nickname
    };

    return (
        <Modal
            title="Authenticator Nickname"
            open={showNicknameModal}
            onOk={() => void handleSetDeviceNickname()}
            onCancel={() => {
                setShowNicknameModal(false);
                handleCancelRegistration(); // Also close the main registration dialog
            }}
            okText="Save"
            cancelText="Later"
        >
            <p>Pick a nickname that will help you identify it later.</p>
            <p>For example, the name of your webauthn manager or account provider.</p>
            <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Enter a nickname for your device"
            />
        </Modal>
    );
};
