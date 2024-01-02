import { ChangeEvent, FunctionComponent, useEffect, useState } from 'react';
import { IUser, enumFileTypes } from '@itmat-broker/itmat-types';
import LoadSpinner from '../reusable/loadSpinner';
// import { ProjectSection } from '../users/projectSection';
import { Form, Input, Button, Image, Typography, Row, Col, Divider, Upload, UploadFile, Modal, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Key } from '../../utils/dmpCrypto/dmp.key';
import css from './profile.module.css';
import { RcFile } from 'antd/es/upload';
import { trpc } from '../../utils/trpc';
import ImgCrop from 'antd-img-crop';
const { Title } = Typography;
const { TextArea } = Input;

export const ProfileManagementSection: FunctionComponent = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getOrganisations = trpc.org.getOrganisations.useQuery({ orgId: whoAmI?.data?.organisation });
    const getUserProfile = trpc.user.getUserProfile.useQuery({ userId: whoAmI?.data?.id });
    const editUser = trpc.user.editUser.useMutation();
    const uploadUserProfile = trpc.user.uploadUserProfile.useMutation();
    const [isUploading, setIsUploading] = useState(false);
    // profile
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState('');
    const [previewTitle, setPreviewTitle] = useState('');
    const [fileList, setFileList] = useState<RcFile[]>([]);
    if (whoAmI.isLoading || getOrganisations.isLoading || getUserProfile.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (whoAmI.isError || getOrganisations.isError || getUserProfile.isError) {
        return <>
            An error occured.
        </>;
    }
    return (<>
        <div className={css.profile_left}>
            <div className={css.profile_summary_wrapper}>
                <div className={css.profile_summary_profile}>
                    {
                        getUserProfile.data ? <Image width={200} height={200} src={`${window.location.origin}/file/${getUserProfile.data}`} />
                            : <Image width={200} height={200} src="error" fallback="data:image/png;base64,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" />
                    }
                    <ImgCrop rotationSlider>
                        <Upload
                            name='avatar'
                            listType='picture-card'
                            beforeUpload={(file: RcFile) => {
                                const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
                                if (!isJpgOrPng) {
                                    message.error('You can only upload JPG/PNG file!');
                                }
                                setFileList([file]);
                                return isJpgOrPng;// && isLt2M;
                            }}
                            onPreview={async (file: UploadFile) => {
                                if (!file.url && !file.preview) {
                                    file.preview = await getBase64(file.originFileObj as RcFile);
                                }
                                setPreviewImage(file.url || (file.preview as string));
                                setPreviewOpen(true);
                                setPreviewTitle(file.name || file.url!.substring(file.url!.lastIndexOf('/') + 1));
                            }}
                            fileList={fileList}
                        >
                            {fileList.length >= 1 ? null : <div><PlusOutlined /><div style={{ marginTop: 8 }}>Upload</div></div>}
                        </Upload>
                    </ImgCrop>
                    {
                        fileList.length >= 1 ? <Button onClick={async () => {
                            setIsUploading(true);
                            if (fileList.length > 0) {
                                const fileData = fileList[0];
                                const formData = new FormData();
                                formData.append('file', fileData);

                                const response = await fetch('/upload', {
                                    method: 'POST',
                                    body: formData
                                });
                                const data = await response.json();

                                if (response.ok) {
                                    uploadUserProfile.mutate({
                                        userId: whoAmI.data.id,
                                        description: null,
                                        fileType: fileList[0].name.split('.')[1].toUpperCase() as enumFileTypes,
                                        fileUpload: [{
                                            path: data.filePath, // This should be the path returned by the server
                                            filename: fileData.name,
                                            mimetype: fileData.type,
                                            size: fileData.size
                                        }]
                                    });

                                } else {
                                    // Handle upload error
                                    console.error('File upload failed:', data);
                                }
                            }
                        }}>Submit</Button> : null
                    }
                    <Modal open={previewOpen} title={previewTitle} footer={null} onCancel={() => setPreviewOpen(false)}>
                        <img alt="example" style={{ width: '100%' }} src={previewImage} />
                    </Modal>
                    <br />
                    <Title level={2}>{whoAmI.data.firstname + ' ' + whoAmI.data.lastname}</Title>
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
                <br />
                <div>
                    <Title level={4}>{getOrganisations.data[0].name}</Title>
                </div>
                <br />
                <div className={css.profile_summary_description}>
                    {whoAmI.data.description}
                </div>
            </div>
        </div>
        <Divider type='vertical' style={{ color: 'black' }} />
        <div className={css.profile_right}>
            <ProfileEditForm key={whoAmI.data.id} user={whoAmI.data} editUser={editUser} />
        </div>
    </>);
};

export const ProfileEditForm: FunctionComponent<{ user: Partial<IUser>, editUser: any }> = ({ user, editUser }) => {
    const [form] = Form.useForm();
    useEffect(() => {
        if (user) {
            form.resetFields(); // Reset the form fields when user data changes
        }
    }, [user, form]);
    if (!user) {
        return null;
    }
    return (<Form
        form={form}
        initialValues={{ ...user }}
        onFinish={(variables) => {
            editUser.mutate({
                variables: {
                    userId: user.id,
                    ...variables
                }
            });
        }}
    >
        <Row justify={'space-between'}>
            <div className={css.profile_edit_special_title}>BASIC INFO</div>
        </Row>
        <Divider />
        <Row justify={'space-between'}>
            <Col span={10}>
                <div className={css.profile_edit_normal_title}>FIRST NAME</div><br />
                <Form.Item name='firstname'>
                    <Input className={css.login_box_input} placeholder='FIRST NAME' />
                </Form.Item>
            </Col>
            <Col span={13}>
                <div className={css.profile_edit_normal_title}>LAST NAME</div><br />
                <Form.Item name='lastname' hasFeedback rules={[{ required: false, message: ' ' }]}>
                    <Input className={css.login_box_input} placeholder='LAST NAME' />
                </Form.Item>
            </Col>
        </Row>
        <Row justify={'space-between'}>
            <Col span={10}>
                <div className={css.profile_edit_normal_title}>USER NAME</div><br />
                <Form.Item name='username' hasFeedback rules={[{ required: true, message: ' ' }]}>
                    <Input className={css.login_box_input} placeholder='USER NAME' />
                </Form.Item>
            </Col>
            <Col span={13}>
                <div className={css.profile_edit_normal_title}>PASSWORD</div><br />
                <Form.Item className={css.profile_edit_lastname} name='password' hasFeedback rules={[{ required: false, message: ' ' }]}>
                    <Input.Password className={css.login_box_input} placeholder='Password' />
                </Form.Item>
            </Col>
        </Row>
        <Row justify={'space-between'}>
            <Col span={24}>
                <div className={css.profile_edit_special_title}>ABOUT ME</div>
                <Divider />
                <Form.Item name='description' hasFeedback rules={[{ required: false, message: ' ' }]}>
                    <TextArea className={css.login_box_input} placeholder='DESCRIPTION' />
                </Form.Item>
            </Col>
        </Row>
        <Row className={css.profile_edit_submit}>
            <Col span={5} >
                <Button className={css.login_box_input} type='primary' disabled={false} loading={false} htmlType='submit'>
                    SAVE
                </Button><br /><br />
            </Col>
        </Row>
    </Form>);
};

// export const EditUserForm: FunctionComponent<{ user: (IUserWithoutToken & {access ?: { id: string, projects: { id: string, name: string, studyId: string }[], studies: { id: string, name: string }[] }}) }> = ({user}) => {
//     const [savedSuccessfully, setSavedSuccessfully] = useState(false);
//     const [requestResetPassword] = useMutation(REQUEST_USERNAME_OR_RESET_PASSWORD, {onCompleted: () => {setRequestResetPasswordSent(true); } });
//     const [requestResetPasswordSent, setRequestResetPasswordSent] = useState(false);
//     const {loading: getorgsloading, error: getorgserror, data: getorgsdata } = useQuery(GET_ORGANISATIONS);

//     function formatSubmitObj(variables) {
//         const final = {
//             id: user.id,
//             emailNotificationsActivated: variables.emailNotificationsActivated
//         };
//         return final;
//     }

//     const disabledDate = (current) => {
//         return current && (current < dayjs().endOf('day') || current > dayjs().add(3, 'month'));
//     };

//     if (getorgsloading) { return <p>Loading..</p>; }
//     if (getorgserror) { return <p>ERROR: please try again.</p>; }
//     const orgList: IOrganisation[] = getorgsdata.getOrganisations;

//     return (
//         <Mutation<any, any>
//             mutation={EDIT_USER}
//             onCompleted={() => setSavedSuccessfully(true)}
//         >
//             {(submit, { loading, error }) =>
//                 <Form title='EditUserForm' initialValues={{
//                     ...user,
//                     createdAt: dayjs(user.createdAt),
//                     expiredAt: dayjs(user.expiredAt),
//                     organisation: orgList.find(org => org.id === user.organisation)?.name
//                 }} layout='vertical' onFinish={(variables) => submit({ variables: formatSubmitObj(variables) })}>
//                     <Form.Item name='username' label='Username'>
//                         <Input disabled />
//                     </Form.Item>
//                     <Form.Item name='email' label='Email'>
//                         <Input disabled />
//                     </Form.Item>
//                     <Form.Item name='firstname' label='Firstname'>
//                         <Input disabled />
//                     </Form.Item>
//                     <Form.Item name='lastname' label='Lastname'>
//                         <Input disabled />
//                     </Form.Item>
//                     <Form.Item name='organisation' label='Organisation'>
//                         <Select disabled placeholder='Organisation' showSearch filterOption={(input, option) =>
//                             option?.children?.toLocaleString()?.toLocaleLowerCase()?.includes(input.toLocaleLowerCase()) ?? false
//                         }>
//                             {orgList.map((org) => <Select.Option key={org.id} value={org.id}>{org.name}</Select.Option>)}
//                         </Select>
//                     </Form.Item>
//                     <Form.Item name='createdAt' label='Created On'>
//                         <DatePicker disabled style={{ width: '100%' }} />
//                     </Form.Item>
//                     <Form.Item name='expiredAt' label='Expire On'>
//                         <DatePicker disabled disabledDate={disabledDate} style={{ width: '100%' }} />
//                     </Form.Item>
//                     <Form.Item name='type' label='User type'>
//                         <Select disabled>
//                             <Select.Option value='STANDARD'>System user</Select.Option>
//                             <Select.Option value='ADMIN'>System admin</Select.Option>
//                         </Select>
//                     </Form.Item>
//                     <Form.Item name='emailNotificationsActivated' label='Email Notification' valuePropName='checked'>
//                         <Checkbox>Email Notification</Checkbox>
//                     </Form.Item>
//                     {error ? (
//                         <>
//                             <Alert type='error' message={error.graphQLErrors.map(error => error.message).join()} />
//                             <br />
//                         </>
//                     ) : null}
//                     {savedSuccessfully ? (
//                         <>
//                             <Alert type='success' message={'All Saved!'} />
//                             <br />
//                         </>
//                     ) : null}
//                     {requestResetPasswordSent ? (
//                         <>
//                             <Alert type='success' message={'Password reset email sent!'} />
//                             <br />
//                         </>
//                     ) : null}
//                     <Form.Item>
//                         <Button type='primary' disabled={loading} loading={loading} htmlType='submit' >
//                             Save
//                         </Button>
//                         <Button disabled={loading} onClick={() => {
//                             requestResetPassword({
//                                 variables: {
//                                     forgotUsername: false,
//                                     forgotPassword: true,
//                                     username: user.username
//                                 }
//                             });
//                         }}>
//                             Send a password reset email
//                         </Button>
//                     </Form.Item>
//                 </Form>
//             }

//         </Mutation>
//     );
// };

/* show date and time separately */
export const showTimeFunc = {
    showDate: function (timestamps: number) {
        return new Date(timestamps).toISOString().substring(0, 10);
    },
    showTime: function (timestamps: number) {
        return new Date(timestamps).toISOString().substring(11, 19);
    }
};

/* More time control due to different behaviors in chrome and firefox, also correct errors of summer/winter time offset */
export const changeTimeFunc = {
    changeDate: function (inputs: any, value: any) {
        /* When in summer time, there is non-zero timezoneoffset which should be considered */
        const offsetTime = new Date(inputs.expiredAt - new Date(inputs.expiredAt).getTimezoneOffset() * 60 * 1000);
        let newDate;
        const recordTime = offsetTime.toISOString().substring(11, 19);
        /* If the input date is invalid, the shown date will keep the original one */
        if (isNaN(new Date(value + 'T' + recordTime).valueOf()) || (new Date(value + 'T' + recordTime).valueOf() < 0)) {
            newDate = new Date(inputs.expiredAt);
        } else {
            newDate = new Date(value + 'T' + recordTime);
        }
        return { ...inputs, expiredAt: newDate.valueOf() };
    },
    changeTime: function (inputs: any, value: any) {
        const recordedDate = new Date(inputs.expiredAt).toISOString().substring(0, 10);
        /* When in summer time, there is non-zero timezoneoffset which should be considered */
        return { ...inputs, expiredAt: new Date(recordedDate + 'T' + value).valueOf() - new Date(inputs.expiredAt).getTimezoneOffset() * 60 * 1000 };
    }
};

export const cryptoInBrowser = {
    keyGen: async function () {
        return Key.createRSAKey();
    },
    signGen: async function (message: string, signKey: CryptoKey) {
        return Key.signwtRSAKey(message, signKey);
    }
};

// export const RegisterPublicKey: FunctionComponent<{ userId: string }> = ({userId}) => {
//     const [completedKeypairGen, setcompletedKeypairGen] = useState(false);
//     const [exportedKeyPair, setExportedKeyPair] = useState({privateKey: '', publicKey: '' });
//     const [signature, setSignature] = useState('');

//     const keyGenInBrowser = async function () {
//         const keyPair = await cryptoInBrowser.keyGen();
//         const exportedKeyPair = await Key.exportRSAKey(keyPair);
//         setExportedKeyPair(exportedKeyPair);
//         const message = exportedKeyPair.publicKey;
//         const signature = await cryptoInBrowser.signGen(message, keyPair.privateKey!);
//         setSignature(signature);
//         setcompletedKeypairGen(true);
//     };

//     const [downloadLink, setDownloadLink] = useState('');
//     // function for generating file and set download link
//     const makeTextFile = (filecontent: string) => {
//         const data = new Blob([filecontent], {type: 'text/plain' });
//         // this part avoids memory leaks
//         if (downloadLink !== '') window.URL.revokeObjectURL(downloadLink);
//         // update the download link state
//         setDownloadLink(window.URL.createObjectURL(data));
//     };

//     const [completedRegister, setCompletedRegister] = useState(false);
//     const {loading: getPubkeysloading, error: getPubkeyserror, data: getPubkeysdata } = useQuery(GET_PUBKEYS, {
//         variables: {
//             associatedUserId: userId
//         }
//     });
//     if (getPubkeysloading) {
//         return <>
//             <div className='page_ariane'>Loading...</div>
//             <div className='page_content'>
//                 <LoadSpinner />
//             </div>
//         </>;
//     }
//     if (getPubkeyserror) {
//         return <>
//             <div className='page_ariane'>Loading...</div>
//             <div className='page_content'>
//                 <Alert type='error' message={getPubkeyserror.message} />
//             </div>
//         </>;
//     }
//     const ipubkey: IPubkey = getPubkeysdata?.getPubkeys?.[0];

//     if (completedKeypairGen) {
//         return (
//             <Mutation<any, any>
//                 mutation={REGISTER_PUBKEY}
//                 onCompleted={() => setCompletedRegister(true)}
//             >
//                 {(submit, { loading, error }) =>
//                     <Form title='RegisterPublicKeyCompletedKeyPai' initialValues={{
//                         associatedUserId: userId
//                     }} layout='vertical' onFinish={(variables) => submit({ variables })}>

//                         <Form.Item name='associatedUserId' label='User ID'>
//                             <Input disabled />
//                         </Form.Item>

//                         {((ipubkey === null) || (ipubkey === undefined))
//                             ? <p>Register your public-key for use.</p>
//                             :
//                             <>
//                                 <Form.Item name='currentPubkey' label='Current registered public key'>
//                                     <Input disabled placeholder={ipubkey?.pubkey.replace(/\n/g, '\\n')} />
//                                 </Form.Item>
//                                 <br />
//                                 <p>Register a new public-key. The current one will then be no longer valid.</p>
//                             </>
//                         }

//                         <h2>Securely keep the private key and the signature for use as we do not store such information on the server!.</h2>

//                         <p>Private Key:</p>
//                         <textarea title='Private Key' disabled value={exportedKeyPair.privateKey.replace(/\n/g, '\\n')} cols={120} rows={20} />
//                         <br />
//                         <a download='privateKey.pem' href={downloadLink}>
//                             <Button type='primary' onClick={() => makeTextFile(exportedKeyPair.privateKey.replace(/\n/g, '\\n'))}>
//                                 Save the private key (PEM file)
//                             </Button>
//                         </a>
//                         <br />
//                         <br />

//                         <p>Public Key:</p>
//                         <textarea title='Public Key' disabled value={exportedKeyPair.publicKey.replace(/\n/g, '\\n')} cols={120} rows={7} />
//                         <br />
//                         <a download='publicKey.pem' href={downloadLink}>
//                             <Button type='primary' onClick={() => makeTextFile(exportedKeyPair.publicKey.replace(/\n/g, '\\n'))}>
//                                 Save the public key (PEM file)
//                             </Button>
//                         </a>
//                         <br />
//                         <br />

//                         <p>Signature:</p>
//                         <textarea title='Signature' disabled value={signature} cols={120} rows={7} />
//                         <br />
//                         <a download='signature.txt' href={downloadLink}>
//                             <Button type='primary' onClick={() => makeTextFile(signature)}>
//                                 Save the signature (TXT file)
//                             </Button>
//                         </a>
//                         <br />
//                         <br />

//                         <Form.Item name='pubkey' label='Public key' hasFeedback rules={[{ required: true, message: 'Please enter your public key' }]}>
//                             <textarea title='Public key' cols={120} rows={10} />
//                         </Form.Item>

//                         <Form.Item name='signature' label='Signature' hasFeedback rules={[{ required: true, message: 'Please enter the signature' }]}>
//                             <textarea title='Signature' cols={120} rows={10} />
//                         </Form.Item>

//                         {error ? (
//                             <>
//                                 <Alert type='error' message={error.graphQLErrors.map(error => error.message).join()} />
//                                 <br />
//                             </>
//                         ) : null}
//                         {completedRegister ? (
//                             <>
//                                 <Alert type='success' message={'Public-key is Sucessfully Registered!'} />
//                                 <br />
//                             </>
//                         ) : null}

//                         <Form.Item>
//                             <Button type='primary' disabled={loading} loading={loading} htmlType='submit'>
//                                 Register
//                             </Button>
//                         </Form.Item>

//                     </Form>
//                 }

//             </Mutation>
//         );
//     }

//     return (
//         <Mutation<any, any>
//             mutation={REGISTER_PUBKEY}
//             onCompleted={() => setCompletedRegister(true)}
//         >
//             {(submit, { loading, error }) =>
//                 <>
//                     <Form title='RegisterPublicKey' initialValues={{
//                         associatedUserId: userId
//                     }} layout='vertical' onFinish={(variables) => submit({ variables })}>

//                         <Form.Item name='associatedUserId' label='User ID'>
//                             <Input disabled />
//                         </Form.Item>

//                         {((ipubkey === null) || (ipubkey === undefined))
//                             ? <p>Register your public-key for use.</p>
//                             :
//                             <>
//                                 <Form.Item name='currentPubkey' label='Current registered public key'>
//                                     <Input disabled placeholder={ipubkey?.pubkey.replace(/\n/g, '\\n')} />
//                                 </Form.Item>
//                                 <br />
//                                 <p>Register a new public-key. The current one will then be no longer valid.</p>
//                             </>
//                         }

//                         <Form.Item name='pubkey' label='Public key' hasFeedback rules={[{ required: true, message: 'Please enter your public key' }]}>
//                             <textarea title='Public key' cols={120} rows={10} />
//                         </Form.Item>

//                         <Form.Item name='signature' label='Signature' hasFeedback rules={[{ required: true, message: 'Please enter the signature' }]}>
//                             <textarea title='Signature' cols={120} rows={10} />
//                         </Form.Item>

//                         {error ? (
//                             <>
//                                 <Alert type='error' message={error.graphQLErrors.map(error => error.message).join()} />
//                                 <br />
//                             </>
//                         ) : null}
//                         {completedRegister ? (
//                             <>
//                                 <Alert type='success' message={'Public-key is Sucessfully Registered!'} />
//                                 <br />
//                             </>
//                         ) : null}

//                         <Form.Item>
//                             <Button type='primary' disabled={loading} loading={loading} htmlType='submit'>
//                                 Register
//                             </Button>
//                         </Form.Item>

//                     </Form>

//                     <br />
//                     <Button type='primary' onClick={() => keyGenInBrowser()}>
//                         Do not have public/private keypair? Generate one (In-browser)!
//                     </Button>

//                 </>
//             }

//         </Mutation>
//     );

// };
export const RsaSigner: FunctionComponent = () => {
    const [privateKey, setPrivateKey] = useState('');
    const [publicKey, setPublicKey] = useState('');

    const handlePrivateKey = (event: ChangeEvent<HTMLTextAreaElement>) => {
        const privateKey = event.target.value;
        setPrivateKey(privateKey);
    };

    const handlePublicKey = (event: ChangeEvent<HTMLTextAreaElement>) => {
        const publicKey = event.target.value;
        setPublicKey(publicKey);
    };

    const [signature, setSignature] = useState('');
    const [completedSignatureGen, setcompletedSignatureGen] = useState(false);

    const signGen = async function () {
        const privateKeyFormatted = await Key.importRSAPrivateKey(privateKey);
        const signature = await cryptoInBrowser.signGen(publicKey, privateKeyFormatted);
        //const signature  = await cryptoInBrowser.signGen('abc', privateKeyFormatted);
        setSignature(signature);
        setcompletedSignatureGen(true);
    };

    const [downloadLink, setDownloadLink] = useState('');
    // function for generating file and set download link
    const makeTextFile = (filecontent: string) => {
        const data = new Blob([filecontent], { type: 'text/plain' });
        // this part avoids memory leaks
        if (downloadLink !== '') window.URL.revokeObjectURL(downloadLink);
        // update the download link state
        setDownloadLink(window.URL.createObjectURL(data));
    };

    if (completedSignatureGen) {
        return (
            <div>
                <h3>The signature is successfully generated!</h3>
                <br />
                <p>Securely keep this signature to register with the data management portal!</p>
                <textarea title='Signature' disabled value={signature} cols={120} rows={7} />
                <br />
                <a download='signature.txt' href={downloadLink}>
                    <Button type='primary' onClick={() => makeTextFile(signature)}>
                        Save the signature (TXT file)
                    </Button>
                </a>
            </div>
        );
    }

    return (
        <div>
            <p>To generate a digital signature to use in the data management portal, you need a public and private keypair</p>
            <p>Private Key: </p>
            <textarea cols={120} rows={10} name='privateKey' value={privateKey} onChange={handlePrivateKey} required> </textarea>
            <br />
            <p>Public Key: </p>
            <textarea cols={120} rows={10} name='privateKey' value={publicKey} onChange={handlePublicKey} required> </textarea>
            <br />
            <Button type='primary' onClick={() => signGen()}>
                Generate Signature (In-Browser)
            </Button>
        </div>
    );

};

export const TokenManagement: FunctionComponent<{ userId: string }> = ({ userId }) => {
    return null;
    // const [completedTokenGen, setcompletedTokenGen] = useState(false);
    // //const [accessTokenGen, setaccessTokenGen] = useState('');
    // const [tokenGen, {data: tokendata, loading, error }] = useMutation(ISSUE_ACCESS_TOKEN, {
    //     onCompleted: () => {
    //         setcompletedTokenGen(true);
    //     }
    // });

    // const { loading: getPubkeysloading, error: getPubkeyserror, data: getPubkeysdata } = useQuery(GET_PUBKEYS, {
    //     variables: {
    //         associatedUserId: userId
    //     }
    // });
    // if (getPubkeysloading) {
    //     return <>
    //         <div className='page_ariane'>Loading...</div>
    //         <div className='page_content'>
    //             <LoadSpinner />
    //         </div>
    //     </>;
    // }
    // if (getPubkeyserror) {
    //     return <>
    //         <div className='page_ariane'>Loading...</div>
    //         <div className='page_content'>
    //             <Alert type='error' message={getPubkeyserror.message} />
    //         </div>
    //     </>;
    // }

    // const ipubkey: IPubkey = getPubkeysdata?.getPubkeys?.[0];
    // if ((ipubkey === null) || (ipubkey === undefined)) {
    //     return <p>You need to register a public-key for generating access token.</p>;
    // }

    // if (completedTokenGen) {
    //     return (
    //         <div>
    //             <h2>The access token is successfully generated!</h2>
    //             <br />
    //             <p>Securely keep this token as an authentication key when interacting with APIs</p>
    //             <textarea title='Token' disabled value={tokendata.issueAccessToken.accessToken} cols={120} rows={20} />
    //             <br />
    //         </div>
    //     );
    // }

    // return (
    //     <Form title='TokenManagement' initialValues={{
    //         pubkey: ipubkey?.pubkey.replace(/\n/g, '\\n')
    //     }} layout='vertical' onFinish={(variables) => tokenGen({ variables })}>
    //         <p>To generate an access token, you need to enter the signature signed by your private-key</p>
    //         <p>Current refresh counter: <strong>{ipubkey?.refreshCounter}</strong></p>
    //         <Form.Item name='pubkey' label='Your registered public key'>
    //             <Input disabled placeholder={ipubkey?.pubkey.replace(/\n/g, '\\n')} />
    //         </Form.Item>

    //         <Form.Item name='signature' label='Signature' hasFeedback rules={[{ required: true, message: 'Please enter the signature' }]}>
    //             <Input />
    //         </Form.Item>

    //         {error ? (
    //             <>
    //                 <Alert type='error' message={error.graphQLErrors.map(error => error.message).join()} />
    //                 <br />
    //             </>
    //         ) : null}

    //         <Form.Item>
    //             <Button type='primary' disabled={loading} loading={loading} htmlType='submit'>
    //                 Generate Token
    //             </Button>
    //         </Form.Item>
    //     </Form>
    // );

};

const getBase64 = (file: RcFile): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });