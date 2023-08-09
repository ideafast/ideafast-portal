import { useQuery, useMutation, useApolloClient } from '@apollo/client/react/hooks';
import { IPubkey, IOrganisation, IUser, enumDocTypes, IDoc } from '@itmat-broker/itmat-types';
import { WHO_AM_I, REQUEST_USERNAME_OR_RESET_PASSWORD, GET_ORGANISATIONS, REQUEST_EXPIRY_DATE, EDIT_USER, GET_USER_PROFILE, UPLOAD_USER_PROFILE, CREATE_DOC, GET_DOCS, DELETE_DOC, GET_STUDIES } from '@itmat-broker/itmat-models';
import LoadSpinner from '../reusable/loadSpinner';
// import { ProjectSection } from '../users/projectSection';
import { Form, Input, Select, DatePicker, Button, Alert, Checkbox, Image, Typography, Row, Col, Divider, Upload, UploadFile, Modal, message, notification, Card, Popconfirm } from 'antd';
import css from './dataset.module.css';
import React from 'react';
import 'react-quill/dist/quill.snow.css';
import { Link } from 'react-router-dom';
const { Meta } = Card;

interface StudyProps {
    study: {
        id: string;
        name: string;
        profile: string;
        description: string;
    };
}

export const DatasetSection: React.FunctionComponent = () => {
    const { loading: getStudiesLoading, error: getStudiesError, data: getStudiesData } = useQuery(GET_STUDIES, { variables: { studyId: null } });

    if (getStudiesLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }

    if (getStudiesError || !getStudiesData?.getStudies) {
        return <>An error occurred.</>;
    }

    return (
        <div className={css.page_container}>
            {getStudiesData.getStudies.map((study) => (
                <StudyCard key={study.id} study={study} />
            ))}
        </div>
    );
};

const StudyCard: React.FunctionComponent<StudyProps> = ({ study }) => {
    return (
        <Card
            hoverable
            style={{ width: 240 }}
            cover={<img alt={study.name} src={`${window.location.origin}/file/${study.profile}`} />}
        >
            <Meta title={study.name} description={study.description} />
            <Link to={`/datasets/${study.id}`}>Go to study</Link>
        </Card>
    );
};
