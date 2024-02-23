import { FunctionComponent, useState, useEffect} from 'react';
// import { Query } from '@apollo/client/react/components';
import { Routes, Route } from 'react-router-dom';
import { LoginBox } from './components/login/login';
import { MainMenuBar } from './components/scaffold/mainMenuBar';
import { MainPanel } from './components/scaffold/mainPanel';
import css from './components/scaffold/scaffold.module.css';
// import { ResetPasswordPage } from './components/login/resetPasswordPage';
// import { RequestResetPassword } from './components/login/requestResetPasswordPage';
import { RegisterNewUser } from './components/login/register';
import LoadSpinner from './components/reusable/loadSpinner';
import { StatusBar } from './components/scaffold/statusBar';
import { trpc } from './utils/trpc';

import { WebAuthnRegistrationComponent} from './utils/dmpWebauthn/webauthn.register';
import { WebAuthnAuthenticationComponent } from './utils/dmpWebauthn/webauthn.authenticate';
import { useLocalForage } from './utils/dmpWebauthn/useLocalStorage';

import {
    browserSupportsWebAuthn,
    platformAuthenticatorIsAvailable
} from '@simplewebauthn/browser';
import { useAuth } from './utils/dmpWebauthn/webauthn.context';



export const Fence: FunctionComponent = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const [credentials, setCredentials] = useLocalForage<Array<string>>('enrolledCredentials', []);

    // let component: JSX.Element | null = null;
    const [isWebauthAvailable, setIsWebauthAvailable] = useState<null | boolean>();
    const [isUserLogin, setIsUserLogin] = useState<boolean>(false);
    const { showRegistrationDialog, setShowRegistrationDialog, handleCancelRegistration} = useAuth();
    console.log('00000 showRegistrationDialog', showRegistrationDialog);
    const [component, setComponent] = useState<JSX.Element | null>(null);
    const [windowComponent, setwindowComponent] = useState<JSX.Element | null>(null);

    const [useWebauthn, setUseWebauthn] = useState<'register' | 'authenticate' | 'close'>('close');


    useEffect(() => {

        if (whoAmI.data !== null && whoAmI.data !== undefined) {
            setIsUserLogin(true);
        } else {
            setIsUserLogin(false);
        }
        console.log('credentials', credentials);
        console.log('isUserLogin', isUserLogin);

        if (credentials?.length === 0) {
            setUseWebauthn('register');
        } else {
            setUseWebauthn('authenticate');
        }
    }, [whoAmI.data, credentials]);


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


    // This useEffect handles what to show based on user login and webauthn status
    useEffect(() => {
        if (whoAmI.isLoading) {
            setComponent(<LoadSpinner />);
        } else if (whoAmI.isError) {
            setComponent(<p>Error: {whoAmI.error?.message}</p>);
        } else if (isUserLogin) {
            setComponent(
                <div className={css.app + ' dark_theme'}>
                    <MainMenuBar projects={[]} />
                    <MainPanel />
                    <StatusBar />
                </div>
            );
        } else {
            setComponent(<LoginBox />);
        }
    }, [whoAmI.isLoading, whoAmI.isError, isUserLogin]);


    useEffect(() => {
        if (isWebauthAvailable && !showRegistrationDialog) {
            try {
                if (isUserLogin && useWebauthn === 'register') {
                    setShowRegistrationDialog(true);

                } else if(!isUserLogin && useWebauthn === 'authenticate') {
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

    return (<Routes>
        {/* <Route path='/reset/:encryptedEmail/:token' element={<ResetPasswordPage />} /> */}
        {/* <Route path='/reset' element={<RequestResetPassword />} /> */}
        <Route path='/register' element={<RegisterNewUser />} />
        <Route path='/register_webauthn' element={<WebAuthnRegistrationComponent
            credentials={credentials} setCredentials={setCredentials}
            isUserLogin = {isUserLogin}
        />} />
        <Route path='/authenticate_webauthn' element={<WebAuthnAuthenticationComponent
            credentials={credentials} setCredentials={setCredentials}
            isUserLogin = {isUserLogin}/>
        } />
        {/* <Route path='*' element={component} /> */}
        <Route path='*' element={
            <>
                {component}
                {windowComponent}
            </>
        } />
    </Routes>
    );
};

export default Fence;
