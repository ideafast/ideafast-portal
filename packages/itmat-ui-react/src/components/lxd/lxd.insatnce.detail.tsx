import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Descriptions, Badge, Spin } from 'antd';
import { LxdInstance } from './types/instance'; // Adjust the import path as necessary

type InstanceDetails = LxdInstance

// Helper function to fetch instance state including network info
const fetchInstanceState = async (name) => {
    try {
        const response = await axios.get(`http://localhost:3333/lxd/1.0/instances/${name}/state`);
        return response.data.metadata.network; // Assuming 'network' contains the network details
    } catch (error) {
        console.error('Failed to fetch instance state:', error);
    }
};

const InstanceOverview = ({ instanceName }) => {
    const [instanceDetails, setInstanceDetails] = useState<InstanceDetails | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                setLoading(true);
                // Fetch the instance details
                const detailsResponse = await axios.get(`http://localhost:3333/lxd/1.0/instances/${instanceName}`);
                const details = detailsResponse.data.metadata;

                // Fetch the instance state including network info
                const state = await fetchInstanceState(instanceName);

                // Combine details and state into one object
                setInstanceDetails({ ...details, network: state });
            } catch (error) {
                console.error('Failed to fetch instance details:', error);
            } finally {
                setLoading(false);
            }
        };

        if (instanceName) {
            fetchDetails();
        }
    }, [instanceName]);

    if (loading) {
        return <Spin />;
    }

    // Extract the first IPv4 address from the network.eth0.addresses array
    const ipv4Address = instanceDetails?.network?.eth0?.addresses
        .filter(addr => addr.family === 'inet')
        .map(addr => addr.address)[0] || 'N/A';

    return (
        <div>
            {instanceDetails ? (
                <Descriptions title="Instance Overview" bordered column={1}>
                    <Descriptions.Item label="Name">{instanceDetails.name}</Descriptions.Item>
                    <Descriptions.Item label="Status">
                        <Badge status={instanceDetails.status === 'Running' ? 'success' : 'error'} text={instanceDetails.status} />
                    </Descriptions.Item>
                    <Descriptions.Item label="IPv4">{ipv4Address}</Descriptions.Item>
                    <Descriptions.Item label="Architecture">{instanceDetails.architecture}</Descriptions.Item>
                    <Descriptions.Item label="Created At">{instanceDetails.created_at}</Descriptions.Item>
                    {/* Add more Descriptions.Items for additional details such as memory usage, disk usage etc. */}
                </Descriptions>
            ) : (
                <p>No details available</p>
            )}
        </div>
    );
};

export default InstanceOverview;
