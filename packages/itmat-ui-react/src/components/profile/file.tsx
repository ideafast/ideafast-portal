import React, { FunctionComponent, useEffect } from 'react';
import { Mutation } from '@apollo/client/react/components';
import { LOGIN, WHO_AM_I, GET_CONFIG, GET_USER_FILE_NODES, UPLOAD_FILE, UPLOAD_USER_PROFILE, UPLOAD_USER_FILE_NODE, DELETE_USER_FILE_NODE, EDIT_USER_FILE_NODE } from '@itmat-broker/itmat-models';
import { NavLink } from 'react-router-dom';
import css from './profile.module.css';
import { Input, Form, Button, Alert, Checkbox, Image, Row, Col, Typography, Table, notification, Upload, Modal, Tag, message } from 'antd';
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react/hooks';
import LoadSpinner from '../reusable/loadSpinner';
import { IUser, enumConfigType, enumFileCategories, enumFileNodeTypes } from '@itmat-broker/itmat-types';
import { CloudDownloadOutlined, FileOutlined, FolderOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { ApolloError } from '@apollo/client';
import { RcFile } from 'antd/es/upload';

const { Title } = Typography;

export const MyFile: FunctionComponent = () => {
    const { loading: whoAmILoading, error: whoAmIError, data: whoAmIData } = useQuery(WHO_AM_I);
    const { loading: getUserFileRepoLoading, error: getUserFileRepoError, data: getUserFileRepoData } = useQuery(GET_USER_FILE_NODES, { variables: { userId: whoAmIData.whoAmI.id } });
    const [fileList, setFileList] = React.useState<any[]>(getUserFileRepoData?.getUserFileNodes ?? []);
    
    const [isInitialize, setIsInitialize] = React.useState(true);

    useEffect(() => {
        if (getUserFileRepoData?.getUserFileNodes && isInitialize) {
            setFileList(getUserFileRepoData.getUserFileNodes);
            setCurrentLocationPath([getUserFileRepoData.getUserFileNodes[0].id]);
            setIsInitialize(false);
        }
    }, [getUserFileRepoData])

    const [currentLocationPath, setCurrentLocationPath] = React.useState<string[]>([]);
    const [isUploadFolderModalShown, setIsUploadFolderModalShown] = React.useState(false);

    const store = useApolloClient();
    const [uploadUserRepo, {loading: uploadUserRepoLoading, error: uploaderUserRepoError}] = useMutation(UPLOAD_USER_FILE_NODE, {
        onCompleted: ({ uploadUserFileNode }) => {
            if (uploadUserFileNode.type === enumFileNodeTypes.FOLDER) {
                message.success(`FOLDER ${uploadUserFileNode.name} has been created.`);
            } else {
                message.success(`FILE ${uploadUserFileNode.name} has been uploaded.`);
            }
            message.success(`$`);
            const cacheData = store.readQuery({
                query: GET_USER_FILE_NODES,
                variables: { userId: whoAmIData.whoAmI.id }
            }) as any;
            if (!cacheData) {
                return;
            }
            const newCacheData = [
                ...cacheData.getUserFileNodes,
                {
                    ...uploadUserFileNode,
                    life: {
                        createdTime: Date.now(),
                        createdUser: whoAmIData.whoAmI.id,
                        deletedTime: null,
                        deletedUser: null
                    }
                }
            ];
            store.writeQuery({
                query: GET_USER_FILE_NODES,
                variables: { userId: whoAmIData.whoAmI.id },
                data: {getUserFileNodes: newCacheData}
            });
            setFileList(newCacheData);
            setIsUploadFolderModalShown(false);
        },
        onError: (error: ApolloError) => {
            notification.error({
                message: 'Upload error!',
                description: error.message ?? 'Unknown Error Occurred!',
                placement: 'topRight',
                duration: 0
            });
        }
    });

    const [editUserRepo, {loading: editUserRepoLoading, error: editUserRepoError}] = useMutation(EDIT_USER_FILE_NODE, {
        onCompleted: ({ uploadUserFileNode }) => {
            message.success("Changes applied.");
            if (uploadUserFileNode.type === enumFileNodeTypes.FOLDER) {
                message.success(`FOLDER ${uploadUserFileNode.name} has been created.`);
            } else {
                message.success(`FILE ${uploadUserFileNode.name} has been uploaded.`);
            }
            const cacheData = store.readQuery({
                query: GET_USER_FILE_NODES,
                variables: { userId: whoAmIData.whoAmI.id }
            }) as any;
            if (!cacheData) {
                return;
            }
            const newCacheData = [
                ...cacheData.getUserFileNodes,
            ];
            const index = newCacheData.findIndex(el => el.id === uploadUserFileNode.id);
            newCacheData[index] = uploadUserFileNode;
            store.writeQuery({
                query: GET_USER_FILE_NODES,
                variables: { userId: whoAmIData.whoAmI.id },
                data: {getUserFileNodes: newCacheData}
            });
            setFileList(newCacheData);
            setIsUploadFolderModalShown(false);
        },
        onError: (error: ApolloError) => {
            notification.error({
                message: 'Upload error!',
                description: error.message ?? 'Unknown Error Occurred!',
                placement: 'topRight',
                duration: 0
            });
        }
    });

    useEffect(() => {
    }, [currentLocationPath]);
    const [deleteUserRepo] = useMutation(DELETE_USER_FILE_NODE, {
        onCompleted: ({ deleteUserFileNode }) => {
            const cacheData = store.readQuery({
                query: GET_USER_FILE_NODES,
                variables: { userId: whoAmIData.whoAmI.id }
            }) as any;
            if (!cacheData) {
                return;
            }
            const newCacheData = cacheData.getUserFileNodes.filter(el => el.id !== deleteUserFileNode.id)
            store.writeQuery({
                query: GET_USER_FILE_NODES,
                variables: { userId: whoAmIData.whoAmI.id },
                data: {getUserFileNodes: newCacheData}
            });
            setFileList(newCacheData);
            setIsUploadFolderModalShown(false);
        },
        onError: (error: ApolloError) => {
            notification.error({
                message: 'Upload error!',
                description: error.message ?? 'Unknown Error Occurred!',
                placement: 'topRight',
                duration: 0
            });
        }
    })

    if (whoAmILoading || getUserFileRepoLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (whoAmIError || getUserFileRepoError) {
        return <>
            An error occured.
        </>;
    }

    const fileTableColumns = [
        {
            title: 'Name',
            dataIndex: 'value',
            key: 'value',
            render: (__unused__value, record) => {
                if (record.type === enumFileNodeTypes.FILE) {
                    return <span><FileOutlined />&nbsp;{record.name}</span>
                } else {
                    return <span className={css['custom-text-hover']} onClick={() => {
                        if (record.type === enumFileNodeTypes.FOLDER) {
                            setCurrentLocationPath([...currentLocationPath, record.id]);
                        }
                    }}><FolderOutlined />&nbsp;{record.name}</span>
                }
            }
        },
        {
            title: 'Modified',
            dataIndex: 'modified',
            key: 'modified',
            render: (__unused__value, record) => <span>{new Date(record.life.createdTime).toUTCString()}</span>
        },
        {
            title: 'Access',
            dataIndex: 'sharedUsers',
            key: 'sharedUsers',
            render: (__unused__value, record) => <span>{record.sharedUsers}</span>
        },
        {
            render: (__unused__value, record) => <Button onClick={() => {
                deleteUserRepo({variables: {userId: whoAmIData.whoAmI.id, nodeId: record.id}});
            }}>Delete</Button>
        },
        {
            render: (__unused__value, record) => {
                if (record.type === enumFileNodeTypes.FILE) {
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
    return (
        <div className={css.file_wrapper}>
            <Row justify={'space-between'}>
                <Col span={10}>
                    <Title level={2}>My files</Title>
                </Col>
            </Row><br />
            <Row justify={'start'} gutter={1}>
                <Col span={1.5}>
                    <Upload
                        multiple={false}
                        showUploadList={false}
                        beforeUpload={async (file: RcFile) => {
                            try {
                                await uploadUserRepo({variables: {
                                    userId: whoAmIData.whoAmI.id,
                                    parentNodeId: currentLocationPath[currentLocationPath.length - 1],
                                    file: file,
                                    folderName: null
                                }});
                                return false;
                            } catch (error) {
                                return false;
                            }
                        }}
                    >
                        <Button type='primary' icon={<UploadOutlined />} loading={uploadUserRepoLoading} shape='default'>Upload</Button>
                    </Upload>
                </Col>
                <Col span={1.5}>
                    {/* <Button onClick={() => uploadUserRepo({variables: {userId: whoAmIData.whoAmI.id, description: null, fileType: fileList[0].file.name.split('.')[1], fileUpload: fileList[0]}})} type='default' shape='default'>Submit</Button> */}
                </Col>
                <Col span={1.5}>
                    <Button icon={<PlusOutlined />} onClick={() => setIsUploadFolderModalShown(true)}>Create</Button>
                </Col>
                <Col span={1.5}>
                    <Button onClick={() => {
                        const t = [...currentLocationPath];
                        setCurrentLocationPath(t.length == 0 ? [] : t.slice(0, -1));
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
                uploadFunc={uploadUserRepo}
                uploadVariables={{userId: whoAmIData.whoAmI.id, parentNodeId: currentLocationPath[currentLocationPath .length - 1]}}
            />
            {
                currentLocationPath.map((el, index) => {
                    const tag = <Tag color='cyan'  style={{marginRight: '5px'}}  onClick={(value) => {
                        setCurrentLocationPath([...currentLocationPath].slice(0, index + 1))
                    }}>{getUserFileRepoData.getUserFileNodes.filter(es => es.id === el)[0].name}</Tag>;
                    if (index < currentLocationPath.length - 1) {
                        return [tag, <span style={{marginRight: '5px'}} key={`${el}-slash`}>/</span>];
                    } else {
                        return tag;
                    }
                })
            }
            <br /><br />
            <Table
                columns={fileTableColumns}
                expandable={{showExpandColumn: false}}
                dataSource={fileList.filter(el => el.parent === currentLocationPath[currentLocationPath.length - 1])}
            />
        </div >
    );

};


export const UploadFolderModal: FunctionComponent<{isModalShown: boolean, setIsModalShown: any, uploadFunc: any, uploadVariables: any }> = ({isModalShown, setIsModalShown, uploadFunc, uploadVariables}) => {
    const [folderName, setFolderName] = React.useState<string | null>(null);
    return (
        <Modal
            title='Create a folder'
            open={isModalShown}
            onOk={() => {
                uploadFunc({variables: {
                    userId: uploadVariables.userId,
                    parentNodeId: uploadVariables.parentNodeId,
                    file: null,
                    folderName: folderName
                }})
            }}
            onCancel={() => setIsModalShown(false)}
        >
            <Input onChange={(event) => setFolderName(event.target.value)}></Input>
        </Modal>
    );
}