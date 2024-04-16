import React, { useState } from 'react';
import { Button, Form, Input, message, Select } from 'antd';
import axios from 'axios';

const { Option } = Select;

const pollOperation = async (operationUrl: string): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
            try {
                const opResponse = await axios.get(`http://localhost:3333${operationUrl}`);
                const opData = opResponse.data;

                if (opData.metadata.status === 'Success') {
                    clearInterval(interval);
                    resolve(); // No value is being passed here
                } else if (opData.metadata.status === 'Failure') {
                    clearInterval(interval);
                    reject(new Error('Operation failed'));
                }
                // Add more conditions as necessary based on the LXD API
            } catch (error) {
                clearInterval(interval);
                reject(error);
            }
        }, 2000); // Poll every 2 seconds. Adjust timing as needed.
    });
};


const CreateInstance = ({ onInstanceCreated }) => {
    const [isCreating, setIsCreating] = useState(false);

    // const backendEndpoint = 'http://localhost:3333/lxd/1.0/instances';
    const backendEndpoint = 'http://localhost:3333/api/lxd';

    const onFinish = async (values) => {
        setIsCreating(true);
        try {
            // Construct the payload according to LXD API requirements
            const payload = {
                name: values.instanceName,
                architecture: 'x86_64',
                config: {
                    'limits.cpu': '2',
                    'limits.memory': '2GB'
                },
                // Assume 'image' contains the alias of the image you want to use
                source: {
                    type: 'image',
                    // alias: values.baseImage
                    fingerprint: '9a5b716ae7ae'
                },
                profiles: [values.profile],
                type: values.instanceType
                // Add other fields as required by your application
            };


            console.log('start create post >>>>');

            const response = await axios.post(`${backendEndpoint}/instances/create`, payload);

            console.log('finished create post >>>>', response);

            if (response.status === 202) {
                const operationUrl = response.data.operation;
                await pollOperation(operationUrl);
                onInstanceCreated();
                message.success('Instance created successfully!');
            } else if (response.status === 200) {
                onInstanceCreated();
                message.success('Instance created successfully!');
            } else {
                throw new Error('Failed to create instance.');
            }
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'An unknown error occurred';
            message.error('Failed to create instance: ' + messageText);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <Form
            name="create_instance"
            onFinish={onFinish}
        >
            <Form.Item
                name="instanceName"
                rules={[{ required: true, message: 'Please input the instance name!' }]}
            >
                <Input placeholder="Instance Name" />
            </Form.Item>
            <Form.Item
                name="baseImage"
                rules={[{ required: true, message: 'Please select a base image!' }]}
            >
                <Select placeholder="Select a base image">
                    {/* Options should be populated with available images */}
                    <Option value="ubuntu/20.04">Ubuntu 20.04</Option>
                    {/* Add more <Option> elements here */}
                </Select>
            </Form.Item>
            <Form.Item
                name="instanceType"
                rules={[{ required: true, message: 'Please select an instance type!' }]}
            >
                <Select placeholder="Select instance type">
                    <Option value="container">Container</Option>
                    <Option value="virtual-machine">Virtual Machine</Option>
                </Select>
            </Form.Item>
            <Form.Item
                name="profile"
                initialValue="default"
            >
                <Select placeholder="Select profile">
                    <Option value="default">Default</Option>
                    {/* Add more <Option> elements here based on available profiles */}
                </Select>
            </Form.Item>
            {/* Add more fields as required */}
            <Form.Item>
                <Button type="primary" htmlType="submit" loading={isCreating}>
                    Create
                </Button>
            </Form.Item>
        </Form>
    );
};

export default CreateInstance;
