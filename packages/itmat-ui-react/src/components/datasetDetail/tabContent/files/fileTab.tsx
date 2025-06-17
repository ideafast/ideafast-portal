import React, { FunctionComponent, useState } from 'react';
import { Progress, Button, Table, List, Modal, Upload, Form, Select, Input, notification, message, Typography, Tooltip } from 'antd';
import { InboxOutlined, NumberOutlined } from '@ant-design/icons';
import { enumConfigType, IStudyConfig, IStudy, IField, enumDataTypes, IStudyFileBlock, enumUserTypes, IUserWithoutToken, deviceTypes, enumStudyBlockColumnValueType, IFile } from '@itmat-broker/itmat-types';
import LoadSpinner from '../../../reusable/loadSpinner';
import css from './fileRepo.module.css';
import { trpc } from '../../../../utils/trpc';
import { formatBytes, stringCompareFunc, tableColumnRender } from '../../../../utils/tools';
import { UploadChangeParam } from 'antd/lib/upload';
import { RcFile, UploadFile } from 'antd/lib/upload/interface';
import axios from 'axios';
import { validate } from '@ideafast/idgen';
import dayjs from 'dayjs';
import Highlighter from 'react-highlight-words';
import { useQueryClient } from '@tanstack/react-query';
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
        <List
            header={
                <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div className={css['overview-icon']}></div>
                        <div>Description</div>
                    </div>
                </div>
            }
        >
            <List.Item>
                <Typography.Paragraph style={{ whiteSpace: 'pre-line' }}>
                    {study.description}
                </Typography.Paragraph>
            </List.Item>
        </List>
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
    </div >;
};

export const UploadFileComponent: FunctionComponent<{ study: IStudy, fields: IField[], fieldIds: string[], setIsUploading: (isUploading: boolean) => void, setProgress: (progress: number) => void }> = ({ study, fields, fieldIds, setIsUploading, setProgress }) => {
    const queryClient = useQueryClient();
    const [__unused__api, contextHolder] = notification.useNotification();
    const [isShowPanel, setIsShowPanel] = React.useState(false);
    const [fileList, setFileList] = useState<RcFile[]>([]);
    const [fileProperties, setFileProperties] = useState({
        fieldId: ''
    });
    const getCurrentDomain = trpc.domain.getCurrentDomain.useQuery();
    const whoAmI = trpc.user.whoAmI.useQuery();
    const [form] = Form.useForm();
    let selectedField = fields.filter(el => el.fieldId === fileProperties.fieldId)[0];

    if (getCurrentDomain.isLoading || whoAmI.isLoading) {
        return <LoadSpinner />;
    }

    if (getCurrentDomain.isError || whoAmI.isError) {
        return <div>An error occured.</div>;
    }

    const handleUploadFile = async (variables: Record<string, string>) => {
        try {
            setIsShowPanel(false);
            setIsUploading(true);
            const formData = new FormData();

            // Append file
            if (fileList.length > 0) {
                formData.append('file', fileList[0]);
            }

            // Append additional fields
            formData.append('fieldId', String(variables.fieldId));
            formData.append('studyId', String(variables.studyId));
            formData.append('properties', JSON.stringify({
                ...variables,
                FileName: fileList[0]?.name || 'unknown'
            }));
            // Axios request
            const response = await axios.post('/trpc/data.uploadStudyFileData', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        setProgress(percentCompleted);
                    }
                }
            });
            if (response?.data?.result?.data?.id) {
                const queryKey = [['data', 'getFiles'], {
                    input: {
                        studyId: study.id,
                        fieldIds: fieldIds,
                        useCache: false,
                        readable: true
                    }, type: 'query'
                }];
                const cache: IFile[] = queryClient.getQueryData(queryKey) ?? [];
                const newCache = [...cache, response.data.result.data];
                queryClient.setQueryData(queryKey, newCache);
                void queryClient.invalidateQueries(['data', 'getFiles', {
                    input: {
                        studyId: study.id,
                        fieldIds: fieldIds,
                        useCache: false,
                        readable: true
                    }
                }]);
                setIsUploading(false);
                setIsShowPanel(false);
                void message.success('File has been uploaded.');
            }

        } catch (error) {
            // Check if the error is an AxiosError and handle it accordingly
            if (axios.isAxiosError(error)) {
                void message.error(String(JSON.parse(error.request?.response).error.message));
            } else {
                // Handle non-Axios errors
                void message.error('An unexpected error occurred.');
            }
        } finally {
            setIsUploading(false);
            setProgress(0);
        }

    };
    return (<div>
        {contextHolder}
        {
            whoAmI.data.type === enumUserTypes.ADMIN ? (
                <Button style={{ backgroundColor: 'powderblue' }} onClick={() => setIsShowPanel(true)}>Upload Files</Button>
            ) : null
        }
        <Modal
            open={isShowPanel}
            onCancel={() => {
                setIsShowPanel(false);
                setFileList([...[]]);
            }}
            onOk={() => {
                void handleUploadFile({
                    ...form.getFieldsValue(),
                    studyId: study.id
                });
                setFileList([]);
                form.resetFields();
            }}
        >
            <Upload.Dragger
                key={fileList.length}
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
                    if (getCurrentDomain.data?.name === 'IDEA-FAST' && study.description?.startsWith('IDEA-FAST')) {
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
                                        properties.startDate = startDate.format('YYYYMMDD');
                                    if (endDate.isValid() && (endDate.isSame(dayjs()) || endDate.isBefore(dayjs())))
                                        properties.endDate = endDate.format('YYYYMMDD');
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
                        } catch {
                            void message.error('Failed to upload file. Please check the file name format.');
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
                    (selectedField && selectedField.properties) ? selectedField.properties.filter(el => el.name !== 'FileName').map(el =>
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
    </div >);
};

export const FileBlock: FunctionComponent<{ user: IUserWithoutToken, fields: IField[], study: IStudy, block: IStudyFileBlock }> = ({ user, fields, study, block }) => {
    const [isUploading, setIsUploading] = useState(false);
    const queryClient = useQueryClient();
    const [progress, setProgress] = useState(0);
    const [searchedKeyword, setSearchedKeyword] = useState<string | undefined>(undefined);
    const getFiles = trpc.data.getFiles.useQuery({ studyId: study.id, fieldIds: block.fieldIds, readable: true, useCache: false });
    const deleteFile = trpc.data.deleteFile.useMutation({
        onSuccess: (data) => {
            const queryKey = [['data', 'getFiles'], {
                input: {
                    studyId: study.id,
                    fieldIds: fields.map(el => el.fieldId),
                    useCache: false,
                    readable: true
                }, type: 'query'
            }];
            const cache: IFile[] = queryClient.getQueryData(queryKey) ?? [];
            const newCache = cache.filter(el => el.id !== data.id);
            queryClient.setQueryData(queryKey, newCache);
            void queryClient.invalidateQueries(['data', 'getFiles', {
                input: {
                    studyId: study.id,
                    fieldIds: fields.map(el => el.fieldId),
                    useCache: false,
                    readable: true
                }
            }]);
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
                return <Button danger onClick={() => deleteFile.mutate({ fileId: record.id })}>Delete</Button>;
            }
        });
    }

    const filteredFiles = getFiles.data.filter(el => {
        if (!searchedKeyword) {
            return true;
        } else {
            const keyword = searchedKeyword.toLowerCase();
            if (
                el.fileName?.toLowerCase().includes(keyword) ||
                el.life?.createdUser?.toLowerCase().includes(keyword) ||
                Object.keys(el.properties ?? {}).some(key => String(el.properties?.[key]).toLowerCase().includes(keyword))
            ) {
                return true;
            }
            return false;
        }
    }).sort((a, b) => (b.life?.createdTime ?? 0) - (a.life?.createdTime ?? 0));

    return <List
        header={
            <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div className={css['overview-icon']}></div>
                    <div>{block.title}</div>
                </div>
                <div>
                    <UploadFileComponent study={study} fields={fields.filter(el => el.dataType === enumDataTypes.FILE)} fieldIds={block.fieldIds} setIsUploading={setIsUploading} setProgress={setProgress} />
                </div>
            </div>
        }
    >
        <List.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div style={{ width: '50%' }}>
                    <Input
                        value={searchedKeyword}
                        placeholder="Search"
                        onChange={(e) => setSearchedKeyword(e.target.value)}
                    />
                </div>
                <div style={{ width: '20%', textAlign: 'right' }}>
                    {
                        isUploading ? (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '2%',
                                    right: '25%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    transform: 'translate(-50%, -50%)'
                                }}
                            >
                                <Progress type='circle' size={60} percent={Math.min(progress, 99)} />
                                <span style={{ fontSize: '20px', fontWeight: 'bold', color: 'black', marginRight: '20px' }}>{progress >= 99 ? 'Finishing' : 'Uploading'}</span>
                            </div>
                        ) : null
                    }
                </div>
                <div style={{ width: '30%', textAlign: 'right' }}>
                    <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'black', marginRight: '20px' }}>
                        {`Files: ${filteredFiles.length}`}
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'black', marginRight: '20px' }}>
                        {`Size: ${formatBytes(filteredFiles.reduce((acc, curr) => acc + (Number(curr?.fileSize) || 0), 0))}`}
                    </span>
                </div>
            </div>
        </List.Item>
        <List.Item>
            <div style={{ fontSize: '20px', width: '100%' }}>
                <Table
                    columns={columns}
                    expandable={{ showExpandColumn: false }}
                    dataSource={filteredFiles}
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
            sorter: (a, b) => {
                if (bcolumn.type === enumStudyBlockColumnValueType.TIME) {
                    return (new Date(tableColumnRender(a, bcolumn))).valueOf() - (new Date(tableColumnRender(b, bcolumn))).valueOf();
                }
                return stringCompareFunc(tableColumnRender(a, bcolumn), tableColumnRender(b, bcolumn));
            },
            render: (__unused__value, record) => {
                const formattedText = tableColumnRender(record, bcolumn);
                if (searchedKeyword)
                    return <Highlighter searchWords={[searchedKeyword]} textToHighlight={formattedText} highlightStyle={{
                        backgroundColor: '#FFC733',
                        padding: 0
                    }} />;
                else
                    return formattedText;
            }
        });
    }
    columns.push({
        title: '',
        dataIndex: 'hash',
        render: (__unused__value, record) => (
            <Tooltip title={record.hash} placement='bottomRight' >
                <Button type='link' icon={<NumberOutlined />}></Button>
            </Tooltip>
        ),
        // width: '8rem',
        key: 'delete'
    });
    return columns;
}

