/* eslint-disable @nx/enforce-module-boundaries */
import React, { FunctionComponent, useState } from 'react';
import { Button, Table, List, Modal, Upload, Form, Select, Input, notification, message } from 'antd';
import { CloudDownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { enumConfigType, IStudyConfig, IStudy, IField, enumDataTypes, IStudyFileBlock, enumUserTypes, IUserWithoutToken, deviceTypes } from '@itmat-broker/itmat-types';
import LoadSpinner from '../../../reusable/loadSpinner';
import css from './fileRepo.module.css';
import { trpc } from '../../../../utils/trpc';
import { convertFileListToApiFormat, stringCompareFunc, tableColumnRender } from 'packages/itmat-ui-react/src/utils/tools';
import { UploadChangeParam } from 'antd/lib/upload';
import { RcFile, UploadFile } from 'antd/lib/upload/interface';
import axios from 'axios';
import { validate } from '@ideafast/idgen';
import dayjs from 'dayjs';
import { formatBytes } from '../../../../utils/tools';
import Highlighter from 'react-highlight-words';
import ClipLoader from 'react-spinners/ClipLoader';

const { Option } = Select;

export const FileRepositoryTabContent: FunctionComponent<{ study: IStudy }> = ({ study }) => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getStudyConfig = trpc.config.getConfig.useQuery({ configType: enumConfigType.STUDYCONFIG, key: study.id, useDefault: true });
    const getStudyFields = trpc.data.getStudyFields.useQuery({ studyId: study.id });

    if (whoAmI.isLoading || getStudyConfig.isLoading || getStudyFields.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }

    if (whoAmI.isError || getStudyConfig.isError || getStudyFields.isError) {
        const errorMessage = (
            <div>
                <p>An error occurred:</p>
                {whoAmI.isError && <p>{`whoAmI error: ${whoAmI.error.message}`}</p>}
                {getStudyConfig.isError && <p>{`getStudyConfig error: ${getStudyConfig.error.message}`}</p>}
                {getStudyFields.isError && <p>{`getStudyFields error: ${getStudyFields.error.message}`}</p>}
            </div>
        );

        return <div>{errorMessage}</div>;
    }
    return <div className={css['tab_page_wrapper']}>
        {
            ((getStudyConfig.data.properties as IStudyConfig).defaultFileBlocks ?? []).map((block, index) => (
                <FileBlock
                    key={`Fileblock_${index}`}
                    user={whoAmI.data}
                    fields={getStudyFields.data}
                    study={study}
                    block={block}
                />
            ))
        }
    </div>;
};

export const UploadFileComponent: FunctionComponent<{ study: IStudy, fields: IField[] }> = ({ study, fields }) => {
    const [__unused__api, contextHolder] = notification.useNotification();
    const [isShowPanel, setIsShowPanel] = React.useState(false);
    const [fileList, setFileList] = useState<RcFile[]>([]);
    const [fileProperties, setFileProperties] = useState({
        fieldId: ''
    });
    const [isUploading, setIsUploading] = useState(false);
    const getCurrentDomain = trpc.domain.getCurrentDomain.useQuery();
    const [form] = Form.useForm();
    let selectedField = fields.filter(el => el.fieldId === fileProperties.fieldId)[0];

    if (getCurrentDomain.isLoading) {
        return <LoadSpinner />;
    }

    if (getCurrentDomain.isError) {
        return <div>An error occured.</div>;
    }

    const handleUploadFile = async (variables: Record<string, string>) => {
        try {
            setIsShowPanel(false);
            setIsUploading(true);
            const files = await convertFileListToApiFormat(fileList, 'file');
            const formData = new FormData();
            if (files.length > 0) {
                files.forEach(file => {
                    formData.append('file', file.stream, file.originalname);
                });
            }

            formData.append('fieldId', String(variables.fieldId));
            formData.append('studyId', String(variables.studyId));
            formData.append('properties', JSON.stringify({
                ...variables
            }));

            const response = await axios.post('/trpc/data.uploadStudyFileData', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (response?.data?.result?.data?.id) {
                setIsUploading(false);
                setIsShowPanel(false);
                void message.success('File has been uploaded.');
            }

        } catch (error) {
            void message.error('Failed to upload file.');
        }
        finally {
            setIsUploading(false);
        }
    };

    return (<div>
        {contextHolder}
        <Button style={{ backgroundColor: 'powderblue' }} onClick={() => setIsShowPanel(true)}>Upload Files</Button>
        <Modal
            open={isShowPanel}
            onCancel={() => setIsShowPanel(false)}
            onOk={() => void handleUploadFile({
                ...form.getFieldsValue(),
                studyId: study.id
            })}
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
                    // We set a special case for IDEA-FAST project because the validator could not be merged into the new rules
                    if (getCurrentDomain.data?.name === 'IDEA-FAST') {
                        try {
                            if (validFiles.length !== 1) {
                                return;
                            }
                            const fileName = validFiles[0].name;
                            const matcher = /(.{1})(.{6})-(.{3})(.{6})-(\d{8})-(\d{8})\.(.*)/;
                            const particules = fileName.match(matcher);
                            const properties: Record<string, string | number> = {};
                            if (!particules) {
                                return;
                            }
                            if (particules?.length === 8) {
                                if (validate(particules[2].toUpperCase()))
                                    properties.subjectId = `${particules[1].toUpperCase()}${particules[2].toUpperCase()}`;
                                if (validate(particules[4].toUpperCase()))
                                    properties.deviceId = `${particules[3].toUpperCase()}${particules[4].toUpperCase()}`;
                                const startDate = dayjs(particules[5], 'YYYYMMDD');
                                const endDate = dayjs(particules[6], 'YYYYMMDD');
                                if (startDate.isSame(endDate) || startDate.isBefore(endDate)) {
                                    if (startDate.isValid())
                                        properties.startDate = startDate.valueOf();
                                    if (endDate.isValid() && (endDate.isSame(dayjs()) || endDate.isBefore(dayjs())))
                                        properties.endDate = endDate.valueOf();
                                }
                            }
                            const fieldId = `Device_${deviceTypes[particules[3]].replace(/ /g, '_')}`;
                            form.setFieldsValue({
                                fieldId: fieldId,
                                subjectId: properties.subjectId,
                                deviceId: properties.deviceId,
                                startDate: properties.startDate,
                                endDate: properties.endDate
                            });
                            setFileProperties({
                                fieldId: fieldId
                            });
                            selectedField = fields.filter(el => el.fieldId === fieldId)[0];
                        } catch (error) {
                            void message.error('Failed to upload file.');
                        }
                    }
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
                    labelCol={{ span: 8 }}
                    wrapperCol={{ span: 16 }}
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
                            labelCol={{ span: 8 }}
                            wrapperCol={{ span: 16 }}
                        >
                            <Input />
                        </Form.Item>
                    )
                        : null
                }
            </Form>
        </Modal>
        {
            isUploading ? (
                <div
                    style={{
                        position: 'absolute',
                        top: '10%',
                        right: '0%',
                        display: 'flex',
                        alignItems: 'center',
                        transform: 'translate(-50%, -50%)'
                    }}
                >
                    <ClipLoader />
                    <span style={{ marginLeft: '8px' }}>Uploading...Please wait</span>
                </div>
            ) : null
        }
    </div >);
};

export const FileBlock: FunctionComponent<{ user: IUserWithoutToken, fields: IField[], study: IStudy, block: IStudyFileBlock }> = ({ user, fields, study, block }) => {
    const [searchedKeyword, setSearchedKeyword] = useState<string | undefined>(undefined);
    const getFiles = trpc.data.getFiles.useQuery({ studyId: study.id, fieldIds: block.fieldIds, readable: true, useCache: false });
    const deleteFile = trpc.data.deleteFile.useMutation({
        onSuccess: () => {
            void message.success('File has been deleted.');
        },
        onError: () => {
            void message.error('Failed to delete file.');
        }
    });
    if (getFiles.isLoading) {
        return <LoadSpinner />;
    }
    if (getFiles.isError) {
        return <div>An error occured.</div>;
    }
    const columns = generateTableColumns(block, searchedKeyword);
    if (user.type === enumUserTypes.ADMIN) {
        columns.push({
            title: '',
            dataIndex: 'delete',
            key: 'delete',
            render: (__unused__value, record) => {
                return <Button onClick={() => deleteFile.mutate({ fileId: record.id })}>Delete</Button>;
            }
        });
    }

    return <List
        header={
            <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div className={css['overview-icon']}></div>
                    <div>{block.title}</div>
                </div>
                <div>
                    <UploadFileComponent study={study} fields={fields.filter(el => el.dataType === enumDataTypes.FILE)} />
                </div>
            </div>
        }
    >
        <List.Item>
            <div style={{ width: '100%' }}>
                <Input value={searchedKeyword} placeholder='Search' onChange={(e) => setSearchedKeyword(e.target.value)} />
            </div>
        </List.Item>
        <List.Item>
            <div style={{ fontSize: '20px', width: '100%' }}>
                <Table
                    columns={columns}
                    expandable={{ showExpandColumn: false }}
                    dataSource={getFiles.data.filter(el => {
                        if (!searchedKeyword) {
                            return true;
                        } else {
                            const keyword = searchedKeyword.toLowerCase();
                            if (
                                el.fileName.toLowerCase().includes(keyword) ||
                                Object.keys(el.properties).some(key => String(el.properties[key]).toLowerCase().includes(keyword))
                            ) {
                                return true;
                            }
                            return false;
                        }
                    })}
                />
            </div>
        </List.Item>
    </List>;
};

type CustomColumnType = {
    title: React.ReactNode;
    dataIndex: string;
    key: string;
    sorter?: (a, b) => number;
    render?: (value, record) => React.ReactNode;
};

function generateTableColumns(block: IStudyFileBlock, searchedKeyword: string | undefined) {
    const columns: CustomColumnType[] = [{
        title: 'File Name',
        dataIndex: 'fileName',
        key: 'fileName',
        sorter: (a, b) => { return stringCompareFunc(a.fileName, b.fileName); },
        render: (__unused__value, record) => {
            if (searchedKeyword)
                return <Highlighter searchWords={[searchedKeyword]} textToHighlight={record.fileName} highlightStyle={{
                    backgroundColor: '#FFC733',
                    padding: 0
                }} />;
            else
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
        title: 'Uploaded Time',
        dataIndex: 'uploadedTime',
        key: 'uploadedTime',
        sorter: (a, b) => { return (new Date(a.life.createdTime)).valueOf() - (new Date(b.life.createdTime)).valueOf(); },
        render: (__unused__value, record) => {
            return (new Date(record.life.createdTime)).toLocaleDateString();
        }
    }, {
        title: 'Uploaded By',
        dataIndex: 'uploadedBy',
        key: 'uploadedBy',
        render: (__unused__value, record) => {
            if (searchedKeyword)
                return <Highlighter searchWords={[searchedKeyword]} textToHighlight={record.life.createdUser} highlightStyle={{
                    backgroundColor: '#FFC733',
                    padding: 0
                }} />;
            else
                return record.life.createdUser;
        }
    }];
    for (const bcolumn of block.defaultFileColumns) {
        columns.push({
            title: <span style={{ color: 'black' }}>{bcolumn.title}</span>,
            dataIndex: bcolumn.property,
            key: bcolumn.property,
            render: (__unused__value, record) => {
                return tableColumnRender(record, bcolumn);
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

