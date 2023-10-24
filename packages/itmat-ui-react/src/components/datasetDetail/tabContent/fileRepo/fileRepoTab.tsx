import React, { FunctionComponent, useState, useEffect, useRef, useContext, Fragment, HTMLAttributes, createContext, ReactNode } from 'react';
import { Button, Upload, notification, Tag, Table, Form, Input, InputRef, DatePicker, Space, Modal, List, Typography } from 'antd';
import { RcFile } from 'antd/es/upload';
import { UploadOutlined, DeleteOutlined, DownloadOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { Query } from '@apollo/client/react/components';
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react/hooks';
import { useDropzone } from 'react-dropzone';
import { GET_STUDIES, UPLOAD_FILE, GET_ORGANISATIONS, GET_USERS, EDIT_STUDY, WHO_AM_I } from '@itmat-broker/itmat-models';
import { IFile, enumUserTypes, deviceTypes, enumConfigType } from '@itmat-broker/itmat-types';
import { FileList, formatBytes } from '../../../reusable/fileList/fileList';
import LoadSpinner from '../../../reusable/loadSpinner';
import { Subsection, SubsectionWithComment } from '../../../reusable/subsection/subsection';
import css from './tabContent.module.css';
import { ApolloError } from '@apollo/client/errors';
import { validate } from '@ideafast/idgen';
import dayjs, { Dayjs } from 'dayjs';
import { v4 as uuid } from 'uuid';
import { trpc } from '../../../../utils/trpc';
import { tableColumnRender } from 'packages/itmat-ui-react/src/utils/ui';
type StudyFile = RcFile & {
    uuid: string;
    participantId?: string;
    deviceId?: string;
    startDate?: Dayjs;
    endDate?: Dayjs;
}

const { RangePicker } = DatePicker;
const progressReports: any[] = [];

export const FileRepositoryTabContent: FunctionComponent<{ studyId: string }> = ({ studyId }) => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getStudy = trpc.study.getStudies.useQuery({ studyId: studyId });
    const studyConfig = trpc.config.getConfig.useQuery({ configType: enumConfigType.STUDYCONFIG, key: studyId, useDefault: true });
    const getFiles = trpc.data.getFiles.useQuery({ studyId: studyId, versionId: null, useCache: false, forceUpdate: false, aggregation: {} });


    if (whoAmI.isLoading || getStudy.isLoading || studyConfig.isLoading || getFiles.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (whoAmI.isError || getStudy.isError || studyConfig.isError || getFiles.isError) {
        return <>
            An error occured.
        </>;
    }

    const columns = generateTableColumns(studyConfig.data.properties);
    columns.push({
        title: '',
        dataIndex: 'download',
        key: 'download',
        // width: 200, // Adjust this width as required
        render: (__unused__value, record) => {
            return <Button
                icon={<CloudDownloadOutlined />}
                download={`${record.fileName}`}
                href={`/file/${record.id}`}>
                Download
            </Button>;
        }
    });
    return <>
        <div>
            <List
                header={<Typography.Title level={3}>Overview</Typography.Title>}
            >
                <List.Item>
                    <Typography.Text mark>[Description]</Typography.Text> {getStudy.data[0].description} <br />
                    <Typography.Text mark>[Data Version]</Typography.Text> {getStudy.data[0].currentDataVersion !== -1 ? getStudy.data[0].dataVersions[getStudy.data[0].currentDataVersion].version : 'NA'}
                </List.Item>
            </List><br />
            <List
                header={<Typography.Title level={3}>Files</Typography.Title>}
            >
                <List.Item>
                    <Table
                        columns={columns}
                        expandable={{ showExpandColumn: false }}
                        dataSource={getFiles.data}
                    />
                </List.Item>
            </List>
        </div>
        <div>

        </div>
    </>;
};

type CustomColumnType = {
    title: React.ReactNode;
    dataIndex: string;
    key: string;
    render?: (value: any, record: any) => React.ReactNode;
};

function generateTableColumns(properties) {
    const columns: CustomColumnType[] = [{
        title: 'File Name',
        dataIndex: 'fileName',
        key: 'fileName',
        // width: 200, // Adjust this width as required
        render: (__unused__value, record) => {
            return record.properties['File Name'];
        }
    }, {
        title: 'File Size',
        dataIndex: 'fileSize',
        key: 'fileSize',
        // width: 200, // Adjust this width as required
        render: (__unused__value, record) => {
            return formatBytes(record.properties['File Size']);
        }
    }, {
        title: 'File Type',
        dataIndex: 'fileType',
        key: 'fileType',
        // width: 200, // Adjust this width as required
        render: (__unused__value, record) => {
            return record.properties['File Type'].toUpperCase();
        }
    }, {
        title: 'File Type',
        dataIndex: 'fileType',
        key: 'fileType',
        // width: 200, // Adjust this width as required
        render: (__unused__value, record) => {
            return record.properties['File Type'].toUpperCase();
        }
    }, {
        title: 'Uploaded Time',
        dataIndex: 'uploadedTime',
        key: 'uploadedTime',
        // width: 200, // Adjust this width as required
        render: (__unused__value, record) => {
            return (new Date(record.life.createdTime)).toDateString();
        }
    }, {
        title: 'Uploaded By',
        dataIndex: 'uploadedBy',
        key: 'uploadedBy',
        // width: 200, // Adjust this width as required
        render: (__unused__value, record) => {
            return record.life.createdUser;
        }
    }];
    for (const property of properties.defaultFileColumns) {
        columns.push({
            title: <span style={{ color: properties.defaultFileColumnsPropertyColor }}>{property.title}</span>,
            dataIndex: property.title,
            key: property.title,
            // width: 200, // Adjust this width as required
            render: (__unused__value, record) => {
                return tableColumnRender(record, property);
            }
        });
    }

    return columns;
}

