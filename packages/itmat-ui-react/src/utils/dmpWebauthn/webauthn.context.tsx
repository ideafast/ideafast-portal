import React, { useState, createContext, useContext, FunctionComponent, ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalForage } from './useLocalStorage'; // Adjust the path as needed

import {
    browserSupportsWebAuthn,
    platformAuthenticatorIsAvailable
} from '@simplewebauthn/browser';

interface AuthContextState {
    // registration dialog
    showRegistrationDialog: boolean;
    setShowRegistrationDialog: (show: boolean) => void;
    handleCancelRegistration: () => void;
    credentials: Array<string> | null;
    setCredentials: (value: Array<string>) => void;
    // webauthn availability
    isWebauthAvailable: null | boolean;
    setIsWebauthAvailable: (value: null | boolean) => void;
    // user login status
    isUserLogin: boolean;
    setIsUserLogin: (value: boolean) => void;
    // webauthn registration or authentication
    useWebauthn: 'register' | 'authenticate' | 'close';
    setUseWebauthn: (value: 'register' | 'authenticate' | 'close') => void;
    // nickname setting for webauthn
    showNicknameModal: boolean;
    setShowNicknameModal: (show: boolean) => void;
    newDeviceId: string | undefined;
    setNewDeviceId: (id: string | undefined) => void;
}

const AuthContext = createContext<AuthContextState | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: FunctionComponent<AuthProviderProps> = ({ children }) => {
    // registration dialog
    const [showRegistrationDialog, setShowRegistrationDialog] = useState(false);
    const [credentials, setCredentials] = useLocalForage<Array<string>>('enrolledCredentials', []);
    const [isWebauthAvailable, setIsWebauthAvailable] = useState<null | boolean>(null);
    const [isUserLogin, setIsUserLogin] = useState<boolean>(false);
    const [useWebauthn, setUseWebauthn] = useState<'register' | 'authenticate' | 'close'>('close');

    const [showNicknameModal, setShowNicknameModal] = useState(false);
    const [newDeviceId, setNewDeviceId] = useState<string | undefined>('');

    const navigate = useNavigate();

    const handleCancelRegistration = () => {
        setShowRegistrationDialog(false);

        navigate('/');
    };

    useEffect(() => {
        if (isWebauthAvailable === null) {
            setIsWebauthAvailable(false);
            Promise.all([
                browserSupportsWebAuthn(),
                platformAuthenticatorIsAvailable()
            ])
                .then(statuses => statuses.reduce((prev, curr) => curr && prev, true))
                .then((result) => {
                    setIsWebauthAvailable(result);
                })
                .catch(() => setIsWebauthAvailable(false));
        }
    }, [isWebauthAvailable]);

    return (
        <AuthContext.Provider value={{
            showRegistrationDialog,
            setShowRegistrationDialog,
            handleCancelRegistration,
            credentials,
            setCredentials,
            isWebauthAvailable,
            setIsWebauthAvailable,
            isUserLogin,
            setIsUserLogin,
            useWebauthn,
            setUseWebauthn,
            // nickname setting for webauthn
            showNicknameModal,
            setShowNicknameModal,
            newDeviceId,
            setNewDeviceId
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextState => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
