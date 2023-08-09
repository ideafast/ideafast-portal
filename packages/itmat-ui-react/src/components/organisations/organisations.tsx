import { ChangeEvent, FunctionComponent, useEffect, useState } from 'react';
import { Mutation } from '@apollo/client/react/components';
import { useQuery, useMutation, useApolloClient } from '@apollo/client/react/hooks';
import { IPubkey, IOrganisation, IUser, enumDocTypes, IDoc } from '@itmat-broker/itmat-types';
import { WHO_AM_I, REQUEST_USERNAME_OR_RESET_PASSWORD, GET_ORGANISATIONS, REQUEST_EXPIRY_DATE, EDIT_USER, GET_USER_PROFILE, UPLOAD_USER_PROFILE, CREATE_DOC, GET_DOCS, DELETE_DOC } from '@itmat-broker/itmat-models';
import { Subsection } from '../reusable';
import LoadSpinner from '../reusable/loadSpinner';
// import { ProjectSection } from '../users/projectSection';
import { Form, Input, Select, DatePicker, Button, Alert, Checkbox, Image, Typography, Row, Col, Divider, Upload, UploadFile, Modal, message, notification, Card, Popconfirm, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { WarningOutlined, PlusOutlined, UploadOutlined, LinkOutlined } from '@ant-design/icons';
import { Key } from '../../utils/dmpCrypto/dmp.key';
import css from './organisations.module.css';
import React from 'react';
import { RcFile } from 'antd/es/upload';
import ReactQuill from 'react-quill';
const { Title } = Typography;
const { TextArea } = Input;
import 'react-quill/dist/quill.snow.css';
import { ApolloClient, ApolloError } from '@apollo/client';
import { useForm } from 'antd/es/form/Form';
import Meta from 'antd/es/card/Meta';
const { Paragraph, Text, Link } = Typography;

const { Option } = Select;
 
  

export const OrganisationSection: FunctionComponent = () => {
    const { loading: whoAmILoading, error: whoAmIError, data: whoAmIData } = useQuery(WHO_AM_I);
    const {loading: getOrganisaitonsLoading, error: getOrganisationsError, data: getOrganisationsData} = useQuery(GET_ORGANISATIONS, {variables: {orgId: null}});
    const [selectedOrg, setSelectedOrg] = React.useState<Partial<IOrganisation> | null>(null);
    const [form] = Form.useForm();
    if (whoAmILoading || getOrganisaitonsLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (whoAmIError || getOrganisationsError) {
        return <>
            An error occured.
        </>;
    }
    const orgs: Partial<IOrganisation>[] = getOrganisationsData.getOrganisations;
    const n = 5;

    
    return (
        <div className={css.page_container}>
            <div className={css.org_map}>
                <Title level={2}>Create or Edit organisation</Title>
                <Form
                    form={form}
                >
                    <Form.Item name='selectedExisted'>
                        <Select 
                            placeholder='Select an organisation'
                            showSearch={true}
                            filterOption={(input, option) =>
                                (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                            onChange={(value) => {
                                const org = orgs.filter(el => el.id === value)[0];
                                form.setFieldsValue({
                                    name: org.name,
                                    shortname: org.shortname,
                                    latitude: org.location ? org.location[0] : null,
                                    longitude: org.location ? org.location[1] : null,
                                })
                            }}
                        >
                            {
                                orgs.map(el => <Option value={el.id} label={el?.name}>{el?.name?.toString()}</Option>)
                            }
                        </Select>
                    </Form.Item>
                    <Form.Item name='name'>
                            <Input placeholder='Input new name'/>
                    </Form.Item>
                    <Form.Item name='shortname'>
                            <Input placeholder='Input new shortname'/>
                    </Form.Item>
                    <Form.Item name='latitude'>
                            <Input placeholder='Input latitude'/>
                    </Form.Item>
                    <Form.Item name='longitude'>
                            <Input placeholder='Input longitude'/>
                    </Form.Item>
                    <Form.Item name='profile'>                            
                        <Upload
                            // onChange={(event) => {
                            //     form.setFieldValue('attachments', event.fileList.map(el => el.originFileObj));
                            // }}
                        >
                        </Upload>
                    </Form.Item>
                </Form>
            </div>
            <div className={css.org_list}>
                <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 32 }}>
                    {orgs.map((item, index) => (
                        <Col className={css['col-item']} span={Math.floor(24 / n)} key={index}>
                            <Card bordered={false} className={css['card-container']}>
                                <img 
                                    alt='example' 
                                    src={`${window.location.origin}/file/${item.profile}`}
                                    className={css['card-image']}
                                />
                                <Tooltip title={item.name}>
                                    <div className={css['card-meta']}>
                                        {item.name}
                                    </div>
                                </Tooltip>
                            </Card>
                        </Col>
                    ))}
                </Row>
            </div>
        </div>
    );
}

