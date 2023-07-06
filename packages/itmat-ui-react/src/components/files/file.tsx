import { FunctionComponent } from 'react';
import { Mutation } from '@apollo/client/react/components';
import { LOGIN, WHO_AM_I, GET_CONFIG, GET_FILE_REPO } from '@itmat-broker/itmat-models';
import { NavLink } from 'react-router-dom';
import css from './file.module.css';
import { Input, Form, Button, Alert, Checkbox, Image, Row, Col, Typography, Table } from 'antd';
import { useMutation, useQuery } from '@apollo/client/react/hooks';
import LoadSpinner from '../reusable/loadSpinner';
import { IUser, enumConfigType } from '@itmat-broker/itmat-types';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';

const { Title } = Typography;

export const MyFile: FunctionComponent = () => {
    const { loading: whoamiloading, error: whoamierror, data: whoamidata } = useQuery(WHO_AM_I);
    const { loading: getFileRepoLoading, error: getFileRepoError, data: getFileRepoData } = useQuery(GET_FILE_REPO, { variables: { userId: whoamidata.whoAmI.id } });
    if (whoamiloading || getFileRepoLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (whoamierror || getFileRepoError) {
        return <>
            An error occured.
        </>;
    }

    const fileTableColumns = [
        {
            title: 'Name',
            dataIndex: 'value',
            key: 'value',
            render: (record) => <span>{record.value}</span>
        },
        {
            title: 'Modified',
            dataIndex: 'modified',
            key: 'modified',
            render: (record) => <span>{record.modified}</span>
        },
        {
            title: 'Access',
            dataIndex: 'sharedUsers',
            key: 'sharedUsers',
            render: (record) => <span>{record.sharedUsers}</span>
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
                    <Button type='primary' icon={<UploadOutlined />} shape='default'>Upload</Button>
                </Col>
                <Col span={1.5}>
                    <Button icon={<PlusOutlined />}>Create</Button>
                </Col>
                <Col span={1.5}>
                    <Button>Organize</Button>
                </Col>
                <Col span={1}>
                    <Button>...</Button>
                </Col>
            </Row>
            <Table
                columns={fileTableColumns}
            />
        </div >
    );

};
