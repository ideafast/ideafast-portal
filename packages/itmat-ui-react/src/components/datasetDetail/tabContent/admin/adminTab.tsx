import { FunctionComponent, useState } from 'react';
import { Button, Checkbox, Form, Input, List, Modal, Select, Table } from 'antd';
// eslint-disable-next-line @nx/enforce-module-boundaries
import css from './admin.module.css';
import { enumStudyRoles } from '@itmat-broker/itmat-types';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';

const { Option } = Select;

export const AdminTabContent: FunctionComponent<{ studyId: string }> = ({ studyId }) => {
    return (<div className={css.page_container}>
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
                        <CreateRoleTab studyId={studyId} />
                    </div>
                </div>
            }
        >
            {/* <Table
                dataSource={getDomains.data}
                columns={columns}
            >

            </Table> */}
        </List>
    </div>);
};

export const CreateRoleTab: FunctionComponent<{ studyId: string }> = () => {
    const [isModalOn, setIsModalOn] = useState<boolean>(false);
    const [form] = Form.useForm();
    return (<div>
        <Button onClick={() => setIsModalOn(true)}>Create</Button>
        <Modal
            open={isModalOn}
            onOk={async () => {
                return;
            }}
            width={'90%'}
            onCancel={() => setIsModalOn(false)}
        >
            <Form
                form={form}
                layout='vertical'
            >
                <Form.Item
                    name="name"
                    label="Role Name"
                    rules={[{ required: true }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name="description"
                    label="Description"
                    rules={[{ required: false }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name="studyRole"
                    label="Study Role"
                    rules={[{ required: true }]}
                >
                    <Select>
                        {
                            Object.keys(enumStudyRoles).map(el => <Option value={enumStudyRoles[el]}>{el}</Option>)
                        }
                    </Select>
                </Form.Item>
                <Form.List name="dataPermissions">
                    {(dataPermissions, { add, remove }) => {
                        return (
                            <DataPermissionFormList dataPermissions={dataPermissions} add={add} remove={remove} />
                        );
                    }}
                </Form.List>
            </Form>
        </Modal>
    </div>);
};


export const DataPermissionFormList: FunctionComponent<{ dataPermissions: any[], add: any, remove: any }> = ({ dataPermissions, add, remove }) => {
    const propertyColumns: any = [{
        title: 'Property Name',
        dataIndex: 'propertyName',
        key: 'propertyName',
        minWidth: 200,
        render: (index) => {
            return (<Form.Item name={[index, 'propertyName']}>
                <Input />
            </Form.Item>
            );
        }
    }, {
        title: 'Property Values',
        dataIndex: 'propertyValues',
        key: 'propertyValues',
        minWidth: 200,
        render: (index) => {
            return (<Form.Item name={[index, 'propertyValues']}>
                <Select
                    mode='tags'
                >
                </Select>
            </Form.Item>
            );
        }
    }];

    const columns: any = [{
        title: 'Include unversioned data',
        dataIndex: 'includeUnversioned',
        key: 'includeUnversioned',
        width: '10%',
        render: (index) => {
            return (<Form.Item name={[index, 'includeUnversioned']}>
                <Checkbox
                />
            </Form.Item>
            );
        }
    }, {
        title: <div>Property </div>,
        dataIndex: 'property',
        key: 'property',
        width: '50%',
        render: () => {
            return (<div>
                <Form.List name="dataPermissions">
                    {(properties, { add, remove }) => {
                        return (
                            <Table
                                dataSource={properties}
                                pagination={false}
                                tableLayout='fixed'
                                footer={() => {
                                    return (
                                        <Form.Item>
                                            <Button onClick={() => add({ title: undefined, type: undefined })}>
                                                <PlusOutlined /> Add property
                                            </Button>
                                        </Form.Item>
                                    );
                                }}
                                columns={propertyColumns.concat({
                                    title: 'Remove',
                                    dataIndex: 'remove',
                                    key: 'remove',
                                    minWidth: 200,
                                    render: (value, row) => {
                                        return (
                                            <Button
                                                icon={<MinusOutlined />}
                                                shape={'circle'}
                                                onClick={() => remove((row as any).title)}
                                            />
                                        );
                                    }
                                })}
                            >
                            </Table>
                        );
                    }}
                </Form.List>
            </div>);
        }
    }, {
        title: 'Read',
        dataIndex: 'read',
        key: 'read',
        width: '10%',
        render: (__unused__value, record, index) => {
            return <Form.Item name={[index, 'read']}>
                <Checkbox checked={record.read}></Checkbox>
            </Form.Item>;
        }
    }, {
        title: 'Write',
        dataIndex: 'write',
        key: 'write',
        width: '10%',
        render: (__unused__value, record, index) => {
            return <Form.Item name={[index, 'write']}>
                <Checkbox checked={record.write}></Checkbox>
            </Form.Item>;
        }
    }, {
        title: 'Delete',
        dataIndex: 'delete',
        key: 'delete',
        width: '10%',
        render: (__unused__value, record, index) => {
            return <Form.Item name={[index, 'delete']}>
                <Checkbox checked={record.delete}></Checkbox>
            </Form.Item>;
        }
    }, {
        title: 'Remove',
        dataIndex: 'remove',
        key: 'remove',
        width: '10%',
        render: (value, row) => {
            return (
                <Button
                    icon={<MinusOutlined />}
                    shape={'circle'}
                    onClick={() => remove((row as any).title)}
                />
            );
        }
    }];
    return (
        <Table
            dataSource={dataPermissions}
            pagination={false}
            tableLayout='fixed'
            footer={() => {
                return (
                    <Form.Item>
                        <Button onClick={() => add({ title: undefined, type: undefined })}>
                            <PlusOutlined /> Add Permission
                        </Button>
                    </Form.Item>
                );
            }}
            columns={columns}
        >
        </Table>
    );
};