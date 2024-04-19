import { FunctionComponent, useState } from 'react';
import css from './domains.module.css';
import { trpc } from '../../utils/trpc';
import { List, Table, Image, ColorPicker, Button, Modal, Form, Input, Upload, notification } from 'antd';
import LoadSpinner from '../reusable/loadSpinner';
import { RcFile, UploadChangeParam, UploadFile } from 'antd/es/upload';
import { DeleteOutlined, InboxOutlined, SmileOutlined } from '@ant-design/icons';


export const DomainSection: FunctionComponent = () => {
    const getDomains = trpc.domain.getDomains.useQuery({});
    const [api, contextHolder] = notification.useNotification();
    const deleteDomain = trpc.domain.deleteDomain.useMutation({
        onSuccess: (() => {
            api.open({
                message: 'Domain has been deleted',
                description: '',
                duration: 10,
                icon: <SmileOutlined style={{ color: '#108ee9' }} />
            });
        })
    });
    if (getDomains.isLoading) {
        return <LoadSpinner />;
    }
    if (getDomains.isError) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }

    const columns: any[] = [{
        title: 'Name',
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
        render: (__unused__value, record) => {
            return <div>{record.name}</div>;
        }
    }, {
        title: 'Path',
        dataIndex: 'path',
        key: 'path',
        ellipsis: true,
        render: (__unused__value, record) => {
            return <div>{record.domainPath}</div>;
        }
    }, {
        title: 'Logo',
        dataIndex: 'logo',
        key: 'logo',
        render: (__unused__value, record) => {
            return <div><Image
                width={200}
                src={record.logo ? `${window.location.origin}/file/${record.logo}` : undefined}
            /></div>;
        }
    }, {
        title: 'Color',
        dataIndex: 'color',
        key: 'color',
        ellipsis: true,
        render: (__unused__value, record) => {
            return <div><ColorPicker defaultValue={record.color} disabled={true} /></div>;
        }
    }, {
        render: (__unused__value, record) => {
            return <DeleteOutlined onClick={() => deleteDomain.mutate({ domainId: record.id })} />;
        }
    }];

    return (<div className={css.page_container}>
        {contextHolder}
        <List
            header={
                <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div className={css['overview-icon']}></div>
                            <div>List of Domains</div>
                        </div>
                    </div>
                    <div>
                        <DomainCreation />
                    </div>
                </div>
            }
        >
            <Table
                dataSource={getDomains.data}
                columns={columns}
            >

            </Table>
        </List>
    </div>);
};

export const DomainCreation: FunctionComponent = () => {
    const [isModalOn, setIsModalOn] = useState<boolean>(false);
    const [domainColor, setDomainColor] = useState<string>('#FFFFFF');
    const [form] = Form.useForm();
    const [fileList, setFileList] = useState<Blob[]>([]);
    const [api, contextHolder] = notification.useNotification();
    const createDomain = trpc.domain.createDomain.useMutation({
        onSuccess: (() => {
            api.open({
                message: 'Domain has been created',
                description: '',
                duration: 10,
                icon: <SmileOutlined style={{ color: '#108ee9' }} />
            });
            setIsModalOn(false);
        })
    });


    return (<div>
        {contextHolder}
        <Button onClick={() => setIsModalOn(true)}>Create</Button>
        <Modal
            open={isModalOn}
            onOk={async () => {
                if (fileList.length > 0) {
                    const fileData = fileList[0];
                    const formData = new FormData();
                    formData.append('file', fileData);

                    const response = await fetch('/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();
                    if (response.ok) {
                        createDomain.mutate({
                            domainName: form.getFieldValue('domainName'),
                            domainPath: form.getFieldValue('domainPath'),
                            profile: [{
                                path: data.filePath, // This should be the path returned by the server
                                filename: fileData.name,
                                mimetype: fileData.type,
                                size: fileData.size
                            }]
                        });
                    } else {
                        // Handle upload error
                        console.error('File upload failed:', data);
                    }
                }
            }}
            onCancel={() => setIsModalOn(false)}
        >
            <Form
                form={form}
                layout='vertical'
            >
                <Form.Item
                    name="domainName"
                    label="Domain Name"
                    rules={[{ required: true }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name="domainPath"
                    label="Domain Path"
                    rules={[{ required: true }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name='Domain Logo'
                >
                    <Upload.Dragger
                        multiple={false}
                        showUploadList={true}
                        beforeUpload={async () => {
                            return false;
                        }}
                        onChange={(info: UploadChangeParam<UploadFile>) => {
                            // Filter out any items that do not have originFileObj
                            const validFiles: RcFile[] = info.fileList
                                .map(item => item.originFileObj)
                                .filter((file): file is RcFile => !!file);

                            setFileList(validFiles);
                        }}
                        onRemove={() => setFileList([])}
                    >
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined style={{ color: '#009688', fontSize: 48 }} />
                        </p>
                        <p className="ant-upload-text" style={{ fontSize: 16, color: '#444' }}>
                            Drag domain logo here
                        </p>
                    </Upload.Dragger>
                </Form.Item>
                <Form.Item
                    name="color"
                    label="Domain Color"
                    rules={[{ required: false }]}
                >
                    <ColorPicker defaultValue={domainColor ?? '#FFFFFF'} onChange={(_, hex) => setDomainColor(hex)} />
                </Form.Item>
            </Form>
        </Modal>
    </div>);
};
