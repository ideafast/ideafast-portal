import { FunctionComponent, PropsWithChildren } from 'react';
import { ApolloProvider } from '@apollo/client';
import { BrowserRouter as Router } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { client } from './components/apolloClient';

const Providers: FunctionComponent<PropsWithChildren<unknown>> = ({ children }) => {
    const determineBasePath = () => {
        // Example logic to determine the base path
        const pathSegments = window.location.pathname.split('/');
        // Assuming your base path is always immediately after the host
        const basePath = pathSegments.length > 1 ? `/${pathSegments[1]}` : '/';
        return basePath;
    };
    return <ApolloProvider client={client}>
        <HelmetProvider>
            <Router basename={determineBasePath() ?? '/'}>
                {children}
            </Router>
        </HelmetProvider>
    </ApolloProvider>;
};

export default Providers;
