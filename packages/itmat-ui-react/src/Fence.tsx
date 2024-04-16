import { FunctionComponent } from 'react';
// import { Query } from '@apollo/client/react/components';
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
    let component: JSX.Element | null = null;
    if (whoAmI.isLoading)
        component = <LoadSpinner />;
    else if (whoAmI.isError)
        component = <p>
            Error
            {' '}
            {whoAmI.error?.message}
        </p>;
    else if (whoAmI.data !== null && whoAmI.data !== undefined) {
        component = <div className={css.app + ' dark_theme'}>
            <MainMenuBar projects={[]} />
            <MainPanel />
            <StatusBar />
        </div>;
    } else
        component = <LoginBox />;
    return <Routes>
        <Route path='/reset/:encryptedEmail/:token' element={<ResetPasswordPage />} />
        <Route path='/reset' element={<RequestResetPassword />} />
        <Route path='/register' element={<RegisterNewUser />} />
        <Route path='*' element={component} />
    </Routes>;
};

export default Fence;
