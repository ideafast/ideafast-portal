import React, { FunctionComponent, useEffect} from 'react';
import { useMutation} from '@apollo/client';
import { Button, Modal} from 'antd';

import {WEBAUTHN_REGISTER, WEBAUTHN_REGISTER_VERIFY} from '@itmat-broker/itmat-models';

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
    console.log('WebAuthnRegistrationComponent >>>> showRegistrationDialog', showRegistrationDialog);

    const [webauthnRegistration] = useMutation(WEBAUTHN_REGISTER);
    const [webauthnRegisterVerify] = useMutation(WEBAUTHN_REGISTER_VERIFY);

    useEffect(() => {
        console.log('windows 22222',{ isUserLogin, showRegistrationDialog});
    }, [isUserLogin, showRegistrationDialog]);

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

            console.log('frontend start verify');

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
                console.log('register new authenticator:', webauthn_id);
                setCredentials([
                    ...(credentials ?? ([] as string[])),
                    webauthn_id
                ]);
                handleCancelRegistration();

            } else {
                if (elemError) {
                    elemError.innerHTML = `Oh no, something went wrong! Response: <pre>${JSON.stringify(
                        verificationResult
                    )}</pre>`;
                }
            }

        } catch (error: any) {
            console.log('error', error);
            if (elemError) {
                elemError.innerHTML = `Error occurred: ${error.message || 'Unknown error'}`;
            }
        }
    };

    return (
        <Modal
            open={showRegistrationDialog}
            onCancel={handleCancelRegistration}
            footer={null}
            centered
            maskStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
            bodyStyle={{ padding: '24px' }} // Adjust padding as needed to reduce boundary
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

    );
};
