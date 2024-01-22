import React, { useState } from 'react';
import { Button, Form, Input, message, Select } from 'antd';
import axios from 'axios';

const { Option } = Select;

const CreateInstance = ({ onInstanceCreated }) => {
    const [isCreating, setIsCreating] = useState(false);

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
                    alias: values.baseImage
                },
                profiles: [values.profile],
                type: values.instanceType
                // Add other fields as required by your application
            };

            const response = await axios.post('http://localhost:3333/lxd/1.0/instances', payload);

            if (response.status === 200 || response.status === 202) {
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
