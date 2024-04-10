/**
 * LXD related types
 */

interface LxdInstanceUsageProp {
  usage: number;
}

interface LxdInstanceMemory {
  swap_usage: number;
  swap_usage_peak: number;
  usage: number;
  usage_peak: number;
}

interface LxdInstanceNetworkAddress {
  address: string;
  family: string;
  netmask: string;
  scope: string;
}

interface LxdInstanceNetworkCounters {
  bytes_received: number;
  bytes_sent: number;
  errors_received: number;
  errors_sent: number;
  packets_dropped_inbound: number;
  packets_dropped_outbound: number;
  packets_received: number;
  packets_sent: number;
}

interface LxdInstanceNetwork {
  addresses: LxdInstanceNetworkAddress[];
  counters: LxdInstanceNetworkCounters;
  host_name: string;
  hwaddr: string;
  mtu: number;
  state: 'up' | 'down';
  type: string;
}

export interface LXDInstanceState {
  cpu: LxdInstanceUsageProp;
  disk: {
    root: LxdInstanceUsageProp;
  } & Record<string, LxdInstanceUsageProp>;
  memory: LxdInstanceMemory;
  network?: Record<string, LxdInstanceNetwork>;
  pid: number;
  processes: number;
  status: string;
}
