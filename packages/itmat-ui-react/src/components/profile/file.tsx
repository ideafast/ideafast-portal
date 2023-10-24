import React, { FunctionComponent, useEffect } from 'react';
import css from './profile.module.css';
import { Input, Button, Row, Col, Typography, Table, notification, Modal, Tag, Select, Menu, Upload, Tooltip, message, Form, Checkbox } from 'antd';
import LoadSpinner from '../reusable/loadSpinner';
import { IDriveNode, IUser, enumDriveNodeTypes } from '@itmat-broker/itmat-types';
import { CloudDownloadOutlined, FileOutlined, FolderOutlined, MailOutlined, PlusOutlined } from '@ant-design/icons';
import { convertRCFileToSchema, trpc } from '../../utils/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { RcFile } from 'antd/es/upload';
import { formatBytes } from '../../utils/tools';
const { Title } = Typography;

export const MyFile: FunctionComponent = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getUsers = trpc.user.getUsers.useQuery({ userId: null });
    const getDrives = trpc.drive.getDrives.useQuery({ managerId: whoAmI?.data?.id, rootId: null });
    const [fileList, setFileList] = React.useState<Record<string, IDriveNode[]>>(getDrives?.data ?? {});

    const [isInitialize, setIsInitialize] = React.useState(true);

    const queryClient = useQueryClient();
    const [currentLocationPath, setCurrentLocationPath] = React.useState<string[]>([]);
    const [isUploadFolderModalShown, setIsUploadFolderModalShown] = React.useState(false);
    const [isShareModalShown, setIsShareModalShown] = React.useState(false);
    const [currentNodeId, setCurrentNodeId] = React.useState<string | null>(null);
    useEffect(() => {
        if (getDrives?.data && whoAmI?.data) {
            setFileList(getDrives.data);
        }
        if (isInitialize && getDrives?.data) {
            setCurrentLocationPath([getDrives.data[whoAmI.data.id][0].id]);
            setIsInitialize(false);
        }
    }, [getDrives.data, isInitialize]);

    const ownDrives = getDrives.data ? getDrives?.data[whoAmI.data.id] ?? [] : [];
    const queries = queryClient.getQueriesData({});
    const createDriveFolder = trpc.drive.createDriveFolder.useMutation({
        onSuccess: (data) => {
            const queryKey = [['drive', 'getDrives'], { input: { managerId: whoAmI?.data?.id, rootId: null }, type: 'query' }];
            // log each query's key and data
            const cache = queryClient.getQueryData<any[]>(queryKey) ?? [];
            const newCache = [...cache[whoAmI.data.id], data];
            const newQueryCache = {
                ...cache,
                [whoAmI.data.id]: newCache
            };
            queryClient.setQueryData(queryKey, newQueryCache);
            setIsUploadFolderModalShown(false);
        },
        onError(error) {
            notification.error({
                message: 'Upload error!',
                description: error.message || 'Unknown Error Occurred!',
                placement: 'topRight',
                duration: 0
            });
        }
    });

    const createDriveFile = trpc.drive.createDriveFile.useMutation({
        onSuccess: (data) => {
            const queryKey = [['drive', 'getDrives'], { input: { managerId: whoAmI?.data?.id, rootId: null }, type: 'query' }];
            // log each query's key and data
            const cache = queryClient.getQueryData<any[]>(queryKey) ?? [];
            const newCache = [...cache[whoAmI.data.id], data];
            const newQueryCache = {
                ...cache,
                [whoAmI.data.id]: newCache
            };
            queryClient.setQueryData(queryKey, newQueryCache);
            setIsUploadFolderModalShown(false);
        },
        onError(error) {
            notification.error({
                message: 'Upload error!',
                description: error.message || 'Unknown Error Occurred!',
                placement: 'topRight',
                duration: 0
            });
        }
    });

    const deleteDrive = trpc.drive.deleteDrive.useMutation({
        onSuccess: (data) => {
            const queryKey = [['drive', 'getDrives'], { input: { managerId: whoAmI?.data?.id, rootId: null }, type: 'query' }];
            // log each query's key and data
            const cache = queryClient.getQueryData<any[]>(queryKey) ?? [];
            const newCache = cache[whoAmI.data.id].filter(el => el.id !== data.id);
            const newQueryCache = {
                ...cache,
                [whoAmI.data.id]: newCache
            };
            queryClient.setQueryData(queryKey, newQueryCache);
            setIsUploadFolderModalShown(false);
        },
        onError(error) {
            notification.error({
                message: 'Upload error!',
                description: error.message || 'Unknown Error Occurred!',
                placement: 'topRight',
                duration: 0
            });
        }
    });

    const editDrive = trpc.drive.editDrive.useMutation({
        onSuccess: (data) => {
            if (!data) {
                message.error('Edit failed');
                return;
            }
            const queryKey = [['drive', 'getDrives'], { input: { managerId: whoAmI?.data?.id, rootId: null }, type: 'query' }];
            // log each query's key and data
            const cache = queryClient.getQueryData<any[]>(queryKey) ?? [];
            const newCache = cache[whoAmI.data.id].map(el => {
                if (data.driveIds.includes(el.id)) {
                    return {
                        ...el,
                        sharedUsers: data.drive?.sharedUsers ?? []
                    };
                }
                return el;
            });
            const newQueryCache = {
                ...cache,
                [whoAmI.data.id]: newCache
            };
            queryClient.setQueryData(queryKey, newQueryCache);
            setIsUploadFolderModalShown(false);
        },
        onError(error) {
            notification.error({
                message: 'Upload error!',
                description: error.message || 'Unknown Error Occurred!',
                placement: 'topRight',
                duration: 0
            });
        }
    });

    const shareDriveViaEmail = trpc.drive.shareDriveToUserViaEmail.useMutation({
        onSuccess: (data, context) => {
            if (!data) {
                message.error('Edit failed');
                return;
            }
            const queryKey = [['drive', 'getDrives'], { input: { managerId: whoAmI?.data?.id, rootId: null }, type: 'query' }];
            // log each query's key and data
            const cache = queryClient.getQueryData<any[]>(queryKey) ?? [];
            const newCache = cache[whoAmI.data.id].map(el => {
                if (data.driveIds.includes(el.id)) {
                    return {
                        ...el,
                        sharedUsers: data.drive?.sharedUsers ?? []
                    };
                }
                return el;
            });
            const newQueryCache = {
                ...cache,
                [whoAmI.data.id]: newCache
            };
            queryClient.setQueryData(queryKey, newQueryCache);
            setIsUploadFolderModalShown(false);
        },
        onError(error) {
            notification.error({
                message: 'Upload error!',
                description: error.message || 'Unknown Error Occurred!',
                placement: 'topRight',
                duration: 0
            });
        }
    });

    // useEffect(() => {
    // }, [currentLocationPath]);

    if (whoAmI.isLoading || getDrives.isLoading || getUsers.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (whoAmI.isError || getDrives.isError || getUsers.isError) {
        return <>
            An error occured.
        </>;
    }

    const fileTableColumns = [
        {
            title: 'Name',
            dataIndex: 'value',
            key: 'value',
            width: 200, // Adjust this width as required
            render: (__unused__value, record) => {
                const content = record.type === enumDriveNodeTypes.FILE
                    ? <span><FileOutlined />&nbsp;{record.name}</span>
                    : <span className={css['custom-text-hover']} onClick={() => {
                        if (record.type === enumDriveNodeTypes.FOLDER) {
                            setCurrentLocationPath([...currentLocationPath, record.id]);
                        }
                    }}>
                        <FolderOutlined />&nbsp;{record.name}
                    </span>;

                return (
                    <Tooltip title={record.name}>
                        <div className={css.ellipsisStyle}>
                            {content}
                        </div>
                    </Tooltip>
                );
            }
        },
        {
            title: 'Modified',
            dataIndex: 'modified',
            key: 'modified',
            render: (__unused__value, record) => <span>{new Date(record.life.createdTime).toUTCString()}</span>
        },
        {
            title: 'File Size',
            dataIndex: 'fileSize',
            key: 'fileSize',
            render: (__unused__value, record) => <span>{formatBytes(record.metadata.fileSize)}</span>
        },
        {
            title: 'Access',
            dataIndex: 'sharedUsers',
            key: 'sharedUsers',
            render: (__unused__value, record) => {
                if (record.sharedUsers.length >= 1) {
                    return (<>
                        {record.sharedUsers.map(el => {
                            const user = getUsers.data.filter(es => es.id === el.iid)[0];
                            if (!user) {
                                return 'NA';
                            }
                            return user ? <Tooltip title={user.email?.toString()}><Tag>{`${user.firstname} ${user.lastname}`}</Tag></Tooltip> : 'NA';
                        })}
                        <PlusOutlined onClick={() => {
                            setIsShareModalShown(true);
                            setCurrentNodeId(record.id);
                        }} />
                    </>);
                } else {
                    return <PlusOutlined onClick={() => {
                        setIsShareModalShown(true);
                        setCurrentNodeId(record.id);
                    }} />;
                }
            }
        },
        {
            render: (__unused__value, record) => <Button onClick={() => {
                deleteDrive.mutate({ driveId: record.id });
            }}> Delete</Button >
        },
        {
            render: (__unused__value, record) => {
                if (record.type === enumDriveNodeTypes.FILE) {
                    return <Button icon={<CloudDownloadOutlined />} href={`/file/${record.fileId}`}>
                        Download
                    </Button>;
                } else {
                    return null;
                }
            },
            width: '10rem',
            key: 'download'
        }
    ];
    return (<>
        <div className={css.file_wrapper}>
            <Row justify={'space-between'}>
                <Col span={10}>
                    <Title level={2}>My files</Title>
                </Col>
            </Row><br />
            <Row justify={'start'} gutter={1}>
                <Col span={1.5}>
                    <Upload
                        showUploadList={false}
                        customRequest={async ({ file, onSuccess, onError }) => {
                            try {
                                const fileBuffer: any = await convertRCFileToSchema(file as RcFile);
                                createDriveFile.mutate({
                                    parentId: currentLocationPath[currentLocationPath.length - 1],
                                    description: null,
                                    file: [fileBuffer]  // wrapped as an array as your backend expects an array
                                });
                                onSuccess?.('OK');
                            } catch (error) {
                                // Optionally, call onError callback if the upload fails
                                onError?.(new Error('Upload failed'));
                            }
                        }}
                    >
                        <Button icon={<PlusOutlined />}>Upload File</Button>
                    </Upload>
                </Col>
                {/* <Col span={1.5}>
                    <Button onClick={() => uploadUserRepo({variables: {userId: whoAmIData.whoAmI.id, description: null, fileType: fileList[0].file.name.split('.')[1], fileUpload: fileList[0]}})} type='default' shape='default'>Submit</Button>
                </Col> */}
                <Col span={1.5}>
                    <Button icon={<PlusOutlined />} onClick={() => setIsUploadFolderModalShown(true)}>Create Folder</Button>
                </Col>
                <Col span={1.5}>
                    <Button onClick={() => {
                        const t = [...currentLocationPath];
                        setCurrentLocationPath(t.length === 0 ? [] : t.slice(0, -1));
                    }}>Back</Button>
                </Col>
                <Col span={1}>
                    <Button>...</Button>
                </Col>
            </Row>
            <br />
            <UploadFolderModal
                isModalShown={isUploadFolderModalShown}
                setIsModalShown={setIsUploadFolderModalShown}
                uploadFunc={createDriveFolder}
                uploadVariables={{ userId: whoAmI.data.id, parentNodeId: currentLocationPath[currentLocationPath.length - 1] }}
            />
            {
                currentLocationPath.map((el, index) => {
                    const tag = <Tag color='cyan' style={{ marginRight: '5px' }} onClick={(value) => {
                        setCurrentLocationPath([...currentLocationPath].slice(0, index + 1));
                    }}>{getDrives?.data[whoAmI.data.id]?.filter(es => es.id === el)[0].name}</Tag>;
                    if (index < currentLocationPath.length - 1) {
                        return [tag, <span style={{ marginRight: '5px' }} key={`${el}-slash`}>/</span>];
                    } else {
                        return tag;
                    }
                })
            }
            <br /><br />
            <Table
                columns={fileTableColumns}
                expandable={{ showExpandColumn: false }}
                dataSource={fileList[whoAmI.data.id]?.filter(el => el.parent === currentLocationPath[currentLocationPath.length - 1])}
            />
            <ShareFileModal isModalShown={isShareModalShown} setIsModalShown={setIsShareModalShown} shareFunc={shareDriveViaEmail} shareVariables={{ userId: whoAmI.data.id, nodeId: currentNodeId }} currentDrive={getDrives.data[whoAmI.data.id].filter(el => el.id === currentNodeId)[0]} users={getUsers.data} />
            {/* <Row justify={'space-between'}>
                <Col span={10}>
                    <Title level={2}>Shared files</Title>
                </Col>
            </Row><br /> */}
        </div >
        <div className={css.shared_container}>
            <SharedFiles users={getUsers.data} sharedUserFiles={getDrives.data} self={whoAmI.data} />
        </div >
    </>);

};

export const SharedFiles: FunctionComponent<{ users: any, sharedUserFiles: any, self: any }> = ({ users, sharedUserFiles, self }) => {
    const [currentSharedUser, setCurrentSharedUser] = React.useState<string | null>(null);
    const [currentLocationPath, setCurrentLocationPath] = React.useState<string[]>([]);
    const sharedUsers: string[] = Object.keys(sharedUserFiles).filter(el => el !== self.id);

    const fileTableColumns = [
        {
            title: 'Name',
            dataIndex: 'value',
            key: 'value',
            render: (__unused__value, record) => {
                if (record.type === enumDriveNodeTypes.FILE) {
                    return <span><FileOutlined />&nbsp;{record.name}</span>;
                } else {
                    return <span className={css['custom-text-hover']} onClick={() => {
                        if (record.type === enumDriveNodeTypes.FOLDER) {
                            setCurrentLocationPath([...currentLocationPath, record.id]);
                        }
                    }}><FolderOutlined />&nbsp;{record.name}</span>;
                }
            }
        },
        {
            render: (__unused__value, record) => {
                if (record.type === enumDriveNodeTypes.FILE) {
                    return <Button icon={<CloudDownloadOutlined />} href={`/file/${record.id}`}>
                        Download
                    </Button>;
                } else {
                    return null;
                }
            },
            width: '10rem',
            key: 'download'
        }
    ];
    const items = sharedUsers.map(el => {
        const user = users.filter(es => es.id === el)[0] as any;
        return {
            key: el,
            icon: <MailOutlined />,
            // children: [],
            label: `${user.firstname} ${user.lastname}`
        };
    });

    return (<>
        <div className={css.shared_file_left}>
            <Menu
                mode='vertical'
                theme='dark'
                items={items}
                onSelect={(e) => {
                    setCurrentSharedUser(e.key);
                    const rootNode = sharedUserFiles[e.key].filter(el => el.managerId === e.key).filter(el => el.parent === null)[0];
                    setCurrentLocationPath([rootNode.id]);
                }}
            >
                {items.map(item => (
                    <Menu.Item key={item.key}>
                        {item.label}
                    </Menu.Item>
                ))}
            </Menu>
        </div>
        <div className={css.shared_file_right}>
            {
                currentLocationPath.map((el, index) => {
                    const tag = <Tag color='cyan' style={{ marginRight: '5px' }} onClick={(value) => {
                        setCurrentLocationPath([...currentLocationPath].slice(0, index + 1));
                    }}>{sharedUserFiles.filter(el => el.id === currentSharedUser)[0].fileNodes.filter(es => es.id === el)[0].name}</Tag>;
                    if (index < currentLocationPath.length - 1) {
                        return [tag, <span style={{ marginRight: '5px' }} key={`${el}-slash`}>/</span>];
                    } else {
                        return tag;
                    }
                })
            }
            <Table
                columns={fileTableColumns}
                expandable={{ showExpandColumn: false }}
                dataSource={currentSharedUser ? sharedUserFiles[currentSharedUser].filter(el => {
                    return el.managerId === currentSharedUser;
                }).filter(el => el.parent === currentLocationPath[currentLocationPath.length - 1]) : []}
            />
        </div >
    </>);
};


export const UploadFolderModal: FunctionComponent<{ isModalShown: boolean, setIsModalShown: any, uploadFunc: any, uploadVariables: any }> = ({ isModalShown, setIsModalShown, uploadFunc, uploadVariables }) => {
    const [folderName, setFolderName] = React.useState<string | null>(null);
    const [description, setDescription] = React.useState<string | null>(null);
    return (
        <Modal
            title='Create a folder'
            open={isModalShown}
            onOk={() => {
                uploadFunc.mutate({
                    folderName: folderName,
                    parentId: uploadVariables.parentNodeId,
                    description: description
                });
            }}
            onCancel={() => setIsModalShown(false)}
        >
            <Input onChange={(event) => setFolderName(event.target.value)} placeholder='Folder Name' required={true}></Input>
            <br /><br />
            <Input onChange={(event) => setDescription(event.target.value)} placeholder='Description'></Input>
        </Modal>
    );
};

export const ShareFileModal: FunctionComponent<{ isModalShown: boolean, setIsModalShown: any, shareFunc: any, shareVariables: any, currentDrive: any, users: any[] }> = ({ isModalShown, setIsModalShown, shareFunc, shareVariables, currentDrive, users }) => {
    const [sharedUserEmails, setSharedUserEmails] = React.useState<string[]>([]);
    const [form] = Form.useForm();
    const columns = [{
        title: 'User',
        dataIndex: 'value',
        key: 'value',
        render: (__unused__value, record) => {
            console.log(record);
            const user = users.filter(el => el.id === record.iid)[0];
            return `${user.firstname} ${user.lastname}`;
        }
    }, {
        title: 'Read',
        dataIndex: 'read',
        key: 'read',
        render: (__unused__value, record) => {
            return <Checkbox checked={record.read}></Checkbox>;
        }
    }, {
        title: 'Write',
        dataIndex: 'write',
        key: 'write',
        render: (__unused__value, record) => {
            return <Checkbox checked={record.write}></Checkbox>;
        }
    }, {
        title: 'Delete',
        dataIndex: 'delete',
        key: 'delete',
        render: (__unused__value, record) => {
            return <Checkbox checked={record.delted}></Checkbox>;
        }
    }];
    if (!currentDrive) {
        return null;
    }
    return (
        <Modal
            title='Share to a user'
            open={isModalShown}
            onCancel={() => setIsModalShown(false)}
        >
            <Table
                columns={columns}
                dataSource={currentDrive.sharedUsers}
            ></Table>
            <Form
                layout='horizontal'
                form={form}
                initialValues={{
                    emails: [],
                    read: false,
                    write: false,
                    delete: false
                }}
            >
                <Form.Item label='Emails' name='emails'>
                    <Select
                        mode="tags"
                        style={{ width: '100%' }}
                        placeholder="User email"
                    />
                </Form.Item>
                <Form.Item label="Read" name="read" valuePropName="checked">
                    <Checkbox>Read</Checkbox>
                </Form.Item>
                <Form.Item label="Write" name="write" valuePropName="checked">
                    <Checkbox>Write</Checkbox>
                </Form.Item>
                <Form.Item label="Delete" name="delete" valuePropName="checked">
                    <Checkbox>Delete</Checkbox>
                </Form.Item>
                <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
                    <Button type="primary" htmlType="submit" onClick={() => {
                        console.log(form.getFieldsValue());
                        shareFunc.mutate({
                            userEmails: form.getFieldValue('emails'),
                            driveId: currentDrive.id,
                            permissions: {
                                read: form.getFieldValue('read'),
                                write: form.getFieldValue('write'),
                                delete: form.getFieldValue('delete')
                            }
                        });
                    }}>
                        Submit
                    </Button>
                </Form.Item>
            </Form>
        </Modal>
    );
};