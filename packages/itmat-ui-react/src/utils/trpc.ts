import { createTRPCReact } from '@trpc/react-query';

// eslint-disable-next-line @nx/enforce-module-boundaries
import type { AppRouter } from '../../../itmat-interface/src/server/router';

export const trpc = createTRPCReact<AppRouter>();