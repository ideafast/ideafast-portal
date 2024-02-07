import React, { FunctionComponent, useEffect } from 'react';
import css from './drive.module.css';
import { Input, Button, Row, Col, Table, Menu, notification, Modal, Tag, Upload, Tooltip, message, Form, Checkbox, List, Dropdown, Spin, Select } from 'antd';
import LoadSpinner from '../reusable/loadSpinner';
import { IUser, enumDriveNodeTypes } from '@itmat-broker/itmat-types';
import { EditOutlined, FileTwoTone, FolderTwoTone, MailOutlined, MinusOutlined, MoreOutlined, PlusOutlined, ShareAltOutlined, UploadOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { trpc } from '../../utils/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { formatBytes } from '../../utils/tools';
const { Column } = Table;
const Option = Select;
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
    const [isRecursiveUploading, setIsRecursiveUploading] = React.useState(false);
    const [uploadingFolderFileList, setUploadingFolderFileList] = React.useState<any>([]);

    const [isUploading, setIsUploading] = React.useState(false);

    // This effect handles the upload process.
    useEffect(() => {
        if (isRecursiveUploading && uploadingFolderFileList.length > 0) {
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
                    setIsUploading(true);
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
                    setIsUploading(false);
                }
                createRecursiveDrives.mutate({
                    parentId: currentLocationPath[currentLocationPath.length - 1],
                    files: tFiles,
                    paths: tPaths
                });
                setIsRecursiveUploading(false);
            };

            uploadAllFiles();
        }
    }, [isRecursiveUploading, setUploadingFolderFileList]);

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

            notification.success({
                message: `Folder ${data.name} has been created.`,
                description: '',
                placement: 'topRight',
                duration: 0
            });
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

    const createRecursiveDrives = trpc.drive.createRecursiveDrives.useMutation({
        onMutate: () => {
            setIsRecursiveUploading(true);
            setIsUploading(true);
        },
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
            notification.success({
                message: `Folder ${data[0].name} has been uploaded.`,
                description: '',
                placement: 'topRight',
                duration: 0
            });
            setIsCreatingFolder(false);
            setIsUploading(false);
        },
        onError(error) {
            notification.error({
                message: 'Upload error!',
                description: error.message || 'Unknown Error Occurred!',
                placement: 'topRight',
                duration: 0
            });
            setIsUploading(false);
        }
    });

    const createDriveFile = trpc.drive.createDriveFile.useMutation({
        onMutate: () => {
            setIsUploading(true);
        },
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
            notification.success({
                message: `File ${data.name} has been uploaded.`,
                description: '',
                placement: 'topRight',
                duration: 0
            });
            setIsUploading(false);
        },
        onError(error) {
            notification.error({
                message: 'Upload error!',
                description: error.message || 'Unknown Error Occurred!',
                placement: 'topRight',
                duration: 0
            });
            setIsUploading(false);
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

    // const editDrive = trpc.drive.editDrive.useMutation({
    //     onSuccess: (data) => {
    //         if (!data) {
    //             message.error('Edit failed');
    //             return;
    //         }
    //         // const queryKey = [['drive', 'getDrives'], { input: { userId: whoAmI?.data?.id, rootId: null }, type: 'query' }];
    //         // // log each query's key and data
    //         // const cache = queryClient.getQueryData<any[]>(queryKey) ?? [];
    //         // const newCache = cache[whoAmI.data.id].map(el => {
    //         //     if (data.driveIds.includes(el.id)) {
    //         //         return {
    //         //             ...el,
    //         //             sharedUsers: data.drive?.sharedUsers ?? []
    //         //         };
    //         //     }
    //         //     return el;
    //         // });
    //         // const newQueryCache = {
    //         //     ...cache,
    //         //     [whoAmI.data.id]: newCache
    //         // };
    //         // queryClient.setQueryData(queryKey, newQueryCache);
    //         // setIsCreatingFolder(false);
    //     },
    //     onError(error) {
    //         notification.error({
    //             message: 'Upload error!',
    //             description: error.message || 'Unknown Error Occurred!',
    //             placement: 'topRight',
    //             duration: 0
    //         });
    //     }
    // });

    const shareDriveViaEmail = trpc.drive.shareDriveToUserViaEmail.useMutation({
        onSuccess: (data) => {
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
                const icon = record.type === enumDriveNodeTypes.FILE ? <FileTwoTone /> : <FolderTwoTone />;
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
    return (
        <>
            <div className={css.file_wrapper}>
                {
                    isUploading && <LoadingIcon />
                }
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
                                        </Menu>} trigger={['click']}>
                                            <Button icon={<PlusOutlined />}>New</Button>
                                        </Dropdown>
                                    </Col>
                                    <Col span={1.5}>
                                        <Dropdown overlay={<Menu onClick={() => {
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
                                                            setIsUploading(true);
                                                            const response = await fetch('/upload', {
                                                                method: 'POST',
                                                                body: formData
                                                            });
                                                            const data = await response.json();
                                                            if (response.ok) {
                                                                createDriveFile.mutate({
                                                                    parentId: currentLocationPath[currentLocationPath.length - 1],
                                                                    file: [{
                                                                        path: data.filePath, // This should be the path returned by the server
                                                                        filename: fileData.name,
                                                                        mimetype: fileData.type,
                                                                        size: fileData.size
                                                                    }]
                                                                });
                                                                setIsUploading(false);
                                                            } else {
                                                                setIsUploading(false);
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
                                                        setUploadingFolderFileList(newFileList);
                                                        if (newFileList.every(file => file.originFileObj)) {
                                                            setIsRecursiveUploading(true);
                                                        }
                                                    }}
                                                >
                                                    {'Folder'}
                                                </Upload>
                                            </Menu.Item>
                                            {/* <Menu.Item key="otherOption2">Other Option 2</Menu.Item> */}
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
                                                className={css.customTextHover}
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
                <SharedFiles users={getUsers.data} sharedUserFiles={getDrives.data} self={whoAmI.data} deleteDriveFunc={deleteDrive} />
            </div>
        </>
    );
};

export const SharedFiles: FunctionComponent<{ users: any, sharedUserFiles: any, self: any, deleteDriveFunc: any }> = ({ users, sharedUserFiles, self, deleteDriveFunc }) => {
    const [currentSharedUser, setCurrentSharedUser] = React.useState<string | null>(null);
    const [currentLocationPath, setCurrentLocationPath] = React.useState<string[]>(['shared']);
    const sharedUsers: string[] = Object.keys(sharedUserFiles).filter(el => el !== self.id);

    const rootDrive: any = {
        id: 'shared',
        managerId: self.id,
        path: ['shared'],
        restricted: true,
        name: 'Shared',
        fileId: null,
        type: enumDriveNodeTypes.FOLDER,
        parent: null,
        children: [],
        sharedUsers: [], // ids of shared users
        sharedGroups: [] // ids of shared groups.
    };

    const reformattedFiles: any[] = [];
    for (const key of Object.keys(sharedUserFiles)) {
        if (key === self.id) {
            continue;
        }
        const files = sharedUserFiles[key];
        const root: any = sharedUserFiles[key].filter(el => el.parent === null)[0];
        // if (root) {
        //     root.parent = rootDrive.id;
        //     rootDrive.children.push(root.id);
        // }
        for (const file of files) {
            const newFile = {
                ...file,
                path: [rootDrive.id, [...file.path]]
            };
            if (newFile.parent === root?.id) {
                newFile.parent = rootDrive.id;
                rootDrive.children.push(newFile.id);
            }
            reformattedFiles.push(newFile);
        }
    }
    reformattedFiles.push(rootDrive);

    const fileTableColumns = [
        {
            title: 'Name',
            dataIndex: 'value',
            key: 'value',
            render: (__unused__value, record) => {
                const icon = record.type === enumDriveNodeTypes.FILE ? <FileTwoTone /> : <FolderTwoTone />;
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
                                    {
                                        record.sharedUsers.some(el => el.delete) || record.sharedGroups.some(el => el.delete) ?
                                            <Menu.Item key="delete" title="Delete the file from the system" onClick={() => {
                                                deleteDriveFunc.mutate({ driveId: record.id });
                                            }}>
                                                Delete
                                            </Menu.Item>
                                            : null
                                    }
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
            title: 'Sharing',
            dataIndex: 'sharedBy',
            key: 'sharedBy',
            render: (__unused__value, record) => {
                const user = users.filter(el => el.id === record.managerId)[0];

                // Define styles
                const sharedByStyle = {
                    fontWeight: 'bold',
                    color: '#555' // Example: dark gray color
                };

                const userNameStyle = {
                    color: '#007bff', // Example: blue color
                    fontWeight: 'normal'
                };

                return (
                    <span>
                        <span style={sharedByStyle}>Shared By</span>
                        {' '}
                        <span style={userNameStyle}>{user ? `${user.firstname} ${user.lastname}` : 'NA'}</span>
                    </span>
                );
            }
        }
    ];
    const items = sharedUsers.map(el => {
        const user = users.filter(es => es.id === el)[0] as any;
        return {
            id: user.id,
            key: el,
            icon: <MailOutlined />,
            // children: [],
            label: `${user.firstname} ${user.lastname}`
        };
    });
    return (
        <List
            header={
                <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div className={css['overview-icon']}></div>
                            <div>Shared Files</div>
                        </div>
                    </div>
                    <div>
                        <Select
                            placeholder='Select a user'
                            onChange={(e) => {
                                setCurrentSharedUser(e);
                                const rootNode = sharedUserFiles[e].filter(el => el.managerId === e).filter(el => el.parent === null)[0];
                                setCurrentLocationPath([rootNode.id]);
                            }}
                        >
                            {
                                items.map(el => <Option value={el.id}>{el.label}</Option>)
                            }
                        </Select>
                    </div>
                </div>
            }
        >
            <List.Item>
                <div className={css.shared_container} style={{ width: '100%' }}>
                    <div>
                        {
                            currentLocationPath.map((el, index) => {
                                const tag = <Tag className={css.customTextHover} color='cyan' style={{ marginRight: '5px' }} onClick={() => {
                                    setCurrentLocationPath(currentLocationPath.slice(0, index + 1));
                                }}>{reformattedFiles.filter(es => es.id === el)[0].name}</Tag>;
                                if (index < currentLocationPath.length - 1) {
                                    return [tag, <span style={{ marginRight: '5px' }} key={`${el}-slash`}>/</span>];
                                } else {
                                    return tag;
                                }
                            })
                        }
                        <Table
                            style={{ width: '100%' }}
                            columns={fileTableColumns}
                            expandable={{ showExpandColumn: false }}
                            dataSource={currentSharedUser ? sharedUserFiles[currentSharedUser].filter(el => {
                                return el.managerId === currentSharedUser;
                            }).filter(el => el.parent === currentLocationPath[currentLocationPath.length - 1]) : []}
                        // dataSource={reformattedFiles.filter(el => el.parent === currentLocationPath[currentLocationPath.length - 1])}
                        />
                    </div >
                </div>
            </List.Item>
        </List>
    );
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

// export const UploadFile: FunctionComponent<{ func: any, currentLocationPath: string[] }> = ({ func, currentLocationPath }) => {
//     return (<div>
//         <Upload
//             showUploadList={false}
//             customRequest={async ({ file }) => {
//                 if (file) {
//                     const fileData = file as Blob;
//                     const formData = new FormData();
//                     formData.append('file', fileData);
//                     const response = await fetch('/upload', {
//                         method: 'POST',
//                         body: formData
//                     });
//                     const data = await response.json();
//                     if (response.ok) {
//                         func.mutate({
//                             parentId: currentLocationPath[currentLocationPath.length - 1],
//                             description: null,
//                             file: [{
//                                 path: data.filePath, // This should be the path returned by the server
//                                 filename: fileData.name,
//                                 mimetype: fileData.type,
//                                 size: fileData.size
//                             }]
//                         });
//                     } else {
//                         // Handle upload error
//                         console.error('File upload failed:', data);
//                     }
//                 }
//             }}
//         >
//         </Upload>
//     </div>);
// };


export const ShareFileModal: FunctionComponent<{ isModalShown: boolean, setIsModalShown: any, shareFunc: any, shareVariables: any, currentDrive: any, users: any[] }> = ({ isModalShown, setIsModalShown, shareFunc, currentDrive, users }) => {
    const [form] = Form.useForm();
    if (!currentDrive) {
        return null;
    }
    const tmp: any = currentDrive.sharedUsers.map(el => {
        const user = users.filter(ek => ek.id === el.iid)[0];
        const tmp: any = { ...el };
        if (!user) {
            tmp.user = 'NA';
            tmp.email = 'NA';
        } else {
            tmp.user = `${user.firstname} ${user.lastname}`;
            tmp.email = user.email;
        }
        return tmp;
    });
    const reformattedSharedUsers = {
        ...currentDrive,
        sharedUsers: tmp
    };
    return (
        <Modal
            width={'80%'}
            title='Share to a user'
            open={isModalShown}
            onCancel={() => setIsModalShown(false)}
        >
            <Form name="dynamic_form_item" initialValues={reformattedSharedUsers} form={form}>
                <Form.List name="sharedUsers">
                    {(sharedUsers, { add, remove }) => {
                        return <EditPermissionTable sharedUsers={sharedUsers} add={add} remove={remove} users={users} />;
                    }}
                </Form.List>
                <Form.Item>
                    <Button type="primary" htmlType="submit" onClick={() => {
                        console.log(form.getFieldsValue());
                        for (const user of form.getFieldValue('sharedUsers')) {
                            shareFunc.mutate({
                                userEmails: [user.email],
                                driveId: currentDrive.id,
                                permissions: {
                                    read: user.read,
                                    write: user.write,
                                    delete: user.delete
                                }
                            });
                        }
                    }}>
                        Submit
                    </Button>
                </Form.Item>
            </Form>
        </Modal>
    );
};


export const EditPermissionTable: FunctionComponent<{ sharedUsers: any, add: any, remove: any, users: IUser[] }> = ({ sharedUsers, add, remove, users }) => {
    const columns: any = [{
        title: 'User',
        dataIndex: 'user',
        key: 'user',
        width: '20%',
        render: (__unused__value, record) => {
            const user = users.filter(el => el.id === record.iid)[0];
            return `${user.firstname} ${user.lastname}`;
        }
    }, {
        title: 'Email',
        dataIndex: 'email',
        key: 'email',
        width: '50%',
        render: (__unused__value, record) => {
            const user = users.filter(el => el.id === record.iid)[0];
            return `${user.email}`;
        }
    }, {
        title: 'Read',
        dataIndex: 'read',
        key: 'read',
        width: '10%',
        render: (__unused__value, record) => {
            return <Checkbox checked={record.read}></Checkbox>;
        }
    }, {
        title: 'Write',
        dataIndex: 'write',
        key: 'write',
        width: '10%',
        render: (__unused__value, record) => {
            return <Checkbox checked={record.write}></Checkbox>;
        }
    }, {
        title: 'Delete',
        dataIndex: 'delete',
        key: 'delete',
        width: '10%',
        render: (__unused__value, record) => {
            return <Checkbox checked={record.delete}></Checkbox>;
        }
    }];
    return (
        <Table
            dataSource={sharedUsers}
            pagination={false}
            footer={() => {
                return (
                    <Form.Item>
                        <Button onClick={() => add({ user: undefined, email: undefined, read: false, write: false, delete: false })}>
                            <PlusOutlined /> Add subjects
                        </Button>
                    </Form.Item>
                );
            }}
        >
            {
                columns.slice(0, 2).map(el =>
                    <Column
                        dataIndex={el.dataIndex}
                        title={el.title}
                        render={(value, row, index) => {
                            return (
                                <Form.Item name={[index, el.dataIndex]}>
                                    <Input
                                        disabled={el.dataIndex === 'email' ? false : true}
                                        placeholder={el.dataIndex}
                                        style={{ width: '30%', marginRight: 8 }}
                                    />
                                </Form.Item>
                            );
                        }}
                    />
                )
            }
            {
                columns.slice(2, 5).map(el =>
                    <Column
                        dataIndex={el.dataIndex}
                        title={el.title}
                        render={(value, row, index) => {
                            return (
                                <Form.Item name={[index, el.dataIndex]} valuePropName='checked'>
                                    <Checkbox
                                        style={{ width: '30%', marginRight: 8 }}
                                    />
                                </Form.Item>
                            );
                        }}
                    />
                )
            }
            <Column
                title={'Action'}
                render={(value, row) => {
                    return (
                        <React.Fragment>
                            <Button
                                icon={<EditOutlined />}
                                shape={'circle'}
                                style={{ marginRight: 8 }}
                            />
                            <Button
                                icon={<MinusOutlined />}
                                shape={'circle'}
                                onClick={() => remove((row as any).name)}
                            />
                        </React.Fragment>
                    );
                }}
            />
        </Table>
    );
};

const LoadingIcon = () => {
    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 1000
        }}>
            <Spin />
        </div>
    );
};