import LoadSpinner from '../reusable/loadSpinner';
import { Button, Form, Input, List, Modal, Table, Upload, message } from 'antd';
import css from './dataset.module.css';
import React from 'react';
import 'react-quill/dist/quill.snow.css';
import { Link } from 'react-router-dom';
import { trpc } from '../../utils/trpc';
import generic from '../../assets/generic.png';
import { stringCompareFunc } from '../../utils/tools';
import { RcFile, UploadChangeParam, UploadFile } from 'antd/es/upload';
import { InboxOutlined } from '@ant-design/icons';

export const DatasetSection: React.FunctionComponent = () => {
    const getStudies = trpc.study.getStudies.useQuery({});

    if (getStudies.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }

    if (getStudies.isError) {
        return <>An error occurred.</>;
    }

    const columns: any[] = [{
        title: 'Domain/Tag',
        dataIndex: 'domain',
        key: 'domain',
        width: '20%',
        ellipsis: true,
        sorter: (a, b) => { return stringCompareFunc(a.name, b.name); },
        render: (__unused__value, record) => {
            return <div>{record.domain}</div>;
        }
    }, {
        title: 'Dataset',
        dataIndex: 'name',
        key: 'name',
        width: '20%',
        ellipsis: true,
        sorter: (a, b) => { return stringCompareFunc(a.name, b.name); },
        render: (__unused__value, record) => {
            return (
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '15px' }}>
                    <img
                        src={record.profile ? `${window.location.origin}/file/${record.profile}` : generic}
                        alt={''}
                        style={{ width: '50px', height: '50px', marginRight: '10px' }} // Adjust the size as needed
                    />
                    {record.name}
                </div>
            );
        }
    }, {
        title: 'Descrition',
        dataIndex: 'description',
        key: 'description',
        width: '40%',
        ellipsis: true,
        render: (__unused__value, record) => {
            return <div>
                {record.description ?? ''}
            </div>;
        }
    }, {
        title: '',
        dataIndex: 'link',
        key: 'link',
        render: (__unused__value, record) => {
            return <Link to={`/datasets/${record.id}`}>Go to study</Link>;
        }
    }];

    return (
        <div className={css.page_container}>
            <List
                header={
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div className={css['overview-icon']}></div>
                                <div>List of Datasets</div>
                            </div>
                        </div>
                        <div>
                            <CreateDataset />
                        </div>
                    </div>
                }
            >
                <List.Item>
                    <div>
                        <Table
                            columns={columns}
                            dataSource={getStudies.data}
                            pagination={
                                {
                                    defaultPageSize: 50,
                                    showSizeChanger: true,
                                    pageSizeOptions: ['10', '20', '50', '100'],
                                    defaultCurrent: 1,
                                    showQuickJumper: true
                                }
                            }
                        />
                    </div>
                </List.Item>
            </List><br />
        </div>
    );
};

export const CreateDataset: React.FunctionComponent = () => {
    const createStudy = trpc.study.createStudy.useMutation({
        onSuccess: () => {
            message.success('Organisation created.');
        },
        onError: () => {
            message.error('Failed to create this organisation.');
        }
    });
    const [isModalOn, setIsModalOn] = React.useState(false);
    const [form] = Form.useForm();
    return <div>
        <Button onClick={() => setIsModalOn(true)}>Create</Button>
        <Modal
            open={isModalOn}
            onCancel={() => setIsModalOn(false)}
        >
            <Form
                form={form}
            >
                <Form.Item
                    name='name'
                    label='name'
                    rules={[
                        {
                            required: true,
                            message: 'Please input the name of the study'
                        }
                    ]}
                >
                    <Input placeholder='Input' />
                </Form.Item>
                <Form.Item
                    name='description'
                    label='description'
                    rules={[
                        {
                            required: false,
                            message: 'Please input the description of the study'
                        }
                    ]}
                >
                    <Input placeholder='Input' />
                </Form.Item>
                <Form.Item
                    name='profile'
                    label='Profile'
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
                            form.setFieldValue('profile', validFiles[0]);
                        }}
                        onRemove={() => form.setFieldValue('profile', [])}
                    >
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined style={{ color: '#009688', fontSize: 48 }} />
                        </p>
                        <p className="ant-upload-text" style={{ fontSize: 16, color: '#444' }}>
                            Drag files here or click to select files
                        </p>
                    </Upload.Dragger>
                </Form.Item>
                <Button onClick={async () => {
                    const values = form.getFieldsValue();
                    let profile: any = undefined;
                    if (values.profile) {
                        const fileData = values.profile;
                        const formData = new FormData();
                        formData.append('file', fileData);

                        const response = await fetch('/upload', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await response.json();
                        profile = response.ok ? [{
                            path: data.filePath,
                            filename: fileData.name,
                            mimetype: fileData.type,
                            size: fileData.size
                        }] : undefined;
                    }
                    createStudy.mutate({
                        name: values.name,
                        description: values.description,
                        profile: profile
                    });
                }} >Submit</Button>
            </Form>
        </Modal>
    </div>;
};

