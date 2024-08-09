import React, { FunctionComponent} from 'react';
import { Button, Modal, message } from 'antd';

import { startRegistration } from '@simplewebauthn/browser';
import {
    RegistrationResponseJSON,
    PublicKeyCredentialCreationOptionsJSON
} from '@simplewebauthn/types';

import webauthnStyles from './webauthn.module.css';
import { useAuth } from './webauthn.context';
import { trpc } from '../../utils/trpc';

export const WebAuthnRegistrationComponent: FunctionComponent = () => {
    const {
        credentials,
        setCredentials,
        isUserLogin,
        showRegistrationDialog,
        handleCancelRegistration,
        setShowNicknameModal,
        setNewDeviceId
    } = useAuth();

    const webauthnRegistration = trpc.webauthn.webauthnRegister.useMutation();
    const webauthnRegisterVerify = trpc.webauthn.webauthnRegisterVerify.useMutation();

    const { refetch: fetchWebAuthnID } = trpc.webauthn.getWebauthnID.useQuery(undefined, {
        enabled: false,
        onSuccess: (data) => {
            if (data === null) {
                void message.warning('No WebAuthn ID found for the user.');
                return;
            }
            const webauthnID = data?.id;
            const updatedCredentials = credentials ? [...credentials] : [];
            if (webauthnID && !updatedCredentials.includes(webauthnID)) {
                updatedCredentials.push(webauthnID);
                setCredentials(updatedCredentials);
                handleCancelRegistration();
            }
        },
        onError: () => {
            void message.error('Failed to fetch WebAuthn ID.');
        }
    });

    const handleWebAuthnRegistration = async (event: React.FormEvent) => {
        event.preventDefault();

        const elemSuccess = document.querySelector('#regSuccess');
        const elemError = document.querySelector('#regError');
        let webauthn_id: string | undefined; // add webauthn_id to the browser's local storage as needed
        let device_id: string | undefined; // the device ID to be used for the nickname

        if (!isUserLogin) {
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

            const registrationData = await webauthnRegistration.mutateAsync();
            webauthn_id = registrationData.webauthn_id;
            const registrationOptions: PublicKeyCredentialCreationOptionsJSON = registrationData.options;

            const attestationResponse: RegistrationResponseJSON = await startRegistration(registrationOptions);

            const verificationData = await webauthnRegisterVerify.mutateAsync({
                attestationResponse
            });

            const verificationResult = verificationData;

            if (verificationResult.successful) {
                if (elemSuccess) {
                    elemSuccess.innerHTML = 'Authenticator registered!!';
                }

                device_id = verificationResult.id;
                if (webauthn_id) { // Ensure id is defined
                    setCredentials([
                        ...(credentials ?? []),
                        webauthn_id
                    ]);
                    void message.success('Registration verified.');
                    setNewDeviceId(device_id); // Ensure id is defined
                    setShowNicknameModal(true);
                    handleCancelRegistration();
                } else {
                    void message.error('Verification ID is undefined.');
                }
            } else {
                if (elemError) {
                    elemError.innerHTML = `Oh no, something went wrong! Response: <pre>${JSON.stringify(verificationResult)}</pre>`;
                }
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                if (error.name === 'InvalidStateError') {
                    await fetchWebAuthnID(); // Fetch the webauthn ID if the user has already registered the device
                    if (elemError) {
                        elemError.innerHTML = 'This device has already been registered. You don\'t have to register it again.';
                    }
                    if (webauthn_id) { // Ensure id is available
                        setCredentials([
                            ...(credentials ?? []),
                            webauthn_id
                        ]);
                        handleCancelRegistration();
                    }
                } else {
                    if (elemError) {
                        elemError.innerHTML = `Error occurred: ${error.message || 'Unknown error'}`;
                    }
                }
            } else {
                if (elemError) {
                    elemError.innerHTML = 'An unexpected error occurred';
                }
            }
        }
    };


    return (
        <Modal
            open={showRegistrationDialog}
            onCancel={handleCancelRegistration}
            footer={null}
            centered
            styles={{ mask: { backgroundColor: 'rgba(0, 0, 0, 0.3)' } }}
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
                <Button key="yes" type="primary" onClick={(event) => { void handleWebAuthnRegistration(event); }} size='large'>
                        Yes
                </Button>
            </div>
        </Modal>
    );
};
