import { FunctionComponent, PropsWithChildren } from 'react';
import { ApolloProvider } from '@apollo/client';
import { BrowserRouter as Router } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { client } from './components/apolloClient';
import { trpc } from './utils/trpc';
import LoadSpinner from './components/reusable/loadSpinner';

const Providers: FunctionComponent<PropsWithChildren<unknown>> = ({ children }) => {
    const getSubPath = trpc.tool.getCurrentSubPath.useQuery();

    if (getSubPath.isLoading) {
        return <LoadSpinner />;
    }
    if (getSubPath.isError) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }
    return <ApolloProvider client={client}>
        <HelmetProvider>
            <Router basename={getSubPath.data ?? '/'}>
                {children}
            </Router>
        </HelmetProvider>
    </ApolloProvider>;
};

export default Providers;
