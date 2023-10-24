import { FunctionComponent, useEffect } from 'react';
// import { useQuery, useMutation, useApolloClient } from '@apollo/client/react/hooks';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { enumDocTypes, IDoc } from '@itmat-broker/itmat-types';
import LoadSpinner from '../reusable/loadSpinner';
// import { ProjectSection } from '../users/projectSection';
import { Form, Input, Select, Button, Typography, Row, Col, Upload, message, notification, Card, Popconfirm } from 'antd';
import { UploadOutlined, LinkOutlined } from '@ant-design/icons';
import css from './document.module.css';
import React from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

import { trpc } from '../../utils/trpc';
const { Title } = Typography;
const { TextArea } = Input;
const { Paragraph, Text, Link } = Typography;
const { Option } = Select;

export const DocumentSection: FunctionComponent = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getDocs = trpc.doc.getDocs.useQuery({ docId: null, studyId: null, docTypes: null, verbose: false });
    const [mode, setMode] = React.useState('VIEW'); // VIEW, EDIT, CREATE
    const [docValue, setDocValue] = React.useState<Partial<IDoc> | null>(null);
    const queryClient = useQueryClient();
    const deleteDoc = trpc.doc.deleteDoc.useMutation({
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['getDocs', { docId: null, studyId: null, docTypes: null, verbose: false }] });
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

    if (whoAmI.isLoading || getDocs.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (whoAmI.isError || getDocs.isError) {
        return <>
            An error occured.
        </>;
    }
    return (
        <div className={css.page_container}>
            <div className={css.document_top}>
                <Button onClick={() => {
                    setDocValue(null);
                    setMode('CREATE');
                }}>New Document</Button>
                <Popconfirm
                    title={`Delete file ${docValue?.title ?? 'NA'}`}
                    description={`Are you sure to delete file ${docValue?.title ?? 'NA'}?`}
                    onConfirm={() => deleteDoc.mutate({ docId: docValue?.id ?? '' })}
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
                <DocumentList docList={getDocs.data as any} setValue={setDocValue} />
            </div>
            <div className={css.document_right}>
                {
                    mode !== 'VIEW' ? <EditDocument value={docValue} setValue={setDocValue} mode={mode} client={queryClient} /> : <DocumentViewer doc={docValue} setValue={setDocValue} />
                }
            </div>
        </div>
    );
};


export const DocumentList: FunctionComponent<{ docList: Partial<IDoc>[], setValue: any }> = ({ docList, setValue }) => {
    return (
        <Card title='Documents'>
            {
                docList.map(el => <Card.Grid style={{ width: '100%' }} onClick={() => setValue({ ...el })}>
                    <div>
                        <div style={{ float: 'left' }}>{el.title}</div>
                        <div style={{ float: 'right' }}>{el.attachmentFileIds?.length ? <LinkOutlined /> : null}</div>
                    </div><br />
                    <div>
                        <div style={{ float: 'left' }}>{el.description}</div>
                        <div style={{ float: 'right' }}>{el.life?.createdTime ? (new Date(el.life?.createdTime)).toLocaleDateString('en-GB') : 'NA'}</div>
                    </div>
                </Card.Grid>)
            }
        </Card>
    );
};

export const EditDocument: FunctionComponent<{ value: any, setValue: any, mode: string, client: QueryClient }> = ({ value, setValue, mode, client }) => {
    const [form] = Form.useForm();
    const createDoc = trpc.doc.createDoc.useMutation({
        onSuccess: () => {
            message.success('success');
            form.resetFields();
            client.invalidateQueries({ queryKey: ['getDocs', { docId: null, studyId: null, docTypes: null, verbose: false }] });
        },
        onError: (error) => {
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
    });
    console.log(form.getFieldsValue());
    return (<>
        <Form form={form}>
            <Form.Item name='title'>
                <Input placeholder='Title' />
            </Form.Item>
            <Form.Item name='type'>
                <Select placeholder='Select a document type'>
                    {
                        Object.keys(enumDocTypes).map(el => <Option value={el}>{el.toString()}</Option>)
                    }
                </Select>
            </Form.Item>
            <Form.Item name='description'>
                <Input placeholder='Description' />
            </Form.Item>
            <Form.Item name='tag'>
                <Input placeholder='Tag' />
            </Form.Item>
            <Form.Item name='priority'>
                <Select placeholder='Select a priority'>
                    {
                        Array.from({ length: 6 }, (_, i) => i).map(el => <Option value={el}>{el.toString()}</Option>)
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

                            [{ header: 1 }, { header: 2 }],               // custom button values
                            [{ list: 'ordered' }, { list: 'bullet' }],
                            [{ script: 'sub' }, { script: 'super' }],      // superscript/subscript
                            [{ indent: '-1' }, { indent: '+1' }],          // outdent/indent
                            [{ direction: 'rtl' }],                         // text direction

                            [{ size: ['small', false, 'large', 'huge'] }],  // custom dropdown
                            [{ header: [1, 2, 3, 4, 5, 6, false] }],

                            [{ color: [] }, { background: [] }],          // dropdown with defaults from theme
                            [{ font: [] }],
                            [{ align: [] }],

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
            await createDoc.mutate({
                title: form.getFieldValue('title'),
                type: form.getFieldValue('type'),
                description: form.getFieldValue('description') ?? null,
                tag: form.getFieldValue('tag') ?? null,
                studyId: null,
                priority: form.getFieldValue('priority') ?? 0,
                attachments: form.getFieldValue('attachments'),
                contents: form.getFieldValue('contents')
            });
        }}>Create</Button >
    </>);
};

export const DocumentViewer: FunctionComponent<{ doc: Partial<IDoc> | null, setValue: any }> = ({ doc, setValue }) => {
    const getDocs = trpc.doc.getDocs.useQuery({ docId: doc?.id ?? '', studyId: null, docTypes: null, verbose: true });
    useEffect(() => {
        getDocs.data && setValue(getDocs.data[0]);
    }, [doc]);

    if (getDocs.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (getDocs.isError) {
        return <>
            An error occured.
        </>;
    }
    if (!getDocs.data) {
        return null;
    }
    // if (!doc) {
    //     return null;
    // }
    const doc_ = getDocs.data[0];
    if (doc_) {
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
                <Paragraph style={{ textAlign: 'center' }}>{doc_.description}</Paragraph>
                <div dangerouslySetInnerHTML={{ __html: doc_.contents ?? '' }}></div>
            </>
        );
    } else {
        return null;
    }
};