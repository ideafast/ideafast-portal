import { ChangeEvent, FunctionComponent, useEffect, useState } from 'react';
import { Mutation } from '@apollo/client/react/components';
import { useQuery, useMutation, useApolloClient } from '@apollo/client/react/hooks';
import { IPubkey, IOrganisation, IUser, enumDocTypes, IDoc } from '@itmat-broker/itmat-types';
import { WHO_AM_I, REQUEST_USERNAME_OR_RESET_PASSWORD, GET_ORGANISATIONS, REQUEST_EXPIRY_DATE, EDIT_USER, GET_USER_PROFILE, UPLOAD_USER_PROFILE, CREATE_DOC, GET_DOCS, DELETE_DOC } from '@itmat-broker/itmat-models';
import { Subsection } from '../reusable';
import LoadSpinner from '../reusable/loadSpinner';
// import { ProjectSection } from '../users/projectSection';
import { Form, Input, Select, DatePicker, Button, Alert, Checkbox, Image, Typography, Row, Col, Divider, Upload, UploadFile, Modal, message, notification, Card, Popconfirm } from 'antd';
import dayjs from 'dayjs';
import { WarningOutlined, PlusOutlined, UploadOutlined, LinkOutlined } from '@ant-design/icons';
import { Key } from '../../utils/dmpCrypto/dmp.key';
import css from './document.module.css';
import React from 'react';
import { RcFile } from 'antd/es/upload';
import ReactQuill from 'react-quill';
const { Title } = Typography;
const { TextArea } = Input;
import 'react-quill/dist/quill.snow.css';
import { ApolloClient, ApolloError } from '@apollo/client';
import { useForm } from 'antd/es/form/Form';
const { Paragraph, Text, Link } = Typography;

const { Option } = Select;

export const DocumentSection: FunctionComponent = () => {
    const { loading: whoAmILoading, error: whoAmIError, data: whoAmIData } = useQuery(WHO_AM_I);
    const {loading: getDocsLoading, error: getDocsError, data: getDocsData} = useQuery(GET_DOCS);
    const [mode, setMode] = React.useState('VIEW'); // VIEW, EDIT, CREATE
    const [selectedDocument, setSelectedDocument] = React.useState<string | null>(null);
    const [docValue, setDocValue] = React.useState<Partial<IDoc> | null>(null);
    const store = useApolloClient();

    const [deleteDoc, {loading: deleteDocLoading, error: deleteDocError}] = useMutation(DELETE_DOC, {
        onCompleted: ({ deleteDoc }) => {
            message.success('success');
            setDocValue(null);
            const cacheData = store.readQuery({
                query: GET_DOCS
            }) as any;
            if (!cacheData) {
                return;
            }
            let newCacheData = [
                ...cacheData.getDocs,
            ].filter(el => el.id !== deleteDoc.id);
            store.writeQuery({
                query: GET_DOCS,
                data: {getDocs: newCacheData}
            });
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

    if (whoAmILoading || getDocsLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (whoAmIError || getDocsError) {
        return <>
            An error occured.
        </>;
    }

    


    return (
        <div className={css.page_container}>
            <div className={css.document_top}>
                <Button onClick={() => setMode('CREATE')}>New Document</Button>
                <Popconfirm
                    title={`Delete file ${docValue?.title ?? 'NA'}`}
                    description={`Are you sure to delete file ${docValue?.title ?? 'NA'}?`}
                    onConfirm={() => deleteDoc({variables: {docId: docValue?.id}})}
                    okText="Yes"
                    cancelText="No"
                >
                    <Button danger>Delete</Button>
                </Popconfirm>
                <Button onClick={() => {
                    setMode('VIEW'); 
                    setDocValue(null);
                }}>Cancel</Button>
                <Button onClick={() => {
                    setMode('EDIT');
                }}>Edit</Button>
            </div>
            <div className={css.document_left}>
                <DocumentList docList={getDocsData.getDocs} setSelectedDoc={setDocValue}/>
            </div>
            <div className={css.document_right}>
                {
                    mode !== 'VIEW' ? <EditDocument value={docValue} setValue={setDocValue} mode={mode} store={store}/> : <DocumentViewer doc={docValue}/>
                }
            </div>
        </div>
    );
}


export const DocumentList: FunctionComponent<{docList: Partial<IDoc>[], setSelectedDoc: any}> = ({docList, setSelectedDoc}) => {
    return (
        <Card title='Documents'>
            {
                docList.map(el => <Card.Grid style={{width: '100%'}} onClick={() => setSelectedDoc({...el})}>
                    <div>
                        <div style={{float: 'left'}}>{el.title}</div>
                        <div style={{float: 'right'}}>{el.attachmentFileIds?.length ? <LinkOutlined /> : null}</div>
                    </div><br />
                    <div>
                        <div style={{float: 'left'}}>{el.description}</div>
                        <div style={{float: 'right'}}>{el.life?.createdTime ? (new Date(el.life?.createdTime)).toLocaleDateString('en-GB') : 'NA'}</div>
                    </div>
                </Card.Grid>)
            }
        </Card>
    );
}

export const EditDocument: FunctionComponent<{value: any, setValue: any, mode: string, store: ApolloClient<object>}> = ({value, setValue, mode, store}) => {
    const [form] = Form.useForm();
    const [createDoc, {loading: createDocLoading, error: createDocError}] = useMutation(CREATE_DOC, {
        onCompleted: ({ createDoc }) => {
            message.success('success');
            form.resetFields();
            const cacheData = store.readQuery({
                query: GET_DOCS
            }) as any;
            if (!cacheData) {
                return;
            }
            const newCacheData = [
                ...cacheData.getDocs,
                {
                    ...createDoc,
                    life: {
                        createdTime: Date.now(),
                        createdUser: null,
                        deletedTime: null,
                        deletedUser: null
                    }
                }
            ];
            store.writeQuery({
                query: GET_DOCS,
                data: {getDocs: newCacheData}
            });
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
        if (value) {
            form.setFieldsValue(value);
        }
    })
    return (<>
        <Form form={form}>
            <Form.Item name='title'>
                <Input placeholder='Title'/>
            </Form.Item>
            <Form.Item name='docType'>
                <Select placeholder='Select a document type'>
                    {
                        Object.keys(enumDocTypes).map(el => <Option value={el}>{el.toString()}</Option>)
                    }
                </Select>
            </Form.Item>
            <Form.Item name='description'>
                <Input placeholder='Description'/>
            </Form.Item>
            <Form.Item name='tag'>
                <Input placeholder='Tag'/>
            </Form.Item>
            <Form.Item name='priority'>
                <Select placeholder='Select a priority'>
                    {
                        Array.from({length: 6}, (_, i) => i).map(el => <Option value={el}>{el.toString()}</Option>)
                    }
                </Select>
            </Form.Item>
            <Form.Item name='contents'>
                <ReactQuill 
                    className={css.qleditor}
                    theme="snow" 
                    value={value} 
                    onChange={(content, delta) => {
                        setValue(content);
                        form.setFieldValue('contents', content);
                    }}
                    modules={{
                        toolbar: [
                            ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
                            ['blockquote', 'code-block'],
                        
                            [{ 'header': 1 }, { 'header': 2 }],               // custom button values
                            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                            [{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
                            [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
                            [{ 'direction': 'rtl' }],                         // text direction
                        
                            [{ 'size': ['small', false, 'large', 'huge'] }],  // custom dropdown
                            [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                        
                            [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
                            [{ 'font': [] }],
                            [{ 'align': [] }],
                        
                            ['clean'],                                         // remove formatting button
                        
                            ['link', 'image', 'video']                         // link and image, video
                        ]
                    }}
                />
            </Form.Item>
            <Form.Item name='attachments'>                            
                <Upload
                    onChange={(event) => {
                        form.setFieldValue('attachments', event.fileList.map(el => el.originFileObj));
                    }}
                >
                    <Button icon={<UploadOutlined />}>Add attachments</Button> 
                </Upload>
            </Form.Item>
        </Form>
        <Button onClick={async () => {
            await createDoc({variables: {
                title: form.getFieldValue('title'),
                type: form.getFieldValue('docType'),
                description: form.getFieldValue('description') ?? null,
                tag: form.getFieldValue('tag') ?? null,
                studyId: null,
                priority: form.getFieldValue('priority') ?? 0,
                attachments: form.getFieldValue('attachments'),
                contents: form.getFieldValue('contents')
            }})
        }}>Create</Button>
    </>);
}

export const DocumentViewer: FunctionComponent<{doc: Partial<IDoc> | null}> = ({doc}) => {
    const {loading: getDocsLoading, error: getDocsError, data: getDocsData} = useQuery(GET_DOCS, {variables: {docId: doc?.id, verbose: true}}); 
    if (getDocsLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (getDocsError) {
        return <>
            An error occured.
        </>;
    }
    if (!getDocsData.getDocs) {
        return null;
    }

    // if (!doc) {
    //     return null;
    // }
    const doc_ = getDocsData.getDocs[0];

    return (
        <>
            <Row gutter={16}>
                <Col span={8}>
                <Card title="Document title" bordered={false}>
                    {doc_.title}
                </Card>
                </Col>
                <Col span={8}>
                <Card title="Document type" bordered={false}>
                    {doc_.type}
                </Card>
                </Col>
                <Col span={8}>
                <Card title="Document tag" bordered={false}>
                    {doc_.tag}
                </Card>
                </Col>
            </Row>
            <Paragraph style={{textAlign: 'center'}}>{doc_.description}</Paragraph>
            <div dangerouslySetInnerHTML={{ __html: doc_.contents}}></div>
        </>
    );
}