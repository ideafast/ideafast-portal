/* eslint-disable @nx/enforce-module-boundaries */
import React, { FunctionComponent, useState } from 'react';
import { Button, Tag, Table, List, Tooltip, Modal, Upload, Form, Select, Input, notification } from 'antd';
import { CloudDownloadOutlined, FolderOutlined, FileOutlined, InboxOutlined, SmileOutlined } from '@ant-design/icons';
import { IFile, enumConfigType, IStudyConfig, IStudy, IField, enumDataTypes } from '@itmat-broker/itmat-types';
import { formatBytes } from '../../../reusable/fileList/fileList';
import LoadSpinner from '../../../reusable/loadSpinner';
import css from './fileRepo.module.css';
import { trpc } from '../../../../utils/trpc';
import { stringCompareFunc, tableColumnRender } from 'packages/itmat-ui-react/src/utils/tools';
import { UploadChangeParam } from 'antd/lib/upload';
import { RcFile, UploadFile } from 'antd/lib/upload/interface';

const { Option } = Select;
export const FileRepositoryTabContent: FunctionComponent<{ studyId: string }> = ({ studyId }) => {
    const [selectedFileCat, setSelectedFileCat] = React.useState<string[] | undefined>(undefined);
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getStudy = trpc.study.getStudies.useQuery({ studyId: studyId });
    const studyConfig = trpc.config.getConfig.useQuery({ configType: enumConfigType.STUDYCONFIG, key: studyId, useDefault: true });
    const getFiles = trpc.data.getFiles.useQuery({ studyId: studyId, fieldIds: selectedFileCat, useCache: false, forceUpdate: false, aggregation: {}, readable: true });
    const getStudyLevelFiles = trpc.data.getFiles.useQuery({ studyId: studyId, fieldIds: ['reserved_study_level_data'], useCache: false, forceUpdate: false, aggregation: {}, readable: true });

    const getStudyFields = trpc.data.getStudyFields.useQuery({ studyId: studyId });

    if (whoAmI.isLoading || getStudy.isLoading || studyConfig.isLoading || getFiles.isLoading || getStudyFields.isLoading || getStudyLevelFiles.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (whoAmI.isError || getStudy.isError || studyConfig.isError || getFiles.isError || getStudyFields.isError || getStudyLevelFiles.isError) {
        return <>
            An error occured.
        </>;
    }
    const columns = generateTableColumns(studyConfig.data.properties);
    return <>
        <div className={css['tab_page_wrapper']}>
            <List
                header={
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div className={css['overview-icon']}></div>
                            <div>Participant Level Files</div>
                            <Select
                                placeholder='Select a file category for filter'
                                allowClear
                                filterOption={(input: string, option?: { label: string; value: string }) =>
                                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                                showSearch
                                onChange={(e) => {
                                    setSelectedFileCat([e]);
                                }}
                            >
                                {
                                    getStudyFields.data.filter(el => el.dataType === enumDataTypes.FILE).map(el =>
                                        <Option value={el.fieldId} label={el.fieldName}>{el.fieldName}</Option>
                                    )
                                }
                            </Select>
                        </div>
                        <div>
                            <UploadFileComponent study={getStudy.data[0]} fields={getStudyFields.data.filter(el => el.dataType === enumDataTypes.FILE)} />
                        </div>
                    </div>
                }
            >
                <List.Item>
                    <div style={{ fontSize: '20px' }}>
                        <Table
                            columns={columns}
                            expandable={{ showExpandColumn: false }}
                            dataSource={getFiles.data}
                        />
                    </div>
                </List.Item>
            </List>
            <List
                header={
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div className={css['overview-icon']}></div>
                            <div>Study Level Files</div>
                        </div>
                    </div>
                }
            >
                <List.Item>
                    <div style={{ fontSize: '20px', width: '100%' }}>
                        <Table
                            columns={columns.slice(0, 5)}
                            expandable={{ showExpandColumn: false }}
                            dataSource={getStudyLevelFiles.data}
                        />
                    </div>
                </List.Item>
            </List>
            <List
                header={
                    <div className={css['overview-header']}>
                        <div className={css['overview-icon']}></div>
                        <div>File Tree</div>
                    </div>
                }
            >
                <List.Item>
                    <FileTree study={getStudy.data[0]} files={getFiles.data} />
                </List.Item>
            </List>
        </div>
        <div>

        </div>
    </>;
};

export const UploadFileComponent: FunctionComponent<{ study: IStudy, fields: IField[] }> = ({ study, fields }) => {
    const [api, contextHolder] = notification.useNotification();
    const [isShowPanel, setIsShowPanel] = React.useState(false);
    const [fileList, setFileList] = useState<Blob[]>([]);
    const [fileProperties, setFileProperties] = useState({
        fieldId: ''
    });
    const uploadStudyFileData = trpc.data.uploadStudyFileData.useMutation({
        onSuccess: (() => {
            api.open({
                message: 'File has been uploaded',
                description: '',
                duration: 10,
                icon: <SmileOutlined style={{ color: '#108ee9' }} />
            });
            setIsShowPanel(false);
        })
    });
    const [form] = Form.useForm();
    const selectedField = fields.filter(el => el.fieldId === fileProperties.fieldId)[0];

    return (<div>
        {contextHolder}
        <Button style={{ backgroundColor: 'powderblue' }} onClick={() => setIsShowPanel(true)}>Upload Files</Button>
        <Modal
            open={isShowPanel}
            onCancel={() => setIsShowPanel(false)}
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
                        uploadStudyFileData.mutate({
                            studyId: study.id,
                            file: [{
                                path: data.filePath, // This should be the path returned by the server
                                filename: fileData.name,
                                mimetype: fileData.type,
                                size: fileData.size
                            }],
                            properties: form.getFieldsValue(),
                            fieldId: form.getFieldValue('fieldId')
                        });
                    } else {
                        // Handle upload error
                        console.error('File upload failed:', data);
                    }
                }
            }}
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
                    Drag files here or click to select files
                </p>
            </Upload.Dragger>
            <Form
                form={form}
                layout='horizontal'
            >
                <Form.Item
                    name="fieldId"
                    label="File Category"
                    rules={[{ required: true }]}
                    labelCol={{ span: 8 }} // Label column width
                    wrapperCol={{ span: 16 }} // Input column width
                >
                    <Select
                        placeholder='Select a file category'
                        allowClear
                        onChange={(value) => setFileProperties({ fieldId: value })}
                        filterOption={(input: string, option?: { label: string; value: string }) =>
                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                        showSearch
                    >
                        {fields.map(el => <Option value={el.fieldId} label={el.fieldId}>{el.fieldName}</Option>)}
                    </Select>
                </Form.Item>
                {
                    (selectedField && selectedField.properties) ? selectedField.properties.map(el =>
                        <Form.Item
                            key={el.name}
                            name={el.name}
                            label={el.name}
                            rules={[{ required: el.required }]}
                            labelCol={{ span: 8 }} // Label column width
                            wrapperCol={{ span: 16 }} // Input column width
                        >
                            <Input />
                        </Form.Item>
                    )
                        : null
                }
            </Form>
        </Modal>
    </div >);
};

export const FileTree: FunctionComponent<{ study: IStudy, files: IFile[] }> = ({ study, files }) => {
    const [currentLocationPath, setCurrentLocationPath] = useState<string[]>([study.name]);
    const studyConfig = trpc.config.getConfig.useQuery({ configType: enumConfigType.STUDYCONFIG, key: study.id, useDefault: false });
    if (studyConfig.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (studyConfig.isError) {
        return <>
            An error occured.
        </>;
    }

    const maxPathLength = (studyConfig.data.properties as IStudyConfig)?.defaultFileDirectoryStructure?.pathLabels?.length ?? 10000;
    const fileTableColumns = [
        {
            title: 'Folder Name',
            dataIndex: 'value',
            key: 'value',
            width: 200, // Adjust this width as required
            render: (__unused__value, record) => {
                const content = currentLocationPath.length === maxPathLength
                    ? <span><FileOutlined />&nbsp;{record.name}</span>
                    : <span className={css['custom-text-hover']} onClick={() => {
                        if (currentLocationPath.length < maxPathLength) {
                            setCurrentLocationPath([...currentLocationPath, record.name]);
                        }
                    }}>
                        <FolderOutlined />&nbsp;{record.name}
                    </span>;

                return (
                    <Tooltip title={record.name}>
                        <div>
                            {content}
                        </div>
                    </Tooltip >
                );
            }
        }
    ];
    return <div>
        {
            currentLocationPath.map((el, index) => {
                const tag = <Tag color='cyan' style={{ marginRight: '5px' }} onClick={() => {
                    setCurrentLocationPath([...currentLocationPath].slice(0, index + 1));
                }}>{el}</Tag>;
                if (index < currentLocationPath.length - 1) {
                    return [tag, <span style={{ marginRight: '5px' }} key={`${el}-slash`}>/</span>];
                } else {
                    return tag;
                }
            })
        }
        <br />
        <Table
            columns={currentLocationPath.length === maxPathLength ? generateTableColumns(studyConfig.data.properties) : fileTableColumns}
            expandable={{ showExpandColumn: false }}
            dataSource={currentLocationPath.length !== maxPathLength ? Array.from(new Set(files.filter(el => currentLocationPath.every((part, index) => el.path[index] === part)).map(el => el.path[currentLocationPath.length]))).map(el => {
                return {
                    name: el
                };
            }) : files.filter(el => currentLocationPath.every((part, index) => el.path[index] === part))}
        />
    </div>;
};

type CustomColumnType = {
    title: React.ReactNode;
    dataIndex: string;
    key: string;
    sorter?: any;
    render?: (value: any, record: any) => React.ReactNode;
};

function generateTableColumns(properties) {
    const columns: CustomColumnType[] = [{
        title: 'File Name',
        dataIndex: 'fileName',
        key: 'fileName',
        sorter: (a, b) => { return stringCompareFunc(a.fileName, b.fileName); },
        render: (__unused__value, record) => {
            return record.fileName;
        }
    }, {
        title: 'File Size',
        dataIndex: 'fileSize',
        key: 'fileSize',
        sorter: (a, b) => { return a.fileSize - b.fileSize; },
        render: (__unused__value, record) => {
            return formatBytes(record.fileSize);
        }
    }, {
        title: 'File Type',
        dataIndex: 'fileType',
        key: 'fileType',
        render: (__unused__value, record) => {
            return record.properties['File Type']?.toUpperCase();
        }
    }, {
        title: 'Uploaded Time',
        dataIndex: 'uploadedTime',
        key: 'uploadedTime',
        sorter: (a, b) => { return (new Date(a.life.createdTime)).valueOf() - (new Date(b.life.createdTime)).valueOf(); },
        render: (__unused__value, record) => {
            return (new Date(record.life.createdTime)).toDateString();
        }
    }, {
        title: 'Uploaded By',
        dataIndex: 'uploadedBy',
        key: 'uploadedBy',
        render: (__unused__value, record) => {
            return record.life.createdUser;
        }
    }];
    for (const property of properties.defaultFileColumns) {
        columns.push({
            title: <span style={{ color: properties.defaultFileColumnsPropertyColor }}>{property.title}</span>,
            dataIndex: property.title,
            key: property.title,
            render: (__unused__value, record) => {
                return tableColumnRender(record, property);
            }
        });
    }
    columns.push({
        title: '',
        dataIndex: 'download',
        key: 'download',
        render: (__unused__value, record) => {
            return <Button
                icon={<CloudDownloadOutlined />}
                download={`${record.fileName}`}
                href={`/file/${record.id}`}>
                Download
            </Button>;
        }
    });

    return columns;
}

