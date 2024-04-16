export interface CpuSocket {
    name: string;
    cores: Array<{
      core: number;
      frequency: number;
      threads: Array<{
        id: number;
        isolated: boolean;
        numa_node: number;
        online: boolean;
        thread: number;
      }>;
    }>;
    frequency: number;
  }

export interface CpuInfo {
    architecture: string;
    total: number;
    sockets: CpuSocket[];
  }

export interface MemoryInfo {
    total: number;
    used: number;
  }

export  interface Disk {
    model: string;
    size: number;
    type: string;
  }

export interface StorageInfo {
    total: number;
    disks: Disk[];
  }

export  interface GpuCard {
    product: string;
    vendor: string;
    driver: string;
    driver_version: string;
  }

export interface GpuInfo {
    total: number;
    cards: GpuCard[];
  }

export interface NetworkCardPort {
    address: string;
  }

export interface NetworkCard {
    product: string;
    vendor: string;
    driver: string;
    ports: NetworkCardPort[];
  }

export interface NetworkInfo {
    total: number;
    cards: NetworkCard[];
  }

export interface PciDevice {
    product: string;
    vendor: string;
    pci_address: string;
  }

export interface PciInfo {
    total: number;
    devices: PciDevice[];
  }
