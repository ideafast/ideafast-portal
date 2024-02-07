// IntervalPicker.tsx
import React from 'react';
import { Form, InputNumber } from 'antd';

const IntervalPicker = () => {
    return (
        <>
            <Form.Item name="days" label="Days">
                <InputNumber min={0} placeholder="Days" />
            </Form.Item>
            <Form.Item name="hours" label="Hours">
                <InputNumber min={0} max={23} placeholder="Hours" />
            </Form.Item>
            <Form.Item name="minutes" label="Minutes">
                <InputNumber min={0} max={59} placeholder="Minutes" />
            </Form.Item>
            <Form.Item name="seconds" label="Seconds">
                <InputNumber min={0} max={59} placeholder="Seconds" />
            </Form.Item>
        </>
    );
};

export default IntervalPicker;
