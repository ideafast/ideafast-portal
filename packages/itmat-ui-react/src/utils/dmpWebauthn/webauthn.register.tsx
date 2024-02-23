import React, { FunctionComponent, useState} from 'react';
import { useMutation, useLazyQuery} from '@apollo/client';
import { Button, Modal, Input} from 'antd';

import {WEBAUTHN_REGISTER, WEBAUTHN_REGISTER_VERIFY, UPDATE_DEVICE_NAME, GET_WEB_AUTHN_ID} from '@itmat-broker/itmat-models';

import { startRegistration} from '@simplewebauthn/browser';
import {
    RegistrationResponseJSON,
    PublicKeyCredentialCreationOptionsJSON
} from '@simplewebauthn/typescript-types';

import { WebAuthnAuthenticateProps } from './useLocalStorage';
import { removeTypenameDeep } from './webauthn.utils';
import webauthnStyles from './webauthn.module.css';
import { useAuth } from './webauthn.context';

export const WebAuthnRegistrationComponent: FunctionComponent<WebAuthnAuthenticateProps> = (
    {
        credentials, setCredentials,isUserLogin
    }) => {

    const { showRegistrationDialog, handleCancelRegistration} = useAuth();

    const [webauthnRegistration] = useMutation(WEBAUTHN_REGISTER);
    const [webauthnRegisterVerify] = useMutation(WEBAUTHN_REGISTER_VERIFY);

    const [updateDeviceNameMutation] = useMutation(UPDATE_DEVICE_NAME);
    const [deviceName, setDeviceName] = useState('');
    const [showNicknameModal, setShowNicknameModal] = useState(false);
    const [newDeviceId, setNewDeviceId] = useState('');


    const [fetchWebAuthnID] = useLazyQuery(GET_WEB_AUTHN_ID, {
        fetchPolicy: 'network-only', // Ensures a network request is made
        onCompleted: (data) => {
            const webauthnID = data.getWebauthnID?.id;
            const updatedCredentials = credentials ? [...credentials] : [];
            if (webauthnID && !updatedCredentials.includes(webauthnID)) {
                updatedCredentials.push(webauthnID); // Add the new webauthnID
                setCredentials(updatedCredentials);
                handleCancelRegistration();
            }
        },
        onError: (error) => console.error('Lazy query error:', error)
    });




    const handleWebAuthnRegistration = async (event) => {
        event.preventDefault();

        const elemSuccess = document.querySelector('#regSuccess');
        const elemError = document.querySelector('#regError');

        if (!isUserLogin){
            if (elemError) {
                elemError.innerHTML = 'There is no login user, please login and try again';
            }
            return;
        }

        try {
            if (elemSuccess && elemError) {
                elemSuccess.innerHTML = '';
                elemError.innerHTML = '';
            }

            const {data: registrationData} = await webauthnRegistration();
            const registrationOptions: PublicKeyCredentialCreationOptionsJSON  =  removeTypenameDeep(await registrationData?.webauthnRegister);

            const attestationResponse: RegistrationResponseJSON = await startRegistration(registrationOptions);

            const {data: verificationData} = await webauthnRegisterVerify({
                variables: {
                    attestationResponse: attestationResponse
                }
            });
            const verificationResult = verificationData?.webauthnRegisterVerify;

            if (verificationResult.successful) {
                if (elemSuccess) {
                    elemSuccess.innerHTML = 'Authenticator registered!!';
                }

                const webauthn_id = verificationResult.id;
                setCredentials([
                    ...(credentials ?? ([] as string[])),
                    webauthn_id
                ]);
                // Save the ID of the new device for later use
                setNewDeviceId(verificationResult.id);
                setShowNicknameModal(true); // Show modal to set device nickname

                handleCancelRegistration();

            } else {
                if (elemError) {
                    elemError.innerHTML = `Oh no, something went wrong! Response: <pre>${JSON.stringify(
                        verificationResult
                    )}</pre>`;
                }
            }

        }  catch (error: any) {
            console.log('error', error);
            if (error.name === 'InvalidStateError') {
                fetchWebAuthnID(); // Execute the lazy query
                if (elemError) {
                    elemError.innerHTML = 'This device has already been registered. You don\'t have to register it again.';
                }
            } else {
                if (elemError) {
                    elemError.innerHTML = `Error occurred: ${error.message || 'Unknown error'}`;
                }
            }
        }
    };

    const handleSetDeviceNickname = async () => {
        if (deviceName && newDeviceId) {
            try {
                const { data } = await updateDeviceNameMutation({
                    variables: {
                        deviceId: newDeviceId,
                        name: deviceName
                    }
                });

                if (data.updateWebauthnDeviceName) {
                    console.log('Device name updated successfully');
                }
            } catch (error) {
                console.error('Error updating device name:', error);
            }
        }
        setShowNicknameModal(false);
        setDeviceName('');
    };

    const DeviceNicknameModal = ({ visible, onOk, onCancel }) => (
        <Modal
            title="Passkey Nickname"
            open={visible}
            onOk={onOk}
            onCancel={onCancel}
            okText="Save"
            cancelText="Later"
        >
            <p> Pick a nickname that will help you identify it later.</p>
            <p>For example, the name of your webauthn manager or account provider.</p>
            <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Enter a nickname for your device"
            />
        </Modal>
    );

    return (
        <>
            <Modal
                open={showRegistrationDialog}
                onCancel={handleCancelRegistration}
                footer={null}
                centered
                maskStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
                style={{ padding: '24px' }} // Adjust padding as needed to reduce boundary
            >
                <div className={webauthnStyles.registration_dialog}>
                    <img alt='IDEA-FAST Logo' src='https://avatars3.githubusercontent.com/u/60649739?s=150' />
                    <h3>Register for WebAuthn?</h3>
                    <p className="success" id="regSuccess"></p>
                    <p className="error" id="regError"></p>
                </div>
                <div className={webauthnStyles.primaryButton}>
                    <Button key="no" onClick={handleCancelRegistration} size='large'>
            No
                    </Button>
                    <Button key="yes" type="primary" onClick={handleWebAuthnRegistration} size='large'>
            Yes
                    </Button>
                </div>
            </Modal>

            <DeviceNicknameModal
                visible={showNicknameModal}
                onOk={handleSetDeviceNickname}
                onCancel={() => {
                    setShowNicknameModal(false);
                    setDeviceName(''); // Clear the device name state when modal is cancelled
                }}
            />
        </>

    );
};
