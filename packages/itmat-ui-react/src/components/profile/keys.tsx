import React, { FunctionComponent, useState } from 'react';
import LoadSpinner from '../reusable/loadSpinner';
// import { ProjectSection } from '../users/projectSection';
import { Form, Input, Button, List, Table, message, Modal } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import css from './profile.module.css';
import { trpc } from '../../utils/trpc';
import copy from 'copy-to-clipboard';
import { Key } from '../../utils/dmpCrypto/dmp.key';
const { TextArea } = Input;

export const MyKeys: FunctionComponent = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getUserKeys = trpc.user.getUserKeys.useQuery({ userId: whoAmI.data.id });
    const issueAccessToken = trpc.user.issueAccessToken.useMutation();
    const deletePubkey = trpc.user.deletePubkey.useMutation({
        onSuccess: () => {
            message.success('Key deleted.');
        },
        onError: () => {
            message.error('Failed to delete this key.');
        }
    });
    if (whoAmI.isLoading || getUserKeys.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (whoAmI.isError || getUserKeys.isError) {
        return <>
            An error occured.
        </>;
    }

    const columns = [{
        title: 'Pubkey',
        dataIndex: 'pubkey',
        key: 'value',
        render: (__unused__value, record) => {
            const pubkey = record.pubkey ?? '';
            // Remove headers and footers from the public key
            const keyBody = pubkey.replace('-----BEGIN PUBLIC KEY-----', '')
                .replace('-----END PUBLIC KEY-----', '')
                .trim(); // Remove extra whitespace

            // Extract the first few characters of the key body
            const displayKey = keyBody.substring(0, 26) + '...'; // Adjust number of characters as needed
            return (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span>{displayKey}</span>
                    <Button
                        icon={<CopyOutlined />}
                        onClick={() => {
                            copy(pubkey);
                            message.success('Publick key copied to clipboard');
                        }}
                        style={{ marginLeft: '8px' }}
                    />
                </div>
            );
        }
    }, {
        title: 'Refresh Counter',
        dataIndex: 'refreshCounter',
        key: 'value',
        render: (__unused__value, record) => {
            return record.refreshCounter;
        }
    }, {
        title: 'Created At',
        dataIndex: 'createdAt',
        key: 'value',
        render: (__unused__value, record) => {
            return (new Date(record.life.createdTime)).toDateString();
        }
    }, {
        title: 'Token Generation',
        dataIndex: 'tokenGeneration',
        key: 'value',
        render: (_, record) => {
            return <TokenGenerationForm pubkey={record.pubkey} issueAccessToken={issueAccessToken} />;
        }
    }, {
        title: '',
        dataIndex: 'delete',
        key: 'delete',
        render: (_, record) => {
            return <Button onClick={() => deletePubkey.mutate({
                associatedUserId: whoAmI.data.id,
                keyId: record.id
            })}>Delete</Button>;
        }
    }];
    return (<div className={css.key_wrapper}>
        <List
            header={
                <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div className={css['overview-icon']}></div>
                            <div>My Keys</div>
                        </div>
                    </div>
                    <div>
                        <KeyGeneration userId={whoAmI.data.id} />
                    </div>
                </div>
            }
        >
            <List.Item>
                <Table
                    dataSource={getUserKeys.data}
                    columns={columns}
                />
            </List.Item>
        </List>

    </div>);
};

const KeyGeneration: React.FunctionComponent<{ userId: string }> = ({ userId }) => {
    const [isKeyGenOpen, setIsKeyGenOpen] = useState(false);
    const [completedKeypairGen, setcompletedKeypairGen] = useState(false);
    const [exportedKeyPair, setExportedKeyPair] = useState({ privateKey: '', publicKey: '' });
    const registerPubkey = trpc.user.registerPubkey.useMutation({
        onSuccess: () => {
            message.success('Key registered.');
        },
        onError: () => {
            message.error('Failed to register this key.');
        }
    });

    const [signature, setSignature] = useState('');

    const [downloadLink, setDownloadLink] = useState('');
    // function for generating file and set download link
    const makeTextFile = (filecontent: string) => {
        const data = new Blob([filecontent], { type: 'text/plain' });
        // this part avoids memory leaks
        if (downloadLink !== '') window.URL.revokeObjectURL(downloadLink);
        // update the download link state
        setDownloadLink(window.URL.createObjectURL(data));
    };

    return (
        <div>
            <Button onClick={() => setIsKeyGenOpen(true)}>Generate a Key Pair</Button>
            <Modal
                title='Generate a new key pair'
                open={isKeyGenOpen}
                width={'80%'}
                onOk={() => {
                    setIsKeyGenOpen(false);
                }}
                onCancel={() => {
                    setIsKeyGenOpen(false);
                }}
            >
                <Button type='primary' onClick={async () => {
                    const keyPair = await cryptoInBrowser.keyGen();
                    const exportedKeyPair = await Key.exportRSAKey(keyPair);
                    setExportedKeyPair(exportedKeyPair);
                    const message = exportedKeyPair.publicKey;
                    const signature = await cryptoInBrowser.signGen(message, keyPair.privateKey!);
                    setcompletedKeypairGen(true);
                    setSignature(signature);
                }}>
                    Do not have public/private keypair? Generate one (In-browser)!
                </Button>
                {
                    completedKeypairGen ? <div>
                        Public key: <TextArea value={exportedKeyPair.publicKey.replace(/\n/g, '\\n')} disabled={true} />
                        <a download='publicKey.pem' href={downloadLink}>
                            <Button type='primary' onClick={() => makeTextFile(exportedKeyPair.publicKey.replace(/\n/g, '\\n'))}>
                                Save the public key (PEM file)
                            </Button>
                        </a><br />
                        Secret key: <TextArea value={exportedKeyPair.privateKey.replace(/\n/g, '\\n')} disabled={true} />
                        <a download='privateKey.pem' href={downloadLink}>
                            <Button type='primary' onClick={() => makeTextFile(exportedKeyPair.privateKey.replace(/\n/g, '\\n'))}>
                                Save the private key (PEM file)
                            </Button>
                        </a><br />
                        Signature: <TextArea value={signature} disabled={true} />
                        <a download='signature.txt' href={downloadLink}>
                            <Button type='primary' onClick={() => makeTextFile(signature)}>
                                Save the signature (TXT file)
                            </Button>
                        </a><br />
                        <Button onClick={async () => await registerPubkey.mutate({
                            pubkey: exportedKeyPair.publicKey,
                            signature: signature,
                            associatedUserId: userId
                        })}>Register this key pair</Button>
                    </div>
                        : null
                }
            </Modal>
        </div >
    );
};

const TokenGenerationForm = ({ pubkey, issueAccessToken }) => {
    const [form] = Form.useForm();

    const onFormFinish = async (values) => {
        try {
            const data = await issueAccessToken.mutateAsync({ pubkey, signature: values.signature, life: values.life * 60 * 60 });
            copy(data.accessToken);
            message.success('Token copied to clipboard');
        } catch (error) {
            console.error('Error generating token:', error);
            message.error('Failed to generate token');
        }
    };

    return (
        <Form form={form} onFinish={onFormFinish} layout="inline">
            <Form.Item
                name="signature"
                rules={[{ required: true, message: 'Signature is required' }]}
            >
                <Input placeholder="Enter signature" />
            </Form.Item>
            <Form.Item
                name="life"
                rules={[{ required: true, message: 'Life is required' }]}
            >
                <Input placeholder="Enter life in hours" />
            </Form.Item>
            <Form.Item>
                <Button type="primary" htmlType="submit">
                    Gen
                </Button>
            </Form.Item>
        </Form>
    );
};

export const cryptoInBrowser = {
    keyGen: async function () {
        return Key.createRSAKey();
    },
    signGen: async function (message: string, signKey: CryptoKey) {
        return Key.signwtRSAKey(message, signKey);
    }
};