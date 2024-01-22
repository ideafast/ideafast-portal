import React from 'react';
import { Tooltip } from 'antd';
import {
    CheckCircleOutlined,
    SyncOutlined, // This icon can spin
    PauseCircleOutlined,
    ExclamationCircleOutlined,
    StopOutlined,
    QuestionCircleOutlined
} from '@ant-design/icons';
import css from './lxd.module.css';

// Define your icon styles here. You can also import a CSS/LESS file if needed.
const iconStyle = { fontSize: '16px' };

const statusToIcon = {
    Running: <CheckCircleOutlined style={{ color: 'green', ...iconStyle }} />,
    Stopped: <StopOutlined style={{ color: 'red', ...iconStyle }} />,
    Starting: <SyncOutlined spin style={{ color: 'orange', ...iconStyle }} />,
    Stopping: <PauseCircleOutlined style={{ color: 'orange', ...iconStyle }} />,
    Error: <ExclamationCircleOutlined style={{ color: 'red', ...iconStyle }} />,
    // ... other statuses
    default: <QuestionCircleOutlined style={{ color: 'gray', ...iconStyle }} />
};

const InstanceStatusIcon = ({ status }) => {
    const IconComponent = statusToIcon[status] || statusToIcon.default;
    return (
        <Tooltip title={`Status: ${status}`}>
            {/* If the status is 'Starting', the spinning class will be applied */}
            <span className={status === 'Starting' ? css.icon_spinning : ''}>
                {IconComponent}
            </span>
        </Tooltip>
    );
};

export default InstanceStatusIcon;
