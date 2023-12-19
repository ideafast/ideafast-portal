import { FunctionComponent, useState, useEffect} from 'react';
import { Query } from '@apollo/client/react/components';
import { Routes, Route } from 'react-router-dom';
import { LoginBox } from './components/login/login';
import { MainMenuBar } from './components/scaffold/mainMenuBar';
import { MainPanel } from './components/scaffold/mainPanel';
import css from './components/scaffold/scaffold.module.css';
import { ResetPasswordPage } from './components/login/resetPasswordPage';
import { RequestResetPassword } from './components/login/requestResetPasswordPage';
import { RegisterNewUser } from './components/login/register';
import { WHO_AM_I, RECOVER_SESSION_EXPIRE_TIME } from '@itmat-broker/itmat-models';
import LoadSpinner from './components/reusable/loadSpinner';
import { StatusBar } from './components/scaffold/statusBar';
import { useQuery } from '@apollo/client/react/hooks';
import { WebAuthnRegistrationComponent} from './utils/dmpWebauthn/webauthn.register';
import { WebAuthnAuthenticationComponent } from './utils/dmpWebauthn/webauthn.authenticate';
import { useLocalForage } from './utils/dmpWebauthn/useLocalStorage';

import {
    browserSupportsWebAuthn,
    platformAuthenticatorIsAvailable
} from '@simplewebauthn/browser';
import { useAuth } from './utils/dmpWebauthn/webauthn.context';


export const Fence: FunctionComponent = () => {

    const [credentials, setCredentials] = useLocalForage<Array<string>>('enrolledCredentials', []);
    const {loading, error, data} = useQuery(WHO_AM_I);

    const [isWebauthAvailable, setIsWebauthAvailable] = useState<null | boolean>();
    const [isUserLogin, setIsUserLogin] = useState<boolean>(false);
    const { showRegistrationDialog, setShowRegistrationDialog, handleCancelRegistration} = useAuth();

    const [component, setComponent] = useState<JSX.Element | null>(null);
    const [windowComponent, setwindowComponent] = useState<JSX.Element | null>(null);

    const [useWebauthn, setUseWebauthn] = useState<'register' | 'authenticate' | 'close'>('close');

    useEffect(() => {

        if (data && data.whoAmI !== null && data.whoAmI !== undefined && data.whoAmI.username !== null) {
            setIsUserLogin(true);
        } else {
            setIsUserLogin(false);
        }

        if (credentials?.length === 0) {
            setUseWebauthn('register');
        } else {
            setUseWebauthn('authenticate');
        }
    }, [loading, error, data, credentials]);

    useEffect(() => {
        if (isWebauthAvailable === undefined) {
            setIsWebauthAvailable(false);
            Promise.all([
                browserSupportsWebAuthn(),
                platformAuthenticatorIsAvailable()
            ])
                .then(statuses => statuses.reduce((prev, curr) => curr && prev, true))
                .then((result) => {setIsWebauthAvailable(result);})
                .catch(() => setIsWebauthAvailable(false));
        }
    }, [isWebauthAvailable]);

    useEffect(() => {

        if (loading) {
            setComponent(<LoadSpinner />);
        } else if (error) {
            setComponent(
                <p>
                    Error {error.message}
                </p>
            );
        } else if (isUserLogin) {
            setComponent(
                <div className={css.app + ' dark_theme'}>
                    <Query<any, any> query={RECOVER_SESSION_EXPIRE_TIME} pollInterval={30 * 60 * 1000}>
                        {() => {
                            return null;
                        }}
                    </Query>
                    <MainMenuBar projects={data.whoAmI.access.projects} />
                    <MainPanel />
                    <StatusBar />
                </div>
            );
        } else {
            setComponent(<LoginBox />);
        }
    }, [loading, error, data, isUserLogin, showRegistrationDialog]);

    useEffect(() => {
        if (isWebauthAvailable && !showRegistrationDialog) {
            try {
                if (isUserLogin && useWebauthn === 'register') {
                    setShowRegistrationDialog(true);

                } else if(!isUserLogin && useWebauthn === 'authenticate') {
                    console.log('webauthn automic_login');
                    setShowRegistrationDialog(true);
                } else {
                    setShowRegistrationDialog(false);
                }
            } catch (error) {
                console.error('WebAuthn authentication failed:', error);
            }
        }
    }, [isUserLogin, isWebauthAvailable, useWebauthn]);

    useEffect(() => {
        console.log('11111 showRegistrationDialog', showRegistrationDialog);
        if (isUserLogin && showRegistrationDialog && useWebauthn === 'register') {
            setwindowComponent(
                <WebAuthnRegistrationComponent
                    credentials={credentials}
                    setCredentials={setCredentials}
                    isUserLogin = {isUserLogin}
                />
            );
        } else if (!isUserLogin && showRegistrationDialog && useWebauthn === 'authenticate') {

            setwindowComponent(
                <WebAuthnAuthenticationComponent
                    credentials={credentials}
                    setCredentials={setCredentials}
                    isUserLogin = {isUserLogin}
                />
            );

        }  else{
            setwindowComponent(null);
        }
    }, [credentials, handleCancelRegistration, setCredentials, showRegistrationDialog, isUserLogin, useWebauthn]);


    return <Routes>
        <Route path='/login' element={<LoginBox />} />
        <Route path='/reset/:encryptedEmail/:token' element={<ResetPasswordPage />} />
        <Route path='/reset' element={<RequestResetPassword />} />
        <Route path='/register' element={<RegisterNewUser />} />
        <Route path='/register_webauthn' element={<WebAuthnRegistrationComponent
            credentials={credentials} setCredentials={setCredentials}
            isUserLogin = {isUserLogin}
        />} />
        <Route path='/authenticate_webauthn' element={<WebAuthnAuthenticationComponent
            credentials={credentials} setCredentials={setCredentials}
            isUserLogin = {isUserLogin}/>
        } />

        <Route path='*' element={
            <>
                {component}
                {windowComponent}
            </>
        } />
    </Routes>;
};

export default Fence;
