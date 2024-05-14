import {LxdConfiguration} from '@itmat-broker/itmat-types';

// sanitized the update playload
export const sanitizeUpdatePayload = (payload: LxdConfiguration) => {
    const sanitizedPayload: LxdConfiguration = { ...payload };

    // Check if config property exists
    if (sanitizedPayload.config) {
        // Check if limits property exists
        if ('limits.cpu' in sanitizedPayload.config) {
            // Check and format CPU limit
            sanitizedPayload.config['limits.cpu'] = sanitizeCpuLimit(sanitizedPayload.config['limits.cpu']);

        }
        // Check and format memory limit
        if ('limits.memory' in sanitizedPayload.config) {
            sanitizedPayload.config['limits.memory'] = sanitizeMemoryLimit(sanitizedPayload.config['limits.memory']);
        }
    }

    return sanitizedPayload;
};

// Sanitize CPU limit
const sanitizeCpuLimit = (cpuLimit: string): string => {
    return cpuLimit ? cpuLimit.toString() : '2'; // Default to '2' if not provided
};

// Sanitize memory limit
const sanitizeMemoryLimit = (memoryLimit: string): string => {
    return memoryLimit ? memoryLimit.toString() : '4GB'; // Default to '4GB' if not provided
};