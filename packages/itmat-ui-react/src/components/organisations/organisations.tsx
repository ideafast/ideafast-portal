import { GET_ORGANISATIONS, IOrganisation, CREATE_ORGANISATION, DELETE_ORGANISATION } from 'itmat-commons';
import * as React from 'react';
import { useQuery, useMutation } from '@apollo/client/react/hooks';
import LoadSpinner from '../reusable/loadSpinner';
import { SubsectionWithComment } from '../reusable/subsection/subsection';
import { Table, Input, Button, Popconfirm, Alert, Form, notification, Modal } from 'antd';
import { ApolloError } from '@apollo/client/errors';

export const OrganisationsList: React.FunctionComponent = () => {
    const { loading: getOrganisationsLoading, error: getOrganisationsError, data: getOrganisationsData } = useQuery(GET_ORGANISATIONS);
    const [isModalOn, setIsModalOn] = React.useState(false);
    const [searchedWords, setSearchedWords] = React.useState<string | null>(null);
    const [form] = Form.useForm();
    const [createOrganisation] = useMutation(CREATE_ORGANISATION, {
        onCompleted: ({ createOrganisation }) => {
            notification.success({
                message: 'Creating succeeded!',
                description: `Organisation ${createOrganisation.name} has been updated.`,
                placement: 'topRight',
            });
        },
        onError: (error: ApolloError) => {
            notification.error({
                message: 'Creating error!',
                description: error.message ?? 'Unknown Error Occurred!',
                placement: 'topRight',
                duration: 0,
            });
        }
    });
    const [deleteOrganisation] = useMutation(DELETE_ORGANISATION, {
        onCompleted: ({ deleteOrganisation }) => {
            notification.success({
                message: 'Deleting succeeded!',
                description: `Organisation ${deleteOrganisation.name} has been deleted.`,
                placement: 'topRight',
            });
        },
        onError: (error: ApolloError) => {
            notification.error({
                message: 'Deleting error!',
                description: error.message ?? 'Unknown Error Occurred!',
                placement: 'topRight',
                duration: 0,
            });
        }
    });
    if (getOrganisationsLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (getOrganisationsError) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <Alert type='error' message={getOrganisationsError.message} />
            </div>
        </>;
    }

    return (<div>
        <SubsectionWithComment title='List of Organisations' comment={<div>
            <span>{`${getOrganisationsData.getOrganisations.length.toString()} Organisations`}</span>
            <Button
                onClick={() => {
                    setIsModalOn(true);
                    form.setFieldsValue({
                        name: null,
                        shortName: null,
                        siteIDMarker: null
                    });
                }}
            >Add</Button>
        </div>}>
            <Input
                placeholder='Search'
                onChange={(e) => setSearchedWords(e.target.value)}
            />
            <Table
                rowKey={(rec) => rec.id}
                columns={generateOrgColumns(setIsModalOn, form, deleteOrganisation)}
                dataSource={getOrganisationsData.getOrganisations.filter(el => {
                    return el.name.toLowerCase().indexOf((searchedWords || '').toLowerCase()) > -1
                        || (el.shortname || '').toLowerCase().indexOf((searchedWords || '').toLowerCase()) > -1;
                })}
                size='small'
                pagination={
                    {
                        defaultPageSize: 50,
                        showSizeChanger: true,
                        pageSizeOptions: ['20', '50', '100', '200'],
                        defaultCurrent: 1,
                        showQuickJumper: true
                    }
                }
            >
            </Table>
        </SubsectionWithComment>
        <Modal
            visible={isModalOn}
            footer={[
                <Button key='cancel' onClick={() => setIsModalOn(false)}>
                    Cancel
                </Button>
            ]}
        >
            <OrganisationsEditor organisations={getOrganisationsData.getOrganisations} form={form} createOrg={createOrganisation}></OrganisationsEditor>
        </Modal>
    </div>);
};

const OrganisationsEditor: React.FunctionComponent<{ organisations: IOrganisation[], form: any, createOrg: any }> = ({ organisations, form, createOrg }) => {
    const initialValues: any = form.getFieldsValue(true);
    const isAdd: boolean = initialValues.name === null;
    return (<div>
        <Form
            initialValues={{
                name: null,
                shortName: null,
                siteIDMarker: null
            }}
            form={form}
            onFinish={(variables) => {
                createOrg({
                    variables: {
                        name: variables.name,
                        shortname: variables.shortname,
                        containOrg: null,
                        metadata: variables.siteIDMarker ? {
                            siteIDMarker: variables.siteIDMarker
                        } : null
                    }
                });
            }}
        >
            <Form.Item
                name='name'
                label='Name'
                rules={[
                    {
                        required: true,
                        message: 'Please input the name of the organisation',
                    },
                ]}
            >
                <Input></Input>
            </Form.Item>
            <Form.Item
                name='shortname'
                label='Short Name'
            >
                <Input></Input>
            </Form.Item>
            <Form.Item
                name='siteIDMarker'
                label='Site ID Marker'
                rules={[
                    {
                        validator: (_, value) => {
                            if (isAdd) {
                                if (organisations.map(el => el.metadata?.siteIDMarker).includes(value)) {
                                    return Promise.reject('This marker has been used.');
                                }
                                return Promise.resolve();
                            } else {
                                if (organisations.filter(el => el.name !== initialValues.name).map(el => el.metadata?.siteIDMarker).includes(value)) {
                                    return Promise.reject('This marker has been used.');
                                }
                                return Promise.resolve();
                            }
                        }
                    },
                ]}
            >
                <Input></Input>
            </Form.Item>
            <Form.Item>
                <Button type='primary' htmlType='submit'>
                    Submit
                </Button>
            </Form.Item>
        </Form>
    </div>);
};

function generateOrgColumns(setIsModalOn: any, form: any, deleteOrganisation: any) {
    return [
        {
            title: 'Index',
            dataIndex: 'index',
            key: 'index',
            render: (__unused__value, __unused__record, index) => {
                return (index + 1).toString();
            }
        },
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (__unused__value, record) => {
                return record.name || '';
            }
        },
        {
            title: 'Short Name',
            dataIndex: 'shortname',
            key: 'shortname',
            render: (__unused__value, record) => {
                return record.shortname || '';
            }
        },
        {
            title: 'Site ID Marker',
            dataIndex: 'siteIDMarker',
            key: 'siteIDMarker',
            render: (__unused__value, record) => {
                return record.metadata?.siteIDMarker || '';
            }
        },
        {
            title: 'Edit',
            dataIndex: 'edit',
            key: 'edit',
            render: (__unused__value, record) => {
                return (<Button
                    onClick={() => {
                        setIsModalOn(true);
                        form.setFieldsValue({
                            name: record.name,
                            shortname: record.shortname,
                            siteIDMarker: record.metadata?.siteIDMarker
                        });
                    }}
                >Edit</Button>);
            }
        },
        {
            title: 'Delete',
            dataIndex: 'delete',
            key: 'delete',
            render: (__unused__value, record) => {
                return (<Popconfirm
                    title='Are you sure to delete this task?'
                    onConfirm={() => {
                        deleteOrganisation({
                            variables: {
                                id: record.id
                            }
                        });
                    }}
                    okText='Yes'
                    cancelText='No'
                >
                    <Button>Delete</Button>
                </Popconfirm>);
            }
        },
    ];
}
