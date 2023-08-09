import { FunctionComponent, useState, useEffect, useRef, useContext, Fragment, HTMLAttributes, createContext, ReactNode } from 'react';
import { Button, Upload, notification, Tag, Table, Form, Input, InputRef, DatePicker, Space, Modal } from 'antd';
import { RcFile } from 'antd/es/upload';
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { Query } from '@apollo/client/react/components';
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react/hooks';
import { useDropzone } from 'react-dropzone';
import { GET_STUDIES, UPLOAD_FILE, GET_ORGANISATIONS, GET_USERS, EDIT_STUDY, WHO_AM_I } from '@itmat-broker/itmat-models';
import { IFile, enumUserTypes, deviceTypes } from '@itmat-broker/itmat-types';
import { FileList, formatBytes } from '../../../reusable/fileList/fileList';
import LoadSpinner from '../../../reusable/loadSpinner';
import { Subsection, SubsectionWithComment } from '../../../reusable/subsection/subsection';
import css from './tabContent.module.css';
import { ApolloError } from '@apollo/client/errors';
import { validate } from '@ideafast/idgen';
import dayjs, { Dayjs } from 'dayjs';
import { v4 as uuid } from 'uuid';

type StudyFile = RcFile & {
    uuid: string;
    participantId?: string;
    deviceId?: string;
    startDate?: Dayjs;
    endDate?: Dayjs;
}

const { RangePicker } = DatePicker;
let progressReports: any[] = [];

export const FileRepositoryTabContent: FunctionComponent<{ studyId: string }> = ({ studyId }) => {
    return <span>333</span>
};
