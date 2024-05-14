import { createTRPCProxyClient,  httpBatchLink } from '@trpc/client';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { AppRouter } from '../../../itmat-interface/src/server/router'; // Import the router type from the DMP backend
import config from './configManager';

// Function to create a tRPC client with dynamic headers
function createClientWithHeaders(instanceToken: string) {
    const trpcClient = createTRPCProxyClient<AppRouter>({
        links: [
            httpBatchLink({
                url: `${config.dmpEndpoint}/trpc`,
                headers: {
                    Authorization: instanceToken
                }
            })
        ]
    });
    return trpcClient;
}

export { createClientWithHeaders };