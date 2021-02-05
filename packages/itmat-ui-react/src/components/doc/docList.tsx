import * as React from 'react';
import { Query } from '@apollo/client/react/components';
import { GET_DOCS, Models, WHO_AM_I, userTypes, CREATE_DOC, DOC_TYPE, IDoc, EDIT_DOC, IUser, DOC_STATUS } from 'itmat-commons';
import LoadSpinner from '../reusable/loadSpinner';
import { Table, Input, Button, Radio, Modal, Upload } from 'antd';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useQuery, useMutation } from '@apollo/client/react/hooks';

interface docContents {
    id: string;
    title: string;
    data: string;
    docType: DOC_TYPE;
    docStatus: DOC_STATUS;
    attachments: any[];
}

export const DocListSection: React.FunctionComponent = () => {
    const { loading: whoamiloading, error: whoamierror, data: whoamidata } = useQuery(WHO_AM_I);
    if (whoamiloading) { return <p>Loading..</p>; }
    if (whoamierror) { return <p>ERROR: please try again.</p>; }

    return (
        <Query<any, any>
            query={GET_DOCS}
            variables={{}}
        >
            {({ loading, error, data }) => {
                if (loading) { return <LoadSpinner />; }
                if (error) {
                    return (
                        <p>
                            Error :(
                            {error.message}
                        </p>
                    );
                }
                const docList: IDoc[] = data.getDocs;
                return ( <>
                    {docList.length !== 0 ? <DocList user={whoamidata.whoAmI} list={docList} /> : <span>No Documents Found!</span>}
                    {whoamidata.whoAmI.type === userTypes.ADMIN ? <DocWriter user={whoamidata.whoAmI} /> : null}
                </>
                );
            }}
        </Query>
    );
};

export const DocList: React.FunctionComponent<{ list: Models.Doc.IDoc[], user: IUser }> = ({ list, user }) => {
    const [isDocView, setIsDocView] = React.useState(false);
    const [isDocEdit, setIsDocEdit] = React.useState(false);
    const emptyDocContents = {
        id: '',
        title: '',
        data: '',
        docType: DOC_TYPE.DOCUMENTATION,
        docStatus: DOC_STATUS.DEACTIVATED,
        attachments: []
    };
    const [docViewContents, setDocViewContents] = React.useState<docContents>(emptyDocContents);
    const [oldAttachments, setOldAttachments] = React.useState<any>([]); // save attachments of previously uploaded file, modified in edit mode

    const columns = [
        {
            title: 'Title',
            dataIndex: 'title',
            key: 'title',
            render: (__unused__value, record) => {
                return record.title;
            },
            sorter: (a, b) => a.title.localCampare(b.title)
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (__unused__value, record) => {
                return record.status;
            }
        },
        {
            title: 'Published Time',
            dataIndex: 'createdAt',
            key: 'title',
            render: (__unused__value, record) => {
                return (new Date(record.createdAt)).toUTCString();
            }
        },
        {
            title: '',
            dataIndex: '',
            key: '',
            render: (__unused__value, record) => {
                if (user.type === userTypes.ADMIN) {
                    return <Button
                        type='primary'
                        style={{ width: '35%', display: 'inline-block' }}
                        onClick={() => {
                            setDocViewContents({
                                id: record.id,
                                title: record.title,
                                data: record.data,
                                docType: record.docType,
                                docStatus: record.status,
                                attachments: []
                            });
                            setOldAttachments(record.attachments);
                            setIsDocEdit(true);
                        }}
                    >Edit</Button>;
                } else {
                    return null;
                }
            }
        },
        {
            title: '',
            dataIndex: '',
            key: '',
            render: (__unused__value, record) => {
                return <Button
                    type='primary'
                    style={{ width: '35%', display: 'inline-block' }}
                    onClick={() => {
                        setDocViewContents({
                            id: record.id,
                            title: record.title,
                            data: record.data,
                            docType: record.docType,
                            docStatus: record.docStatus,
                            attachments: []
                        });
                        setOldAttachments(record.attachments);
                        setIsDocView(true);
                    }}
                >View</Button>;
            }
        },

    ];


    const [editDoc] = useMutation(EDIT_DOC, {
        onCompleted: () => {
            // window.location.reload();
        },
        refetchQueries: [{ query: WHO_AM_I }],
        onError: () => { return; }
    });

    function customRequest(option) {
        const formData = new FormData();
        formData.append('files[]', option.file);
        const reader = new FileReader();
        reader.readAsDataURL(option.file);
        reader.onloadend = function(e) {
            const filename = option.file.name;
            const encoded = (e as any).target.result;
            const uid = option.file.uid; // unique identifier for each upload
            setDocViewContents({...docViewContents, attachments: [...docViewContents.attachments, {uid: uid, fileName: filename, fileBase64: encoded}]});
            if (e && e.target && e.target.result) {
                option.onSuccess();
            }
        };
    }

    return (<>
        <Table
            rowKey={(rec) => rec.id}
            columns={user.type === userTypes.ADMIN ? columns : columns.slice(1)}
            dataSource={list}
            onRow={(rec: IDoc) => ({
                onMouseEnter: () => {
                    setDocViewContents({
                        id: rec.id,
                        title: rec.title,
                        data: rec.data,
                        docType: rec.docType,
                        docStatus: rec.status,
                        attachments: []
                    });
                    setOldAttachments(rec.attachments);
                }
            })}
        >
        </Table>
        <Modal
            title={docViewContents.title}
            visible={isDocView}
            onOk={() => { setIsDocView(false); }}
            onCancel={() => { setIsDocView(false); }}
            okText='OK'
            cancelText='Cancel'
            width='90%'
        >
            <ReactQuill
                value={docViewContents.data}
                readOnly={true}
                theme={'bubble'}
            />
            <h2>Attachments</h2>
            {oldAttachments === null ? <p>No files.</p> :
                oldAttachments.map((el) => <><a download={el.fileName} href={el.fileBase64}>{el.fileName}</a><br/></>)
            }
        </Modal>
        <Modal
            title={docViewContents.title}
            visible={isDocEdit}
            onOk={() => { setIsDocEdit(false); }}
            onCancel={() => {
                setIsDocEdit(false);
            }}
            okText='OK'
            cancelText='Cancel'
            width='90%'
        >
            <h2>Title</h2>
            <Input placeholder='Title' value={docViewContents.title} onChange={({target: {value}}) => setDocViewContents({...docViewContents, title: value})} /><br/><br/>
            <h2>Documentation Type</h2>
            <Radio.Group value={docViewContents.docType} onChange={(e) => setDocViewContents({...docViewContents, docType: e.target.value})}>
                <Radio.Button value={DOC_TYPE.DOCUMENTATION}>{DOC_TYPE.DOCUMENTATION}</Radio.Button>
                <Radio.Button value={DOC_TYPE.NOTIFICATION}>{DOC_TYPE.NOTIFICATION}</Radio.Button>
                <Radio.Button value={DOC_TYPE.OTHERS}>{DOC_TYPE.OTHERS}</Radio.Button>
            </Radio.Group>
            <br/><br/>
            <h2>Documentation Status</h2>
            <Radio.Group value={docViewContents.docStatus} onChange={(e) => setDocViewContents({...docViewContents, docStatus: e.target.value})}>
                <Radio.Button value={DOC_STATUS.ACTIVATED}>{DOC_STATUS.ACTIVATED}</Radio.Button>
                <Radio.Button value={DOC_STATUS.DEACTIVATED}>{DOC_STATUS.DEACTIVATED}</Radio.Button>
                <Radio.Button value={DOC_STATUS.DELETED}>{DOC_STATUS.DELETED}</Radio.Button>
            </Radio.Group><br/><br/>
            <h2>Contents</h2><h4>Tips: In order to access external address, you need to add https:// or https:// before the link.</h4>
            <ReactQuill
                theme='snow'
                value={docViewContents.data}
                onChange={(value) => setDocViewContents({...docViewContents, data: value})}
                modules={modules}
            /><br/><br/>
            <h2>Attachments</h2>
            {oldAttachments === null ? <p>No files.</p> :
                oldAttachments.map((el) => <>
                    <a download={el.fileName} href={el.fileBase64}>{el.fileName}</a>
                    <Button
                        type='primary'
                        style={{ width: '15%', display: 'inline-block' }}
                        onClick={() => {
                            setOldAttachments(oldAttachments.filter( function( obj ) {
                                return obj.fileName !== el.fileName;
                            } ));
                            console.log(oldAttachments);
                        }}
                    >Delete</Button><br/>
                    <br/></>)
            }
            <Upload
                accept='image/*, video/*, audio/*, .pdf, .json, .csv'
                listType={'picture-card'}
                multiple={true}
                customRequest={customRequest}
                onRemove={(info) => {
                    setDocViewContents({...docViewContents, attachments: docViewContents.attachments.filter( (function(obj) {
                        return obj.uid !== info.uid;
                    }))});
                }}
            >
                <button >
                        Upload
                </button>
            </Upload>
            <Button
                type='primary'
                style={{ width: '15%', display: 'inline-block' }}
                onClick={() => {
                    console.log(docViewContents.attachments);
                    const newAttachments = docViewContents.attachments.length === 0 ? [] : docViewContents.attachments.map((el) => ({fileName: el.fileName, fileBase64: el.fileBase64}));
                    const previousAttachments = oldAttachments.length === 0 ? [] : oldAttachments.map((el) => ({fileName: el.fileName, fileBase64: el.fileBase64}));
                    console.log(previousAttachments);
                    console.log(newAttachments);
                    const combineAttachments = (newAttachments as any).concat(previousAttachments);
                    editDoc({ variables: {id: docViewContents.id, docType: docViewContents.docType, data: docViewContents.data, user: user.id, title: docViewContents.title, status: docViewContents.docStatus, attachments: combineAttachments} });
                    setIsDocEdit(false);
                    setDocViewContents(emptyDocContents);
                    setOldAttachments([]);
                }}
            >Submit</Button><br/>
        </Modal>
    </>
    );
};

export const DocWriter: React.FunctionComponent<{ user: IUser  }> = ({ user }) => {
    const [isWriting, setIsWriting] = React.useState(false);
    const [createDoc] = useMutation(CREATE_DOC, {
        onCompleted: () => {
            // window.location.reload();
        },
        refetchQueries: [{ query: WHO_AM_I }],
        onError: () => { return; }
    });
    const [doc, setDoc] = React.useState({
        docType: DOC_TYPE.DOCUMENTATION,
        data: '',
        title: '',
        docStatus: DOC_STATUS.DEACTIVATED
    });
    const [attachments, setAttachments] = React.useState<any>([]);

    function customRequest(option) {
        const formData = new FormData();
        formData.append('files[]', option.file);
        const reader = new FileReader();
        reader.readAsDataURL(option.file);
        reader.onloadend = function(e) {
            const filename = option.file.name;
            const encoded = (e as any).target.result;
            const uid = option.file.uid; // unique identifier for each upload
            setAttachments([...attachments, {uid: uid, fileName: filename, fileBase64: encoded}]);
            if (e && e.target && e.target.result) {
                option.onSuccess();
            }
        };
    }

    return (<>
        <Button
            type='primary'
            style={{ width: '15%', display: 'inline-block' }}
            onClick={() => {
                setIsWriting(true);
            }}
        >Write a new Doc</Button>
        <Modal
            title='Document Writer'
            visible={isWriting}
            onOk={() => { setIsWriting(false); }}
            onCancel={() => { setIsWriting(false); }}
            okText='OK'
            cancelText='Cancel'
            width='90%'
        >
            {attachments.map((el) => <p>{el.fileName}</p>)}
            {attachments.map((el) => <p>{el.uid}</p>)}
            {attachments.map((el) => <p>{el.fileBase64.substring(0,50)}</p>)}
            <div style={{ width: '80%', margin: 'auto'}}>
                <h2>Title: </h2>
                <Input placeholder='Title' value={doc.title} onChange={({target: {value}}) => setDoc({...doc, title: value})} /><br/><br/><br/>
                <h2>Documentation Type</h2>
                <Radio.Group value={doc.docType} onChange={(e) => setDoc({...doc, docType: e.target.value})}>
                    <Radio.Button value={DOC_TYPE.DOCUMENTATION}>{DOC_TYPE.DOCUMENTATION}</Radio.Button>
                    <Radio.Button value={DOC_TYPE.NOTIFICATION}>{DOC_TYPE.NOTIFICATION}</Radio.Button>
                    <Radio.Button value={DOC_TYPE.OTHERS}>{DOC_TYPE.OTHERS}</Radio.Button>
                </Radio.Group><br/><br/><br/>
                <h2>Documentation Status</h2>
                <Radio.Group value={doc.docStatus} onChange={(e) => setDoc({...doc, docStatus: e.target.value})}>
                    <Radio.Button value={DOC_STATUS.ACTIVATED}>{DOC_STATUS.ACTIVATED}</Radio.Button>
                    <Radio.Button value={DOC_STATUS.DEACTIVATED}>{DOC_STATUS.DEACTIVATED}</Radio.Button>
                    <Radio.Button value={DOC_STATUS.DELETED}>{DOC_STATUS.DELETED}</Radio.Button>
                </Radio.Group><br/><br/><br/>
                <h2>Contents</h2><h4>Tips: In order to access external address, you need to add https:// or https:// before the link.</h4>
                <ReactQuill
                    theme='snow'
                    value={doc.data}
                    onChange={(value) => setDoc({...doc, data: value})}
                    modules={modules}
                /><br/><br/>
                <h2>Attachments</h2>
                <Upload
                    accept='image/*, video/*, audio/*, .pdf, .json, .csv'
                    listType={'picture-card'}
                    multiple={true}
                    customRequest={customRequest}
                    onRemove={(info) => {
                        setAttachments(attachments.filter( function(obj ) {
                            return obj.uid !== info.uid;
                        }));
                    }}
                >
                    <button >
                        Upload
                    </button>
                </Upload>
                <Button
                    type='primary'
                    style={{ width: '15%', display: 'inline-block' }}
                    onClick={() => {
                        if (doc.title === '' || doc.data === '') {
                            throw new Error('Fields can not be empty');
                        }
                        setAttachments(attachments.forEach(function(v){ delete v.uid; }));
                        createDoc({ variables: {docType: doc.docType, data: doc.data, user: user.id, title: doc.title, attachments:  attachments}});
                        setDoc({...doc, docType: DOC_TYPE.DOCUMENTATION, data: '', title: '', docStatus: DOC_STATUS.DEACTIVATED});
                        setAttachments([]);
                        // window.location.reload();
                    }}
                >Publish</Button>
                <br/>
            </div>
        </Modal>
    </>
    );
};

const modules = {
    toolbar: [
        ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
        ['blockquote', 'code-block'],

        [{ header: 1 }, { header: 2 }],               // custom button values
        [{ list: 'ordered'}, { list: 'bullet' }],
        [{ script: 'sub'}, { script: 'super' }],      // superscript/subscript
        [{ indent: '-1'}, { indent: '+1' }],          // outdent/indent
        [{ direction: 'rtl' }],                         // text direction

        [{ size: ['small', false, 'large', 'huge'] }],  // custom dropdown
        [{ header: [1, 2, 3, 4, 5, 6, false] }],

        [{ color: [] }, { background: [] }],          // dropdown with defaults from theme
        [{ font: [] }],
        [{ align: [] }],

        ['link', 'image', 'video', 'formula']
        // ['clean'],                                        // remove formatting button
    ]
};
