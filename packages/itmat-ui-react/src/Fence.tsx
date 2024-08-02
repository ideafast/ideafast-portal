import { FunctionComponent } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LoginBox } from './components/login/login';
import { MainMenuBar } from './components/scaffold/mainMenuBar';
import { MainPanel } from './components/scaffold/mainPanel';
import css from './components/scaffold/scaffold.module.css';
import { ResetPasswordPage } from './components/login/resetPasswordPage';
import { RequestResetPassword } from './components/login/requestResetPasswordPage';
import { RegisterNewUser } from './components/login/register';
import LoadSpinner from './components/reusable/loadSpinner';
import { StatusBar } from './components/scaffold/statusBar';
import { trpc } from './utils/trpc';

export const Fence: FunctionComponent = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const recoverSession = trpc.user.recoverSessionExpireTime.useQuery(undefined, {
        refetchInterval: 60 * 60 * 1000
    });
    let component: JSX.Element | null = null;
    // Assume isLoading states are only true if the query is actively fetching data
    const isAnyLoading = whoAmI.isLoading;

    // Adjusted error handling to show errors immediately
    const hasError = whoAmI.isError || recoverSession.isError;
    const errorMessage = whoAmI.error?.message ?? '';

    // Decide what to display based on the loading and error states
    if (isAnyLoading) {
        component = <LoadSpinner />;
    } else if (hasError) {
        component = <p>Error {errorMessage}</p>;
    } else if (whoAmI.data) {
        // Render main content if user data is available
        component = <div className={css.app + ' dark_theme'}>
            <MainMenuBar />
            <MainPanel />
            <StatusBar />
        </div>;
    } else {
        component = <LoginBox />;
    }

    return (
        <Routes>
            <Route path='/reset/:encryptedEmail/:token' element={<ResetPasswordPage />} />
            <Route path='/reset' element={<RequestResetPassword />} />
            <Route path='/register' element={<RegisterNewUser />} />
            <Route path='*' element={component} />
        </Routes>
    );

};

export default Fence;
