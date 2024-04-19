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
import { DomainSelectionBox } from './components/domainSelection/domainSelection';

export const Fence: FunctionComponent = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getSubPath = trpc.tool.getCurrentSubPath.useQuery();
    const getDomains = trpc.domain.getDomains.useQuery({ domainPath: getSubPath.data }, {
        enabled: !!getSubPath.data
    });
    let component: JSX.Element | null = null;
    // Assume isLoading states are only true if the query is actively fetching data
    const isAnyLoading = whoAmI.isLoading || getSubPath.isLoading || (getDomains.isLoading && getSubPath.data);

    // Adjusted error handling to show errors immediately
    const hasError = whoAmI.isError || getSubPath.isError || getDomains.isError;
    const errorMessage = whoAmI.error?.message ?? '' + getSubPath.error?.message ?? '' + getDomains.error?.message ?? '';

    // Decide what to display based on the loading and error states
    if (isAnyLoading) {
        component = <LoadSpinner />;
    } else if (hasError) {
        component = <p>Error {errorMessage}</p>;
    } else if (whoAmI.data) {
        // Render main content if user data is available
        component = <div className={css.app + ' dark_theme'}>
            <MainMenuBar projects={[]} />
            <MainPanel />
            <StatusBar />
        </div>;
    } else if (getSubPath.data === '') {
        component = <DomainSelectionBox />;
    } else if (getSubPath.data) {
        component = <LoginBox />;
    }

    return (
        <Routes>
            <Route path='/reset/:encryptedEmail/:token' element={<ResetPasswordPage />} />
            <Route path='/reset' element={<RequestResetPassword />} />
            <Route path='/register' element={<RegisterNewUser />} />
            <Route path='*' element={component} />
            {
                (getDomains.data ?? []).filter(el => el.domainPath !== 'main').map(
                    el => <Route path={`/${el.domainPath}`} element={<LoginBox />} />
                )
            }
        </Routes>
    );

};

export default Fence;
