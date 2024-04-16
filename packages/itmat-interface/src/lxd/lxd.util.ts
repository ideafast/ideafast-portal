import * as lxdType from './lxd.type';

// Format CPU information
export const formatCPUInfo = (cpu: lxdType.CpuInfo) => {
    const coreCount = cpu.sockets.reduce((acc, socket) => acc + socket.cores.length, 0);
    return `CPU: ${cpu.total} Socket(s), ${coreCount} Core(s) Total, Architecture: ${cpu.architecture}`;
};

// Format Memory information
export const formatMemoryInfo = (memory: lxdType.MemoryInfo) => {
    return `Total Memory: ${formatBytes(memory.total)}, Used: ${formatBytes(memory.used)}, Free: ${formatBytes(memory.total - memory.used)}`;
};

// Format Storage information
export const formatStorageInfo = (storage: lxdType.StorageInfo) => {
    const totalSize = storage.disks.reduce((acc, disk) => acc + disk.size, 0);

    return `Storage: ${storage.total} Disk(s), Total Size: ${formatBytes(totalSize)}`;
};


export const formatGPUInfo = (gpu: lxdType.GpuInfo) => {
    return `GPU: ${gpu.total} Card(s)`;
};

export const formatNetworkInfo = (network: lxdType.NetworkInfo) => {
    return `Network: ${network.total} Card(s)`;
};

export const formatPCIInfo = (pci: lxdType.PciInfo) => {
    return `PCI: ${pci.total} Device(s)`;
};

// Helper function to format bytes into a more readable format
export function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


// Helper function to deeply merge two objects, including arrays and nested objects
export function deepMerge(obj1: Record<string, any>, obj2: Record<string, any>): Record<string, any> {
    // Recursively merge objects and arrays
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
        return [...obj1, ...obj2];
    } else if (obj1 != null && typeof obj1 === 'object' && obj2 != null && typeof obj2 === 'object') {
        const result: Record<string, any> = { ...obj1 };
        for (const [key, value] of Object.entries(obj2)) {
            result[key] = key in obj1 ? deepMerge(obj1[key], value) : value;
        }
        return result;
    }
    // Values are not arrays or objects, so override with obj2's value
    return obj2;
}