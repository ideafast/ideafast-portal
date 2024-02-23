import React, { FunctionComponent, useState, useEffect} from 'react';
import { useQuery, useMutation} from '@apollo/client';
import { Modal, Button, Select} from 'antd';

import {WEBAUTHN_AUTHENTICATE,
    WEBAUTHN_AUTHENTICATE_VERIFY,
    WEBAUTHN_LOGIN, GET_WEBAUTHN} from '@itmat-broker/itmat-models';

import { startAuthentication} from '@simplewebauthn/browser';
import {PublicKeyCredentialRequestOptionsJSON, AuthenticationResponseJSON} from '@simplewebauthn/typescript-types';
import LoadSpinner from '../../components/reusable/loadSpinner';
import webauthnStyles from './webauthn.module.css';

import { WebAuthnAuthenticateProps } from './useLocalStorage';
import { UserID, removeTypenameDeep } from './webauthn.utils';
import { useAuth } from './webauthn.context';

export const WebAuthnAuthenticationComponent: FunctionComponent<WebAuthnAuthenticateProps> = ( {
    credentials: webauthn_ids, isUserLogin
}) => {

    const { showRegistrationDialog, handleCancelRegistration} = useAuth();

    const [webauthnAuthenticate] = useMutation(WEBAUTHN_AUTHENTICATE);
    const [webauthnAuthenticateVerify] = useMutation(WEBAUTHN_AUTHENTICATE_VERIFY);
    const [webauthnLogin] = useMutation(WEBAUTHN_LOGIN);
    const { loading: webAuthnLoading, error: webAuthnError, data: webauthn_users } = useQuery(GET_WEBAUTHN, {variables: { webauthn_ids}});

    const [selectedUser, setSelectedUser] = useState<UserID|null>(null);
    const [userList, setUserList] = useState<UserID[]>([]);

    // State to keep track of whether user selection is being changed
    const [isSelectingUser, setIsSelectingUser] = useState<boolean>(false);


    const elemSuccess = document.querySelector('#regSuccess');
    const elemError = document.querySelector('#regError');

    useEffect(() => {
        if (webauthn_users && webauthn_users.getWebauthn.length > 0) {
            const modifiedUsers = webauthn_users.getWebauthn.map(user => ({
                id: String(user.userId),
                username: String(user.username)
            }));

            if (JSON.stringify(modifiedUsers) !== JSON.stringify(userList)) {
                setUserList(modifiedUsers);
                // Automatically select the user if only one is available
                if (modifiedUsers.length === 1) {
                    setSelectedUser(modifiedUsers[0]);
                    setIsSelectingUser(false); // No need to select if only one user
                } else {
                // Allow user selection if more than one user is available
                    setIsSelectingUser(true);
                }
            }
        }
    }, [webauthn_users]);

    if (isUserLogin){
        return;
    }

    if (webAuthnLoading) {
        return <LoadSpinner />;
    }
    if (webAuthnError) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }

    const handleUserSelectionChange = (value: string | null) => {
        if (value) {
            const selectedUserData: UserID = JSON.parse(value);
            setSelectedUser(selectedUserData);
            setIsSelectingUser(false); // User made a selection, no longer in select mode
        }
    };

    const handleWebAuthnAuthentication = async (event) => {
        event.preventDefault();
        try {
            if (elemSuccess && elemError) {
                elemSuccess.innerHTML = '';
                elemError.innerHTML = '';
            }
            if (!selectedUser){
                if (elemError) {
                    elemError.innerHTML = 'There are no webauthn registered user, please choose or register and try again';
                }

                return;
            }

            const {data: authenticationData} = await webauthnAuthenticate({
                variables: {
                    userId: selectedUser.id
                }
            });

            const authenticationOptions: PublicKeyCredentialRequestOptionsJSON  =  removeTypenameDeep(await authenticationData?.webauthnAuthenticate);
            const assertionResponse: AuthenticationResponseJSON = await startAuthentication(authenticationOptions);


            const {data: verificationData} = await webauthnAuthenticateVerify({
                variables: {
                    userId: selectedUser.id,
                    assertionResponse: assertionResponse
                }
            });


            const verificationResult = verificationData?.webauthnAuthenticateVerify;

            if (verificationResult.successful) {
                if (elemSuccess) {
                    elemSuccess.innerHTML = 'User authenticated!';
                }
                try {
                    try{
                        const {data: logindata} = await webauthnLogin({
                            variables: {
                                userId: selectedUser.id
                            }
                        });

                        window.location.reload();
                        handleCancelRegistration();
                    } catch(error) {
                        console.log('webauthnLogin', error);
                    }

                } catch (error){
                    console.log('error', error);
                    if (elemError) {
                        elemError.innerHTML = `Oh no, webauthn login,  went wrong! please try later, Response: <pre>${JSON.stringify(
                            error
                        )}</pre>`;}
                }

            } else {
                if (elemError) {
                    elemError.innerHTML = `Oh no, something went wrong! Response: <pre>${JSON.stringify(
                        verificationResult
                    )}</pre>`;
                }
            }

        } catch (error) {
            console.log('error', error);
            if (elemError) {
                elemError.innerHTML = `Oh no, something went wrong! Response: <pre>${JSON.stringify(
                    error
                )}</pre>`;
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
            style={{ padding: '24px' }}
        >
            <div className = {webauthnStyles.auth_modalContent}>
                <img alt='IDEA-FAST Logo' src='https://avatars3.githubusercontent.com/u/60649739?s=150' />
                <h3>Authenticate with WebAuthn?</h3>
                {userList.length > 1 && isSelectingUser ? (
                    <Select
                        onChange={handleUserSelectionChange}
                        placeholder="Select the user"
                        style={{ width: '100%', marginBottom: '20px' }}
                        value={selectedUser ? JSON.stringify(selectedUser) : undefined} // Reflect the selected user in the dropdown
                    >
                        {userList.map((user) => (
                            <Select.Option key={user.id} value={JSON.stringify(user)}>
                                {user.username}
                            </Select.Option>
                        ))}
                    </Select>
                ) : (
                    <p className="user">
                        {selectedUser ? (
                            <>
                        User: {selectedUser.username}
                                <br />
                                <Button size="small" onClick={() => setIsSelectingUser(true)} style={{ marginTop: '10px' }}>Change</Button>
                            </>
                        ) : 'No user selected'}
                    </p>
                )}
                <p className="success" id="authSuccess"></p>
                <p className="error" id="authError"></p>
            </div>
            <div className={webauthnStyles.auth_buttonContainer}>
                <Button key="cancel" onClick={handleCancelRegistration} size='large'>
            Cancel
                </Button>
                <Button key="authenticate" type="primary" onClick={handleWebAuthnAuthentication} size='large' className={webauthnStyles.authenticateButton}>
            Authenticate
                </Button>
            </div>
        </Modal>
    );
};
