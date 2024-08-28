import { FunctionComponent, useState, useEffect, useRef, useContext, Fragment, HTMLAttributes, createContext, ReactNode } from 'react';
import { Button, Upload, notification, Table, Form, Input, InputRef, Space } from 'antd';
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { Query } from '@apollo/client/react/components';
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react/hooks';
import { useDropzone } from 'react-dropzone';
import { GET_STUDY, UPLOAD_FILE, GET_ORGANISATIONS, EDIT_STUDY, WHO_AM_I } from '@itmat-broker/itmat-models';
import { userTypes } from '@itmat-broker/itmat-types';
import { FileList, formatBytes } from '../../../reusable/fileList/fileList';
import LoadSpinner from '../../../reusable/loadSpinner';
import { Subsection, SubsectionWithComment } from '../../../reusable/subsection/subsection';
import css from './tabContent.module.css';
import { ApolloError } from '@apollo/client/errors';
import { v4 as uuid } from 'uuid';

let progressReports: any[] = [];

export const FileRepositoryTabContent: FunctionComponent<{ studyId: string }> = ({ studyId }) => {

    const [uploadMovement, setUploadMovement] = useState(0);
    const [isDropOverlayShowing, setisDropOverlayShowing] = useState(false);
    const [fileList, setFileList] = useState<any[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const store = useApolloClient();
    const { loading: getOrgsLoading, error: getOrgsError } = useQuery(GET_ORGANISATIONS);
    const { loading: getStudyLoading, error: getStudyError, data: getStudyData } = useQuery(GET_STUDY, { variables: { studyId: studyId } });
    const { loading: whoAmILoading, error: whoAmIError, data: whoAmIData } = useQuery(WHO_AM_I);
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
            return file;
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

    const removeFile = (record): void => {
        setFileList(fileList => {
            const index = fileList.findIndex(file => file.uuid === record.uuid);
            const newFileList = [...fileList];
            newFileList.splice(index, 1);
            return newFileList;
        });
    };

    const fileFilter = (files: any[]) => {
        files.forEach((file) => {
            progressReports[`UP_${file.name}`] = undefined;
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
            const uploadMapHackName = `UP_${file.name || 'NA'}`;
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
                    description: JSON.stringify({}),
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

    const fileDetailsColumns = [
        {
            title: 'File name',
            dataIndex: 'name',
            key: 'fileName',
            sorter: (a, b) => a.fileName.localeCompare(b.fileName),
            render: (value, record) => {
                const progress = progressReports[`UP_${record.fileName}`];
                if (progress)
                    return <Fragment key={uploadMovement}>{Math.round(1000 * (progress.loaded - 1) / progress.total) / 10}%</Fragment>;
                return value;
            }
        },
        {
            key: 'delete',
            render: (__unused__value, record) => <Button disabled={isUploading} type='primary' danger icon={<DeleteOutlined />} onClick={() => {
                removeFile(record);
            }}></Button>
        }];

    if (getOrgsLoading || getStudyLoading || whoAmILoading)
        return <LoadSpinner />;

    if (getOrgsError || getStudyError || whoAmIError)
        return <div className={`${css.tab_page_wrapper} ${css.both_panel} ${css.upload_overlay}`}>
            An error occured, please contact your administrator
        </div>;

    const sortedFiles = ([...getStudyData.getStudy.files]).sort((a, b) => parseInt((b as any).uploadTime) - parseInt((a as any).uploadTime));
    const numberOfFiles = sortedFiles.length;
    const sizeOfFiles = sortedFiles.reduce((a, b) => a + (parseInt(b['fileSize'] as any) || 0), 0);

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
                {
                    whoAmIData.whoAmI.type === userTypes.ADMIN ?

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
                        : null
                }
                <SubsectionWithComment
                    title='Existing files'
                    comment={<Space size={'large'}>
                        <span>Total Files: {numberOfFiles}</span>
                        <span>Total Size: {formatBytes(sizeOfFiles)}</span>
                    </Space>}
                >
                    <FileList isStudyLevel={true} files={sortedFiles} searchTerm={undefined}></FileList>
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
    record: any;
    handleSave: (__unused__record: any) => void;
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

    return <td {...restProps}>{childNode}</td>;
};
