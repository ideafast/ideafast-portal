import { FunctionComponent, useState } from 'react';
import LoadSpinner from '../reusable/loadSpinner';
// import { ProjectSection } from '../users/projectSection';
import { Form, Input, Select, Typography, Upload, List, Table, Button, Modal, message } from 'antd';
import css from './organisations.module.css';
import 'react-quill/dist/quill.snow.css';
import { stringCompareFunc } from '../../utils/tools';
import { trpc } from '../../utils/trpc';
import { RcFile, UploadChangeParam, UploadFile } from 'antd/es/upload';
import { InboxOutlined } from '@ant-design/icons';
const { Title } = Typography;

const { Option } = Select;

export const OrganisationSection: FunctionComponent = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getOrganisations = trpc.org.getOrganisations.useQuery({});
    const getUsers = trpc.user.getUsers.useQuery({});
    const [mode, setMode] = useState<string | null>(null);
    const createOrganisation = trpc.org.createOrganisation.useMutation({
        onSuccess: () => {
            message.success('Organisation created.');
        },
        onError: () => {
            message.error('Failed to create this organisation.');
        }
    });
    const editOrganisation = trpc.org.editOrganisation.useMutation({
        onSuccess: () => {
            message.success('Organisation edited.');
        },
        onError: () => {
            message.error('Failed to edit this organisation.');
        }
    });
    const deleteOrganisation = trpc.org.deleteOrganisation.useMutation({
        onSuccess: () => {
            message.success('Organisation deleted.');
        },
        onError: () => {
            message.error('Failed to delete this organisation.');
        }
    });
    const [form] = Form.useForm();
    if (whoAmI.isLoading || getOrganisations.isLoading || getUsers.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (whoAmI.isError || getOrganisations.isError || getUsers.isError) {
        return <>
            An error occured.
        </>;
    }

    const columns: any[] = [{
        title: 'Organisation',
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
        sorter: (a, b) => { return stringCompareFunc(a.name, b.name); },
        render: (__unused__value, record) => {
            return (
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '15px' }}>
                    <img
                        src={record.profile ? `${window.location.origin}/file/${record.profile}` : undefined}
                        alt={''}
                        style={{ width: '50px', height: '50px', marginRight: '10px' }} // Adjust the size as needed
                    />
                    {record.name}
                </div>
            );
        }
    }, {
        title: 'Users',
        dataIndex: 'numOfUsers',
        key: 'numOfUsers',
        ellipsis: true,
        sorter: (a, b) => { return getUsers.data.filter(el => el.organisation === a.id).length - getUsers.data.filter(el => el.organisation === b.id).length; },
        render: (__unused__value, record) => {
            return getUsers.data.filter(el => el.organisation === record.id).length;
        }
    }, {
        title: '',
        dataIndex: 'delete',
        key: 'delete',
        ellipsis: true,
        render: (__unused__value, record) => {
            return <Button onClick={() => {
                deleteOrganisation.mutate({
                    organisationId: record.id
                });
            }}>Delete</Button>;
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
                                <div>List of Organisations</div>
                            </div>
                        </div>
                        <div>
                            <Button onClick={() => {
                                setMode('create');
                                form.setFieldsValue({
                                    name: undefined,
                                    shortname: undefined,
                                    latitude: undefined,
                                    longitude: undefined,
                                    profile: undefined
                                });
                            }}>Create</Button>
                            <Button onClick={() => {
                                setMode('edit');
                                form.setFieldsValue({
                                    name: undefined,
                                    shortname: undefined,
                                    latitude: undefined,
                                    longitude: undefined,
                                    profile: undefined
                                });
                            }}>Edit</Button>
                        </div>
                    </div>
                }
            >
                <Modal
                    open={mode !== null}
                    onCancel={() => {
                        setMode(null);
                        form.setFieldsValue({
                        });
                    }}
                    onOk={async () => {
                        console.log(form.getFieldsValue());
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
                        if (values.id) {
                            editOrganisation.mutate({
                                organisationId: values.id,
                                name: values.name ?? undefined,
                                location: (values.latitude && values.longitude) ? [parseFloat(values.latitude), parseFloat(values.longitude)] : undefined,
                                shortname: values.shortname ?? undefined,
                                profile: profile
                            });
                        } else {
                            createOrganisation.mutate({
                                name: values.name ?? undefined,
                                location: (values.latitude && values.longitude) ? [parseFloat(values.latitude), parseFloat(values.longitude)] : undefined,
                                shortname: values.shortname ?? undefined,
                                profile: profile
                            });
                        }
                    }}
                >
                    <div className={css.org_map}>
                        <Form
                            form={form}
                        >
                            {
                                mode === 'edit' ?
                                    <Form.Item
                                        name='id'
                                        label='Select Organisation'
                                    >
                                        <Select
                                            placeholder='Select an organisation'
                                            showSearch={true}
                                            filterOption={(input, option) =>
                                                (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())
                                            }
                                            onChange={(value) => {
                                                const org = getOrganisations.data.filter(el => el.id === value)[0];
                                                form.setFieldsValue({
                                                    id: org.id,
                                                    name: org.name,
                                                    shortname: org.shortname,
                                                    latitude: org.location ? org.location[0] : null,
                                                    longitude: org.location ? org.location[1] : null,
                                                    profile: undefined
                                                });
                                            }}
                                        >
                                            {
                                                getOrganisations.data.map(el => <Option value={el.id} label={el?.name}>{el?.name?.toString()}</Option>)
                                            }
                                        </Select>
                                    </Form.Item> : null
                            }

                            <Form.Item
                                name='name'
                                label='Name'
                                rules={[
                                    {
                                        required: true
                                    }
                                ]}
                            >
                                <Input placeholder='Input new name' />
                            </Form.Item>
                            <Form.Item
                                name='shortname'
                                label='Short Name'
                            >
                                <Input placeholder='Input new shortname' />
                            </Form.Item>
                            <Form.Item
                                name='latitude'
                                label='Latitude'
                                rules={[
                                    {
                                        required: false,
                                        message: 'Please input the latitude as a number',
                                        pattern: new RegExp(/^[+-]?([0-9]*[.])?[0-9]+$/)
                                    }
                                ]}
                            >
                                <Input placeholder='Input latitude' />
                            </Form.Item>
                            <Form.Item
                                name='longitude'
                                label='Longtitude'
                                rules={[
                                    {
                                        required: false,
                                        message: 'Please input the longitude as a number',
                                        pattern: new RegExp(/^[+-]?([0-9]*[.])?[0-9]+$/)
                                    }
                                ]}
                            >
                                <Input placeholder='Input longitude' />
                            </Form.Item>
                            <Form.Item
                                name='profile'
                                label='Profile'
                            >
                                <Upload.Dragger
                                    multiple={false}
                                    showUploadList={true}
                                    beforeUpload={async (file: RcFile) => {
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
                        </Form>
                    </div>
                </Modal>
                <List.Item>
                    <div className={css.org_list}>
                        <Table
                            columns={columns}
                            dataSource={getOrganisations.data}
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
            </List >
        </div >

    );
};

