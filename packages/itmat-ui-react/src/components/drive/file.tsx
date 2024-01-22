import React, { FunctionComponent, useEffect, useRef } from 'react';
import css from './drive.module.css';
import { Input, Button, Row, Col, Table, Menu, notification, Modal, Tag, Select, Upload, Tooltip, message, Form, Checkbox, List, Dropdown } from 'antd';
import LoadSpinner from '../reusable/loadSpinner';
import { IDriveNode, enumDriveNodeTypes, enumFileTypes } from '@itmat-broker/itmat-types';
import { CloudDownloadOutlined, FileOutlined, FolderOutlined, MailOutlined, MoreOutlined, PlusOutlined, ShareAltOutlined, UploadOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { trpc } from '../../utils/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { formatBytes } from '../../utils/tools';
import { file } from 'tmp';
import { tap } from '@trpc/server/observable';
// eslint-disable-next-line @typescript-eslint/no-unused-vars

export const MyFile: FunctionComponent = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getUsers = trpc.user.getUsers.useQuery({});
    const getDrives = trpc.drive.getDrives.useQuery({ userId: whoAmI?.data?.id });

    const [isInitialize, setIsInitialize] = React.useState(true);
    const queryClient = useQueryClient();
    const [currentLocationPath, setCurrentLocationPath] = React.useState<string[]>([]);
    const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);
    const [isSharingDrive, setIsSharingDrive] = React.useState(false);
    const [currentNodeId, setCurrentNodeId] = React.useState<string | null>(null);
    const [uploading, setUploading] = React.useState(false);
    const [uploadingFolderFileList, setUploadingFolderFileList] = React.useState<any>([]);

    // This effect handles the upload process.
    useEffect(() => {
        if (uploading && uploadingFolderFileList.length > 0) {
            const uploadAllFiles = async () => {
                const tFiles: any = [];
                const tPaths: string[][] = [];
                for (let i = 0; i < uploadingFolderFileList.length; i++) {
                    const webkitFile = uploadingFolderFileList[i].originFileObj as File & { webkitRelativePath?: string };
                    const pathFromCurrent: string[] = webkitFile.webkitRelativePath.split('/');
                    if (pathFromCurrent[pathFromCurrent.length - 1].startsWith('.')) {
                        continue;
                    }
                    const fileData = uploadingFolderFileList[i].originFileObj as Blob;
                    const formData = new FormData();
                    formData.append('file', fileData);

                    const response = await fetch('/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();
                    if (response.ok) {
                        tFiles.push({
                            path: data.filePath,
                            filename: fileData.name,
                            mimetype: fileData.type,
                            size: fileData.size
                        });
                        tPaths.push(pathFromCurrent);
                    } else {
                        // Handle upload error
                        console.error('File upload failed:', data);
                    }
                }
                createRecusriveDrives.mutate({
                    parentId: currentLocationPath[currentLocationPath.length - 1],
                    files: tFiles,
                    paths: tPaths
                });
                setUploading(false);
            };

            uploadAllFiles();
        }
    }, [uploading, setUploadingFolderFileList]);

    useEffect(() => {
        // if (getDrives?.data && whoAmI?.data) {
        //     setFileList(getDrives.data);
        // }
        if (isInitialize && getDrives?.data) {
            setCurrentLocationPath([getDrives.data[whoAmI.data.id][0].id]);
            setIsInitialize(false);
        }
    }, [getDrives.data, isInitialize]);

    const createDriveFolder = trpc.drive.createDriveFolder.useMutation({
        onSuccess: (data) => {
            const queryKey = [['drive', 'getDrives'], { input: { userId: whoAmI?.data?.id }, type: 'query' }];
            // log each query's key and data
            const cache = queryClient.getQueryData<any[]>(queryKey) ?? [];
            const newCache = [...cache[whoAmI.data.id], data];
            const newQueryCache = {
                ...cache,
                [whoAmI.data.id]: newCache
            };
            queryClient.setQueryData(queryKey, newQueryCache);
            queryClient.invalidateQueries(['drive', 'getDrives', { input: { userId: whoAmI?.data?.id } }]);

            setIsCreatingFolder(false);
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

    const createRecusriveDrives = trpc.drive.createRecursiveDrives.useMutation({
        onSuccess: (data) => {
            const queryKey = [['drive', 'getDrives'], { input: { userId: whoAmI?.data?.id }, type: 'query' }];
            // log each query's key and data
            const cache = queryClient.getQueryData<any[]>(queryKey) ?? [];
            const newCache = Array.from(new Map([...cache[whoAmI.data.id], ...data].map(item => [item.id, item])).values());
            const newQueryCache = {
                ...cache,
                [whoAmI.data.id]: newCache
            };
            queryClient.setQueryData(queryKey, newQueryCache);
            queryClient.invalidateQueries(['drive', 'getDrives', { input: { userId: whoAmI?.data?.id } }]);

            setIsCreatingFolder(false);
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
            const queryKey = [['drive', 'getDrives'], { input: { userId: whoAmI?.data?.id }, type: 'query' }];
            // log each query's key and data
            const cache = queryClient.getQueryData<any[]>(queryKey) ?? [];
            const newCache = [...cache[whoAmI.data.id], data];
            const newQueryCache = {
                ...cache,
                [whoAmI.data.id]: newCache
            };
            queryClient.setQueryData(queryKey, newQueryCache);
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
            const queryKey = [['drive', 'getDrives'], { input: { userId: whoAmI?.data?.id }, type: 'query' }];
            // log each query's key and data
            const cache = queryClient.getQueryData<any[]>(queryKey) ?? [];
            const newCache = cache[whoAmI.data.id].filter(el => el.id !== data.id);
            const newQueryCache = {
                ...cache,
                [whoAmI.data.id]: newCache
            };
            queryClient.setQueryData(queryKey, newQueryCache);
        },
        onError(error) {
            notification.error({
                message: 'Delete error!',
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
            // const queryKey = [['drive', 'getDrives'], { input: { userId: whoAmI?.data?.id, rootId: null }, type: 'query' }];
            // // log each query's key and data
            // const cache = queryClient.getQueryData<any[]>(queryKey) ?? [];
            // const newCache = cache[whoAmI.data.id].map(el => {
            //     if (data.driveIds.includes(el.id)) {
            //         return {
            //             ...el,
            //             sharedUsers: data.drive?.sharedUsers ?? []
            //         };
            //     }
            //     return el;
            // });
            // const newQueryCache = {
            //     ...cache,
            //     [whoAmI.data.id]: newCache
            // };
            // queryClient.setQueryData(queryKey, newQueryCache);
            // setIsCreatingFolder(false);
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
            // const queryKey = [['drive', 'getDrives'], { input: { managerId: whoAmI?.data?.id, rootId: null }, type: 'query' }];
            // // log each query's key and data
            // const cache = queryClient.getQueryData<any[]>(queryKey) ?? [];
            // const newCache = cache[whoAmI.data.id].map(el => {
            //     if (data.driveIds.includes(el.id)) {
            //         return {
            //             ...el,
            //             sharedUsers: data.drive?.sharedUsers ?? []
            //         };
            //     }
            //     return el;
            // });
            // const newQueryCache = {
            //     ...cache,
            //     [whoAmI.data.id]: newCache
            // };
            // queryClient.setQueryData(queryKey, newQueryCache);
            // setIsCreatingFolder(false);
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
            width: '40%',
            render: (value, record) => {
                const icon = record.type === enumDriveNodeTypes.FILE ? <FileOutlined /> : <FolderOutlined />;
                const content = (
                    <span className={css.customTextHover} onClick={() => {
                        if (record.type === enumDriveNodeTypes.FOLDER) {
                            setCurrentLocationPath([...currentLocationPath, record.id]);
                        }
                    }}>
                        {icon}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            &nbsp;{record.name}
                        </span>
                    </span>
                );

                return (
                    <div className={css.ellipsisStyle}>
                        <div className={css.textAndIcon}>
                            {content}
                        </div>
                        <div className={css.cellIcons}>
                            {/* Share Icon with Tooltip */}
                            <Tooltip title="Share this item">
                                <ShareAltOutlined
                                    className={css.cellIcon}
                                    onClick={(e) => {
                                        setIsSharingDrive(true);
                                        setCurrentNodeId(record.id);
                                        e.stopPropagation(); // Prevent triggering Dropdown
                                    }}
                                />
                            </Tooltip>

                            {/* More Icon (Ellipsis) with Dropdown and Tooltip */}
                            <Dropdown overlay={
                                <Menu onClick={(e) => {
                                    if (e.key === 'download') {
                                        const a = document.createElement('a');
                                        a.href = `/file/${record.fileId}`;
                                        a.setAttribute('download', record.name || 'download'); // Optional: provide a default file name
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                    } else if (e.key === 'delete') {
                                        // Handle delete logic here
                                    }
                                }}>
                                    {
                                        record.type === enumDriveNodeTypes.FILE &&
                                        <Menu.Item key="download" title="Download the file">
                                            Download
                                        </Menu.Item>
                                    }
                                    <Menu.Item key="delete" title="Delete the file from the system" onClick={() => {
                                        deleteDrive.mutate({ driveId: record.id });
                                    }}>
                                        Delete
                                    </Menu.Item>
                                    {/* Add more Menu.Item components as needed */}
                                </Menu>
                            } trigger={['click']}>
                                <Tooltip title="More actions">
                                    <a onClick={(e) => e.stopPropagation()}>
                                        <MoreOutlined className={css.cellIcon} />
                                    </a>
                                </Tooltip>
                            </Dropdown>
                        </div>
                    </div>
                );
            }
        }
        ,
        {
            title: 'Modified',
            dataIndex: 'modified',
            key: 'modified',
            width: '10%',
            sorter: (a, b) => a.life.createdTime - b.life.createdTime,
            render: (__unused__value, record) => <span>{new Date(record.life.createdTime).toLocaleDateString()}</span>
        },
        {
            title: 'File Size',
            dataIndex: 'fileSize',
            key: 'fileSize',
            width: '10%',
            render: (__unused__value, record) => <span>{formatBytes(record.metadata.fileSize)}</span>
        },
        {
            title: 'Sharing',
            dataIndex: 'sharedUsers',
            key: 'sharedUsers',
            width: '10%',
            render: (__unused__value, record) => {
                if (record.sharedUsers.length >= 1 || record.sharedGroups.length >= 1) {
                    return (
                        <div
                            className={css.customTextHover} // Reuse the hover effect
                            onClick={() => {
                                setIsSharingDrive(true);
                                setCurrentNodeId(record.id);
                            }} // Attach the click event handler
                        >
                            <UsergroupAddOutlined /> Shared
                        </div>
                    );
                } else {
                    return (
                        <div
                            className={css.customTextHover} // Reuse the hover effect for consistency
                            onClick={() => {
                                setIsSharingDrive(true);
                                setCurrentNodeId(record.id);
                            }} // Attach the click event handler even if it's private
                        >
                            Private
                        </div>
                    );
                }
            }
        }
    ];
    const counter = 0;
    return (
        <>
            <div className={css.file_wrapper}>
                <List
                    header={
                        <div className={css['overview-header']}>
                            <div className={css['overview-icon']}></div>
                            <div>My files</div>
                        </div>
                    }
                >
                    <List.Item>
                        <Row justify="space-between" gutter={1} style={{ width: '100%' }}>
                            <Col>
                                <Row gutter={1}>
                                    <Col span={1.5}>
                                        <Dropdown overlay={<Menu onClick={(e) => {
                                            if (e.key === 'newFolder') {
                                                setIsCreatingFolder(true);
                                            }
                                            // Add more conditions for other menu items here
                                        }}>
                                            <Menu.Item key="newFolder">New Folder</Menu.Item>
                                            <Menu.Item key="otherOption1">Other Option 1</Menu.Item>
                                            <Menu.Item key="otherOption2">Other Option 2</Menu.Item>
                                            {/* Add more Menu.Item components as needed */}
                                        </Menu>} trigger={['click']}>
                                            <Button icon={<PlusOutlined />}>New</Button>
                                        </Dropdown>
                                    </Col>
                                    <Col span={1.5}>
                                        <Dropdown overlay={<Menu onClick={(e) => {
                                            // if (e.key === 'files') {
                                            //     setIsUploadingFile(true);
                                            // }
                                        }}>
                                            <Menu.Item key="files">
                                                <Upload
                                                    showUploadList={false}
                                                    multiple={true}
                                                    customRequest={async ({ file }) => {
                                                        if (file) {
                                                            const fileData = file as Blob;
                                                            const formData = new FormData();
                                                            formData.append('file', fileData);

                                                            const response = await fetch('/upload', {
                                                                method: 'POST',
                                                                body: formData
                                                            });
                                                            const data = await response.json();
                                                            if (response.ok) {
                                                                createDriveFile.mutate({
                                                                    parentId: currentLocationPath[currentLocationPath.length - 1],
                                                                    description: null,
                                                                    file: [{
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
                                                        // setIsUploadingFile(false);
                                                    }}
                                                >
                                                    {'Files'}
                                                </Upload>
                                            </Menu.Item>
                                            <Menu.Item key="otherOption1">
                                                <Upload
                                                    showUploadList={false}
                                                    multiple={true}
                                                    directory={true}
                                                    onChange={async ({ fileList: newFileList }) => {
                                                        // Update the state with the new file list
                                                        setUploadingFolderFileList(newFileList);

                                                        // Check if all the fileList items have an originFileObj, indicating they are fully added
                                                        if (newFileList.every(file => file.originFileObj)) {
                                                            setUploading(true);
                                                        }
                                                    }}
                                                >
                                                    {'Folder'}
                                                </Upload>
                                            </Menu.Item>
                                            <Menu.Item key="otherOption2">Other Option 2</Menu.Item>
                                            {/* Add more Menu.Item components as needed */}
                                        </Menu>} trigger={['click']}>
                                            <Button icon={<UploadOutlined />}>Upload</Button>
                                        </Dropdown>
                                    </Col>
                                    <Col span={1}>
                                        <Button>...</Button>
                                    </Col>
                                </Row>
                            </Col>

                            <Col>
                                <Button onClick={() => {
                                    const t = [...currentLocationPath];
                                    setCurrentLocationPath(t.length > 1 ? t.slice(0, -1) : t);
                                }}>Back</Button>
                            </Col>
                        </Row>
                    </List.Item>
                    <List.Item>
                        <CreateFolder
                            isModalShown={isCreatingFolder}
                            setIsModalShown={setIsCreatingFolder}
                            uploadFunc={createDriveFolder}
                            uploadVariables={{ userId: whoAmI.data.id, parentNodeId: currentLocationPath[currentLocationPath.length - 1] }}
                        />
                        <div className={css.breadcrumbContainer}>
                            {

                                currentLocationPath.map((el, index) => {
                                    const isLast = index === currentLocationPath.length - 1;
                                    const folderName = getDrives?.data[whoAmI.data.id]?.find(es => es.id === el)?.name || 'Unknown';
                                    return (
                                        <React.Fragment key={el}>
                                            <Tag
                                                color="cyan"
                                                style={{ marginRight: '5px' }}
                                                onClick={() => setCurrentLocationPath(currentLocationPath.slice(0, index + 1))}
                                            >
                                                {folderName}
                                            </Tag>
                                            {!isLast && <span style={{ marginRight: '5px' }}>/</span>}
                                        </React.Fragment>
                                    );
                                })

                            }
                        </div>
                    </List.Item>
                    <List.Item>
                        <Table
                            style={{ width: '100%', fontSize: '20px' }}
                            columns={fileTableColumns}
                            expandable={{ showExpandColumn: false }}
                            dataSource={getDrives.data[whoAmI.data.id]?.filter(el => el.parent === currentLocationPath[currentLocationPath.length - 1])}
                        />
                        <ShareFileModal isModalShown={isSharingDrive} setIsModalShown={setIsSharingDrive} shareFunc={shareDriveViaEmail} shareVariables={{ userId: whoAmI.data.id, nodeId: currentNodeId }} currentDrive={getDrives.data[whoAmI.data.id].filter(el => el.id === currentNodeId)[0]} users={getUsers.data} />
                    </List.Item>
                </List >
            </div >
            <div className={css.shared_container}>
                <List
                    header={
                        <div className={css['overview-header']}>
                            <div className={css['overview-icon']}></div>
                            <div>Shared files</div>
                        </div>
                    }
                >
                    <List.Item>
                        <div className={css.shared_container}>
                            <SharedFiles users={getUsers.data} sharedUserFiles={getDrives.data} self={whoAmI.data} />
                        </div>
                    </List.Item>
                </List>
            </div>
        </>
    );
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
        },
        {
            render: (__unused__value, record) => {
                const p: boolean = false || record.sharedUsers.reduce((a, c) => {
                    return a || c.delete;
                }, false) || record.sharedGroups.reduce((a, c) => {
                    return a || c.delete;
                }, false);
                if (p) {
                    return <Button icon={<CloudDownloadOutlined />} href={`/file/${record.id}`}>
                        Delete
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
        <div>
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
        <div>
            {
                currentSharedUser ? currentLocationPath.map((el, index) => {
                    const tag = <Tag color='cyan' style={{ marginRight: '5px' }} onClick={(value) => {
                        setCurrentLocationPath([...currentLocationPath].slice(0, index + 1));
                    }}>{sharedUserFiles[currentSharedUser].filter(es => es.parent === null)[0].name}</Tag>;
                    if (index < currentLocationPath.length - 1) {
                        return [tag, <span style={{ marginRight: '5px' }} key={`${el}-slash`}>/</span>];
                    } else {
                        return tag;
                    }
                }) : null
            }
            <Table
                style={{ width: '100%' }}
                columns={fileTableColumns}
                expandable={{ showExpandColumn: false }}
                dataSource={currentSharedUser ? sharedUserFiles[currentSharedUser].filter(el => {
                    return el.managerId === currentSharedUser;
                }).filter(el => el.parent === currentLocationPath[currentLocationPath.length - 1]) : []}
            />
        </div >
    </>);
};


export const CreateFolder: FunctionComponent<{ isModalShown: boolean, setIsModalShown: any, uploadFunc: any, uploadVariables: any }> = ({ isModalShown, setIsModalShown, uploadFunc, uploadVariables }) => {
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

export const UploadFile: FunctionComponent<{ func: any, currentLocationPath: string[] }> = ({ func, currentLocationPath }) => {
    return (<div>
        <Upload
            showUploadList={false}
            customRequest={async ({ file }) => {
                if (file) {
                    const fileData = file as Blob;
                    const formData = new FormData();
                    formData.append('file', fileData);

                    const response = await fetch('/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();
                    if (response.ok) {
                        func.mutate({
                            parentId: currentLocationPath[currentLocationPath.length - 1],
                            description: null,
                            file: [{
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
        >
        </Upload>
    </div>);
};


export const ShareFileModal: FunctionComponent<{ isModalShown: boolean, setIsModalShown: any, shareFunc: any, shareVariables: any, currentDrive: any, users: any[] }> = ({ isModalShown, setIsModalShown, shareFunc, shareVariables, currentDrive, users }) => {
    const [sharedUserEmails, setSharedUserEmails] = React.useState<string[]>([]);
    const [form] = Form.useForm();
    const columns = [{
        title: 'User',
        dataIndex: 'value',
        key: 'value',
        render: (__unused__value, record) => {
            const user = users.filter(el => el.id === record.iid)[0];
            return `${user.firstname} ${user.lastname}`;
        }
    }, {
        title: 'Email',
        dataIndex: 'email',
        key: 'email',
        render: (__unused__value, record) => {
            const user = users.filter(el => el.id === record.iid)[0];
            return `${user.email}`;
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
            return <Checkbox checked={record.delete}></Checkbox>;
        }
    }];
    if (!currentDrive) {
        return null;
    }

    return (
        <Modal
            width={'80%'}
            title='Share to a user'
            open={isModalShown}
            onCancel={() => setIsModalShown(false)}
        >
            <Table
                style={{ width: '100%' }}
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