import React, { FunctionComponent, useState, useEffect } from 'react';
import { Modal, Button, Select } from 'antd';

import { startAuthentication } from '@simplewebauthn/browser';
import { PublicKeyCredentialRequestOptionsJSON, AuthenticationResponseJSON } from '@simplewebauthn/types';
import LoadSpinner from '../../components/reusable/loadSpinner';
import webauthnStyles from './webauthn.module.css';

import { UserID } from './webauthn.utils';
import { useAuth } from './webauthn.context';
import { trpc } from '../../utils/trpc';

export const WebAuthnAuthenticationComponent: FunctionComponent = () => {
    const {
        credentials: webauthn_ids,
        setCredentials,
        isUserLogin,
        showRegistrationDialog,
        handleCancelRegistration
    } = useAuth();

    const [selectedUser, setSelectedUser] = useState<UserID | null>(null);
    const [userList, setUserList] = useState<UserID[]>([]);

    // State to keep track of whether user selection is being changed
    const [isSelectingUser, setIsSelectingUser] = useState<boolean>(false);

    const webauthnAuthenticate = trpc.webauthn.webauthnAuthenticate.useMutation();
    const webauthnAuthenticateVerify = trpc.webauthn.webauthnAuthenticateVerify.useMutation();
    const webauthnLogin = trpc.webauthn.webauthnLogin.useMutation();
    const { data: webauthn_users, isLoading: webAuthnLoading, error: webAuthnError } = trpc.webauthn.getWebauthn.useQuery({ webauthn_ids: webauthn_ids || [] });

    useEffect(() => {
        if (webAuthnLoading || webAuthnError) return;


        if (webauthn_users && webauthn_users.length > 0) {
        // Filter users that have registered devices
            const usersWithDevices = webauthn_users.filter(user => user.devices && user.devices.length > 0);

            if (usersWithDevices.length > 0) {
                const modifiedUsers = usersWithDevices.map(user => ({
                    id: String(user.userId),
                    username: String(user.username)
                }));

                if (JSON.stringify(modifiedUsers) !== JSON.stringify(userList)) {
                    setUserList(modifiedUsers);
                    if (modifiedUsers.length === 1) {
                        setSelectedUser(modifiedUsers[0]);
                        setIsSelectingUser(false);
                    } else {
                        setIsSelectingUser(true);
                    }
                }
            } else {
            // If no users have devices, clear credentials and cancel the authentication dialog
                setUserList([]);
                setSelectedUser(null);
                setIsSelectingUser(false);
                setCredentials([]); // Clear the credentials if no users have devices
                handleCancelRegistration();
            }
        } else {
        // If there are no users at all, clear everything and cancel the dialog
            setUserList([]);
            setSelectedUser(null);
            setIsSelectingUser(false);
            setCredentials([]);
            handleCancelRegistration();
        }
    }, [setCredentials, webAuthnError, webAuthnLoading, webauthn_users]);

    if (isUserLogin) {
        return null;
    }

    if (webAuthnLoading) {
        return <LoadSpinner />;
    }

    if (webAuthnError) {
        return <p>An error occurred, please contact your administrator</p>;
    }

    const handleUserSelectionChange = (value: string | null) => {
        if (value) {
            const selectedUserData: UserID = JSON.parse(value);
            setSelectedUser(selectedUserData);
            setIsSelectingUser(false);
        }
    };

    const handleWebAuthnAuthentication = async (event: React.FormEvent) => {
        event.preventDefault();
        const elemSuccess = document.querySelector('#authSuccess');
        const elemError = document.querySelector('#authError');

        if (elemSuccess && elemError) {
            elemSuccess.innerHTML = '';
            elemError.innerHTML = '';
        }

        if (!selectedUser) {
            if (elemError) {
                elemError.innerHTML = 'There are no webauthn registered user, please choose or register and try again';
            }
            return;
        }

        try {
            const authenticationData = await webauthnAuthenticate.mutateAsync({ userId: selectedUser.id });

            const authenticationOptions: PublicKeyCredentialRequestOptionsJSON = authenticationData;
            const assertionResponse: AuthenticationResponseJSON = await startAuthentication(authenticationOptions);
            const verificationData = await webauthnAuthenticateVerify.mutateAsync({
                userId: selectedUser.id,
                assertionResponse
            });

            const verificationResult = verificationData;

            if (verificationResult.successful) {
                if (elemSuccess) {
                    elemSuccess.innerHTML = 'User authenticated!';
                }
                try {
                    await webauthnLogin.mutateAsync({ userId: selectedUser.id });
                    window.location.reload();
                    handleCancelRegistration();
                } catch (error) {
                    if (elemError) {
                        elemError.innerHTML = `Oh no, webauthn login went wrong! Please try later, Response: <pre>${JSON.stringify(error)}</pre>`;
                    }
                }
            } else {
                if (elemError) {
                    elemError.innerHTML = `Oh no, something went wrong! Response: <pre>${JSON.stringify(verificationResult)}</pre>`;
                }
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                if (elemError) {
                    elemError.innerHTML = `Oh no, something went wrong! Response: <pre>${error.message || 'Unknown error'}</pre>`;
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
            style={{ padding: '24px' }}
        >
            <div className={webauthnStyles.auth_modalContent}>
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
                <Button
                    key="authenticate"
                    type="primary"
                    onClick={(event) => { void handleWebAuthnAuthentication(event); }}
                    size='large'
                    className={webauthnStyles.authenticateButton}>
                    Authenticate
                </Button>
            </div>
        </Modal>
    );
};

