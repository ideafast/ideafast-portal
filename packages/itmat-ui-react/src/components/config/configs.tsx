import { enumConfigType } from '@itmat-broker/itmat-types';
import { Form, Input, List } from 'antd';
import { FunctionComponent } from 'react';
import { trpc } from '../../utils/trpc';
import LoadSpinner from '../reusable/loadSpinner';
import css from './configs.module.css';

export const ConfigSection: FunctionComponent = () => {
    const [form] = Form.useForm();
    const getSystemConfig = trpc.config.getConfig.useQuery({ configType: enumConfigType.SYSTEMCONFIG, key: null, useDefault: true });
    if (getSystemConfig.isLoading) {
        return <LoadSpinner />;
    }
    if (getSystemConfig.isError) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }
    const systemConfig = getSystemConfig.data.properties;
    return (<div className={css.page_container}>
        <List
            header={
                <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div className={css['overview-icon']}></div>
                            <div>List of Organisations</div>
                        </div>
                    </div>
                </div>
            }
        >
            <Form
                form={form}
                layout='horizontal'
                initialValues={systemConfig}
            >
                <Form.Item name="defaultBackgroundColor" label="Default Background Color" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
                <Form.Item name="defaultMaximumFileSize" label="Default Maximum File Size (Bytes)" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
                <Form.Item name="archiveAddress" label="Archieve Address">
                    <Input />
                </Form.Item>
                <Form.Item name="defaultUserExpireDays" label="Default User Expire Days" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
                <Form.Item name="systemTokenId" label="System Token Id" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
            </Form>
        </List>
    </div>);
};

