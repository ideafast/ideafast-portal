import { FunctionComponent, useState, useEffect, useRef, useContext, Fragment, HTMLAttributes, createContext, ReactNode } from 'react';
import { Button, Upload, notification, Table, Form, Input, InputRef, DatePicker, Space } from 'antd';
import { RcFile } from 'antd/es/upload';
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { Query } from '@apollo/client/react/components';
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react/hooks';
import { useDropzone } from 'react-dropzone';
import { GET_STUDY, UPLOAD_FILE, GET_ORGANISATIONS, EDIT_STUDY, WHO_AM_I } from '@itmat-broker/itmat-models';
import { IFile, userTypes, deviceTypes } from '@itmat-broker/itmat-types';
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

    const [uploadMovement, setUploadMovement] = useState(0);
    const [isDropOverlayShowing, setisDropOverlayShowing] = useState(false);
    const [fileList, setFileList] = useState<StudyFile[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const store = useApolloClient();
    const { loading: getOrgsLoading, error: getOrgsError, data: getOrgsData } = useQuery(GET_ORGANISATIONS);
    const { loading: getStudyLoading, error: getStudyError, data: getStudyData } = useQuery(GET_STUDY, { variables: { studyId: studyId } });
    const { loading: whoAmILoading, error: whoAmIError, data: whoAmIData } = useQuery(WHO_AM_I);
    const [searchTerm, setSearchTerm] = useState('');
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [datasetDescription, setDatasetDescription] = useState('');
    const [editStudy] = useMutation(EDIT_STUDY, {
        onCompleted: () => { window.location.reload(); },
        onError: () => { return; }
    });
    const [uploadFile] = useMutation(UPLOAD_FILE, {
        onCompleted: ({ uploadFile }) => {
            const cachedata = store.readQuery({
                query: GET_STUDY,
                variables: { studyId }
            }) as any;
            if (!cachedata)
                return;
            const newcachedata = {
                ...cachedata.getStudy,
                files: [...cachedata.getStudy.files, uploadFile]
            };
            store.writeQuery({
                query: GET_STUDY,
                variables: { studyId },
                data: { getStudy: newcachedata }
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

    const onDropLocal = (acceptedFiles: Blob[]) => {
        fileFilter(acceptedFiles.map(file => {
            return file as StudyFile;
        }));
    };

    const onDragEnter = () => setisDropOverlayShowing(true);
    const onDragOver = () => setisDropOverlayShowing(true);
    const onDragLeave = () => setisDropOverlayShowing(false);
    const onDropAccepted = () => setisDropOverlayShowing(false);
    const onDropRejected = () => setisDropOverlayShowing(false);

    const { getRootProps, getInputProps } = useDropzone({
        noClick: true,
        preventDropOnDocument: true,
        noKeyboard: true,
        onDrop: onDropLocal,
        onDragEnter,
        onDragOver,
        onDragLeave,
        onDropAccepted,
        onDropRejected
    });

    const removeFile = (record: StudyFile): void => {
        setFileList(fileList => {
            const index = fileList.findIndex(file => file.uuid === record.uuid);
            const newFileList = [...fileList];
            newFileList.splice(index, 1);
            return newFileList;
        });
    };

    const fileFilter = (files: StudyFile[]) => {
        files.forEach((file) => {
            const matcher = /(.{1})(.{6})-(.{3})(.{6})-(\d{8})-(\d{8})\.(.*)/;
            const particules = file.name.match(matcher);
            if (particules?.length === 8) {
                if (Object.keys(sites).includes(particules[1].toUpperCase())
                    && validate(particules[2].toUpperCase()))
                    file.participantId = `${particules[1].toUpperCase()}${particules[2].toUpperCase()}`;
                if (Object.keys(deviceTypes).includes(particules[3].toUpperCase())
                    && validate(particules[4].toUpperCase()))
                    file.deviceId = `${particules[3].toUpperCase()}${particules[4].toUpperCase()}`;
                const startDate = dayjs(particules[5], 'YYYYMMDD');
                const endDate = dayjs(particules[6], 'YYYYMMDD');
                if (startDate.isSame(endDate) || startDate.isBefore(endDate)) {
                    if (startDate.isValid())
                        file.startDate = startDate;
                    if (endDate.isValid() && (endDate.isSame(dayjs()) || endDate.isBefore(dayjs())))
                        file.endDate = endDate;
                }
            }
            progressReports[`UP_${file.participantId}_${file.deviceId}_${file.startDate?.valueOf()}_${file.endDate?.valueOf()}`] = undefined;
            file.uuid = uuid();
            fileList.push(file);
        });
        setFileList([...fileList]);
    };
    const validFile = fileList;
    const uploadHandler = () => {

        const uploads: Promise<any>[] = [];
        setIsUploading(true);
        validFile.forEach(file => {
            const description = {
                participantId: file.participantId?.trim().toUpperCase()
            };
            const uploadMapHackName = `UP_${description.participantId || 'NA'}`;
            if (!(window as any).onUploadProgressHackMap)
                (window as any).onUploadProgressHackMap = {};
            (window as any).onUploadProgressHackMap[uploadMapHackName] = (progressEvent) => {
                setUploadMovement(Math.random);
                progressReports = {
                    ...progressReports,
                    [uploadMapHackName]: progressEvent
                };
            };
            uploads.push(uploadFile({
                variables: {
                    file,
                    studyId,
                    description: JSON.stringify(description),
                    fileLength: file.size
                }
            }).then(result => {
                if (!result.data) {
                    // Any accompanying error should already be displayed by `uploadFile`
                    console.error(result.errors, result.extensions?.code);
                    return;
                }
                delete (window as any).onUploadProgressHackMap[uploadMapHackName];
                delete progressReports[uploadMapHackName];
                removeFile(file);
                notification.success({
                    message: 'Upload succeeded!',
                    description: `File ${result.data.uploadFile.fileName} was successfully uploaded!`,
                    placement: 'topRight'
                });
            }).catch(error => {
                delete (window as any).onUploadProgressHackMap[uploadMapHackName];
                delete progressReports[uploadMapHackName];
                notification.error({
                    message: 'Upload error!',
                    description: error?.message ?? error ?? 'Unknown Error Occurred!',
                    placement: 'topRight',
                    duration: 0
                });
            }));
        });

        Promise.all(uploads).then(() => {
            setIsUploading(false);
        });
    };

    const uploaderProps = {
        onRemove: (file) => {
            const target = fileList.indexOf(file);
            setFileList(fileList.splice(0, target).concat(fileList.splice(target + 1)));
        },
        beforeUpload: (file) => {
            fileFilter([file]);
            return true;
        },
        fileList: fileList.map(file => ({
            ...file,
            originFileObj: file
        })),
        multiple: true,
        showUploadList: false
    };

    const handleSave = record => {
        setFileList(fileList => {
            const index = fileList.findIndex(file => file.uuid === record.uuid);
            const newFileList = [...fileList];
            const newFile = fileList[index];
            newFile.participantId = record.participantId;
            newFile.deviceId = record.deviceId;
            newFile.startDate = record.startDate;
            newFile.endDate = record.endDate;
            newFileList.splice(index, 1, newFile);
            return newFileList;
        });
    };

    const fileDetailsColumns = [
        {
            title: 'File name',
            dataIndex: 'name',
            key: 'fileName',
            sorter: (a, b) => a.fileName.localeCompare(b.fileName),
            render: (value, record) => {
                const progress = progressReports[`UP_${record.participantId}_${record.deviceId}_${record.startDate?.valueOf()}_${record.endDate?.valueOf()}`];
                if (progress)
                    return <Fragment key={uploadMovement}>{Math.round(1000 * (progress.loaded - 1) / progress.total) / 10}%</Fragment>;
                return value;
            }
        },
        {
            title: 'Participant ID',
            dataIndex: 'participantId',
            key: 'pid',
            editable: true,
            width: '10rem'
        },
        {
            title: 'Field ID',
            dataIndex: 'fieldId',
            key: 'pid',
            editable: true,
            width: '10rem'
        },
        {
            key: 'delete',
            render: (__unused__value, record) => <Button disabled={isUploading} type='primary' danger icon={<DeleteOutlined />} onClick={() => {
                removeFile(record);
            }}></Button>
        }]
        .map(col => {
            if (!col.editable) {
                return col;
            }
            return {
                ...col,
                onCell: record => ({
                    record: {
                        ...record,
                        period: [record.startDate, record.endDate]
                    },
                    editable: col.editable,
                    dataIndex: col.dataIndex,
                    title: col.title,
                    handleSave
                })
            };
        });

    if (getOrgsLoading || getStudyLoading || whoAmILoading)
        return <LoadSpinner />;

    if (getOrgsError || getStudyError || whoAmIError)
        return <div className={`${css.tab_page_wrapper} ${css.both_panel} ${css.upload_overlay}`}>
            An error occured, please contact your administrator
        </div>;


    const sites = getOrgsData.getOrganisations.filter(org => org.metadata?.siteIDMarker).reduce((prev, current) => ({
        ...prev,
        [current.metadata.siteIDMarker]: current.shortname ?? current.name
    }), {});

    function dataSourceFilter(files: IFile[]) {
        const studyLevelFiles: IFile[] = [];
        const subjectLevelFiles: IFile[] = [];
        for (const file of files) {
            if (Object.keys(JSON.parse(file.description)).length !== 0) {
                if (JSON.parse(file.description).participantId) {
                    subjectLevelFiles.push(file);
                }
            } else {
                studyLevelFiles.push(file);
            }
        }
        return [subjectLevelFiles, studyLevelFiles];
    }
    const sortedFiles = dataSourceFilter(getStudyData.getStudy.files).sort((a, b) => parseInt((b as any).uploadTime) - parseInt((a as any).uploadTime));
    const numberOfFiles = sortedFiles[0].length;
    const sizeOfFiles = sortedFiles[0].reduce((a, b) => a + (parseInt(b['fileSize'] as any) || 0), 0);
    const participantOfFiles = sortedFiles[0].reduce(function (values, v) {
        if (!values.set[JSON.parse(v['description'])['participantId']]) {
            (values as any).set[JSON.parse(v['description'])['participantId']] = 1;
            values.count++;
        }
        return values;
    }, { set: {}, count: 0 }).count;
    return <div {...getRootProps() as HTMLAttributes<HTMLDivElement>} className={`${css.scaffold_wrapper} ${isDropOverlayShowing ? css.drop_overlay : ''}`}>
        <input title='fileTabDropZone' {...getInputProps()} />
        {fileList.length > 0
            ?
            <div className={`${css.tab_page_wrapper} ${css.both_panel} ${css.upload_overlay}`}>
                <Subsection title='Upload files'>
                    <Upload {...uploaderProps} >
                        <Button>Select more files</Button>
                    </Upload>
                    <br />
                    <br />
                    <Table
                        rowKey={(rec) => rec.uuid}
                        rowClassName={() => css.editable_row}
                        pagination={false}
                        columns={fileDetailsColumns}
                        dataSource={fileList}
                        size='small'
                        components={{ body: { row: EditableRow, cell: EditableCell } }} />
                    <Button
                        icon={<UploadOutlined />}
                        type='primary'
                        onClick={uploadHandler}
                        disabled={fileList.length === 0}
                        loading={isUploading}
                        style={{ marginTop: 16 }}
                    >
                        {isUploading ? `Uploading (${validFile.length} ready of ${fileList.length})` : `Upload (${validFile.length} ready of ${fileList.length})`}
                    </Button>
                    &nbsp;&nbsp;&nbsp;
                    <Button onClick={() => setFileList([])}>Cancel</Button>
                </Subsection>
            </div>
            : <div className={`${css.tab_page_wrapper} ${css.both_panel} fade_in`}>
                <SubsectionWithComment title='Dataset Description' comment={
                    whoAmIData.whoAmI.type === userTypes.ADMIN ?
                        <>
                            {isEditingDescription ?
                                <>
                                    <Button
                                        type='primary'
                                        onClick={() => { editStudy({ variables: { studyId: getStudyData.getStudy.id, description: datasetDescription } }); }}
                                    >{'Submit'}
                                    </Button>
                                    <Button
                                        type='primary'
                                        onClick={() => { setIsEditingDescription(false); setDatasetDescription(''); }}
                                    >{'Cancel'}
                                    </Button>
                                </> :
                                <Button
                                    type='primary'
                                    onClick={() => { setIsEditingDescription(true); }}
                                >{'Edit Description'}
                                </Button>
                            }
                        </> : null
                }>
                    <>{
                        (isEditingDescription && whoAmIData.whoAmI.type === userTypes.ADMIN) ? <Input onChange={(e) => { setDatasetDescription(e.target.value); }}>
                        </Input> :
                            (getStudyData.getStudy.description === null || getStudyData.getStudy.description === '') ? 'No descriptions.' : getStudyData.getStudy.description
                    }</>
                    <br />
                    <br />
                </SubsectionWithComment>
                <Subsection title='Upload files'>
                    <Query<any, any> query={GET_STUDY} variables={{ studyId }}>
                        {({ loading, data, error }) => {
                            if (loading || error)
                                return <>To upload files you can click on the button below or drag and drop files directly from your hard drive.</>;
                            return <>To upload files to <i>{data.getStudy.name}</i> you can click on the button below or drag and drop files directly from your hard drive.</>;
                        }}
                    </Query>
                    <br />
                    <Upload {...uploaderProps}>
                        <Button>Select files</Button>
                    </Upload>
                    <br />
                    <br />
                    <br />
                </Subsection>
                <SubsectionWithComment
                    title='Existing files'
                    comment={<Space size={'large'}>
                        <span>Total Files: {numberOfFiles}</span>
                        <span>Total Size: {formatBytes(sizeOfFiles)}</span>
                        <span>Total Participants: {participantOfFiles}</span>
                    </Space>}
                >
                    <Input.Search allowClear placeholder='Search' onChange={({ target: { value } }) => setSearchTerm(value?.toUpperCase())} />
                    <FileList files={sortedFiles[0]} searchTerm={searchTerm} isStudyLevel={true}></FileList>
                    <FileList isStudyLevel={true} files={sortedFiles[1]} searchTerm={undefined}></FileList>
                    <br />
                    <br />
                </SubsectionWithComment>

            </div>
        }
    </div >;
};

const EditableContext = createContext<any>({});

type EditableRowProps = {
    index: number;
}

const EditableRow: FunctionComponent<EditableRowProps> = ({ index, ...props }) => {
    const [form] = Form.useForm();

    useEffect(() => {
        form.validateFields();
    });

    return (
        <Form form={form} component={false}>
            <EditableContext.Provider value={form}>
                <tr key={index} {...props} />
            </EditableContext.Provider>
        </Form>
    );
};

interface EditableCellProps {
    editable: boolean;
    children: ReactNode;
    dataIndex: string;
    record: StudyFile;
    handleSave: (__unused__record: StudyFile) => void;
}

const EditableCell: FunctionComponent<EditableCellProps> = ({
    editable,
    children,
    dataIndex,
    record,
    handleSave,
    ...restProps
}) => {
    const [editing, setEditing] = useState(false);
    const inputRef = useRef<InputRef>(null);
    const rangeRef = useRef<any>(null);
    const form = useContext(EditableContext);

    useEffect(() => {
        if (editable && !editing) {
            form.setFieldsValue(record);
            setEditing(true);
        }
    }, [editable, editing, form, record]);

    const save = async () => {
        try {
            const values = await form.validateFields();
            handleSave({ ...record, ...values });
        } catch (errInfo) {
            // console.error(errInfo);
        }
    };

    let childNode = children;

    if (editing) {
        if (dataIndex === 'period') {
            childNode = <>
                <Form.Item
                    style={{ display: 'none' }}
                    name='startDate'
                    rules={[{ required: true, message: <></> }]}
                >
                    <Input id={`startDate_${record.uuid}`} />
                </Form.Item>
                <Form.Item
                    style={{ display: 'none' }}
                    name='endDate'
                    rules={[{ required: true, message: <></> }]}
                >
                    <Input id={`endDate_${record.uuid}`} />
                </Form.Item>
                <Form.Item
                    style={{ margin: 0 }}
                    name='period'
                    hasFeedback
                    dependencies={['startDate', 'endDate']}
                    rules={[
                        { required: true, message: <></> },
                        ({ getFieldValue }) => ({
                            validator() {
                                if (getFieldValue('startDate') && getFieldValue('endDate'))
                                    return Promise.resolve();
                                return Promise.reject('Missing dates');
                            }
                        })
                    ]}
                >
                    <RangePicker id={`period_${record.uuid}`} allowClear={false} ref={rangeRef} defaultValue={[record.startDate ?? null, record.endDate ?? null]} disabledDate={(currentDate) => {
                        return dayjs().isBefore(currentDate);
                    }} onCalendarChange={(dates) => {
                        if (dates === null)
                            return;
                        form.setFieldsValue({ startDate: dates[0] });
                        form.setFieldsValue({ endDate: dates[1] });
                    }} onBlur={save} />
                </Form.Item>
            </>;
        } else {
            childNode = <Form.Item
                style={{ margin: 0 }}
                name={dataIndex}
                hasFeedback
                rules={[{
                    required: true, message: <></>, validator: () => {
                        return Promise.resolve();
                    }
                }]}
            >
                <Input id={`${dataIndex}_${record.uuid}`} ref={inputRef} allowClear={false} onPressEnter={save} onBlur={save} style={{ width: '100%' }} />
            </Form.Item>;
        }
    }

    return <td {...restProps}>{childNode}</td>;
};
