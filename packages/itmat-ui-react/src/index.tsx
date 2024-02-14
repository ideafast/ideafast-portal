import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import registerServiceWorker, { unregister as unregisterServiceWorker } from './registerServiceWorker';
import { trpc } from './utils/trpc';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';

const AppWithTRPC = () => {
    const [queryClient] = useState(() => new QueryClient());
    const [trpcClient] = useState(() =>
        trpc.createClient({
            links: [
                httpBatchLink({
                    url: `${window.location.origin}/trpc`,
                    async headers() {
                        return {
                            // Add any headers if necessary
                            authorization: document.cookie
                        };
                    }
                })
            ]
        })
    );
    return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>
        </trpc.Provider>
    );
};

const mountApp = () => {
    const container = document.getElementById('root');
    if (!container)
        return;

    const root = createRoot(container);
    root.render(
        <StrictMode>
            <AppWithTRPC />
        </StrictMode>
    );
};

mountApp();
registerServiceWorker();

declare const module: any;
if (module.hot) {
    module.hot.accept('./index', mountApp);
    module.hot.accept('./App', mountApp);
    module.hot.accept('./registerServiceWorker', () => {
        unregisterServiceWorker();
        registerServiceWorker();
    });
}
