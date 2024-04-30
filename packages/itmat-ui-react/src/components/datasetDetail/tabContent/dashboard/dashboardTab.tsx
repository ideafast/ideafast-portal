import { FunctionComponent } from 'react';
import { Button, Upload, Image, Row, Col, Divider, Typography, List, Form, Input, Table, Select } from 'antd';
import { MinusOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import LoadSpinner from '../../../reusable/loadSpinner';
import css from './dashboard.module.css';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { trpc } from 'packages/itmat-ui-react/src/utils/trpc';
import { IStudyConfig, enumConfigType } from '@itmat-broker/itmat-types';
const { Title } = Typography;
export const DashboardTabContent: FunctionComponent<{ studyId: string }> = ({ studyId }) => {
    const getStudies = trpc.study.getStudies.useQuery({ studyId: studyId });
    const editStudy = trpc.study.editStudy.useMutation();
    const getStudyConfig = trpc.config.getConfig.useQuery({ configType: enumConfigType.STUDYCONFIG, key: studyId, useDefault: false });
    const [form] = Form.useForm();
    if (getStudyConfig.isLoading) {
        return <LoadSpinner />;
    }
    if (getStudyConfig.isError) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }
    if (getStudies.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (getStudies.isError) {
        return <>
            An error occured.
        </>;
    }

    if (getStudies.data.length === 0) {
        return null;
    }
    const study = getStudies.data[0];
    const studyConfig = getStudyConfig.data.properties as IStudyConfig;
    return (
        <div className={css.page_container}>
            <List
                header={
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div className={css['overview-icon']}></div>
                                <div>Metadata</div>
                            </div>
                        </div>
                    </div>
                }
            >
                <div className={css.study_left}>
                    <div className={css.study_summary_wrapper}>
                        <div className={css.study_summary_profile}>
                            {
                                study.profile ? <Image width={200} height={200} src={`${window.location.origin}/file/${study.profile}`} />
                                    : <Image width={200} height={200} src="error" fallback="data:image/png;base64,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" />
                            }<br />
                            <Upload
                                multiple={false}
                                showUploadList={false}
                                beforeUpload={async (file: Blob) => {
                                    if (file) {
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        try {
                                            const response = await fetch('/upload', {
                                                method: 'POST',
                                                body: formData
                                            });

                                            if (response.ok) {
                                                const data = await response.json();
                                                editStudy.mutate({
                                                    studyId: study.id,
                                                    name: study.name,
                                                    description: study.description ?? '',
                                                    profile: [{
                                                        path: data.filePath, // This should be the path returned by the server
                                                        filename: file.name,
                                                        mimetype: file.type,
                                                        size: file.size
                                                    }]
                                                });
                                            } else {
                                                // Handle upload error
                                                const errorData = await response.text();
                                                console.error('File upload failed:', errorData);
                                            }
                                        } catch (error) {
                                            console.error('Network or other error', error);
                                        }
                                    } else {
                                        // Handle the case where the file object is not available
                                        console.error('File object was not available.');
                                    }
                                }}

                            >
                                <Button type='primary' icon={<UploadOutlined />} loading={editStudy.isLoading} shape='default'>Upload</Button>
                            </Upload>
                            <Title level={2}>{study.name}</Title>
                        </div>
                        <div className={css.profile_summary_statistics}>
                            <Row>
                                <Col className={css.profile_summary_statistics_value} span={7}>21</Col>
                                <Divider type='vertical' />
                                <Col className={css.profile_summary_statistics_value} span={7}>238</Col>
                                <Divider type='vertical' />
                                <Col className={css.profile_summary_statistics_value} span={7}>101</Col>
                            </Row>
                            <br />
                            <Row>
                                <Col className={css.profile_summary_statistics_tag} span={7}>Datasets</Col>
                                <Divider type='vertical' />
                                <Col className={css.profile_summary_statistics_tag} span={7}>Projects</Col>
                                <Divider type='vertical' />
                                <Col className={css.profile_summary_statistics_tag} span={7}>Public keys</Col>
                            </Row>
                        </div>
                    </div>
                </div>
                <div className={css.study_right}>
                </div>
            </List><br />
            <List
                header={
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div className={css['overview-icon']}></div>
                                <div>Config</div>
                            </div>
                        </div>
                    </div>
                }
            >
                <Form
                    form={form}
                    layout='horizontal'
                    initialValues={studyConfig}
                >
                    <Form.Item name="defaultMaximumFileSize" label="Default Maximum File Size (Bytes)" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="defaultRepresentationForMissingValue" label="Default Representation for Missing Value">
                        <Input />
                    </Form.Item>
                    <Form.List name="defaultFileColumns">
                        {(defaultFileColumns, { add, remove }) => {
                            return (
                                <FilePropertyBlock fileProperties={defaultFileColumns} add={add} remove={remove} />
                            );
                        }}
                    </Form.List>
                    <Form.Item name="defaultFileColumnsPropertyColor" label="Default Property Column Color" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="defaultVersioningKeys" label="Default Versioning Keys" rules={[{ required: true }]}>
                        <Select mode='tags' />
                    </Form.Item>
                </Form>
            </List>
        </div >
    );
};

export const FilePropertyBlock: FunctionComponent<{ fileProperties: any, add: any, remove: any }> = ({ fileProperties, add, remove }) => {
    const columns: any = [{
        title: 'Property Name',
        dataIndex: 'title',
        key: 'title',
        minWidth: 100,
        render: (__unused__value, __unused_value, index) => {
            return <Form.Item name={[index, 'title']}>
                <Input />
            </Form.Item>;
        }
    }, {
        title: 'Property Type',
        dataIndex: 'type',
        key: 'type',
        minWidth: 200,
        render: (__unused__value, __unused_value, index) => {
            return <Form.Item name={[index, 'type']}>
                <Input />
            </Form.Item>;
        }
    }, {
        title: 'Remove',
        dataIndex: 'remove',
        key: 'remove',
        minWidth: 200,
        render: (value, row) => {
            return (
                <Button
                    icon={<MinusOutlined />}
                    shape={'circle'}
                    onClick={() => remove((row as any).title)}
                />
            );
        }
    }];
    return (
        <Table
            dataSource={fileProperties}
            pagination={false}
            tableLayout='fixed'
            footer={() => {
                return (
                    <Form.Item>
                        <Button onClick={() => add({ title: undefined, type: undefined })}>
                            <PlusOutlined /> Add Property
                        </Button>
                    </Form.Item>
                );
            }}
            columns={columns}
        >
        </Table>
    );
};