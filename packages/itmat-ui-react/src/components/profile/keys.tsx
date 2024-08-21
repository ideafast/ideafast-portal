import React, { FunctionComponent, useState } from 'react';
import LoadSpinner from '../reusable/loadSpinner';
// import { ProjectSection } from '../users/projectSection';
import { Form, Input, Button, List, Table, message, Modal, Upload, Popconfirm } from 'antd';
import { CopyOutlined, UploadOutlined } from '@ant-design/icons';
import css from './profile.module.css';
import { trpc } from '../../utils/trpc';
import copy from 'copy-to-clipboard';
import { Key } from '../../utils/dmpCrypto/dmp.key';
const { TextArea } = Input;

export const MyKeys: FunctionComponent = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getUserKeys = trpc.user.getUserKeys.useQuery({ userId: whoAmI.data.id });
    const deletePubkey = trpc.user.deletePubkey.useMutation({
        onSuccess: () => {
            void message.success('Key deleted.');
        },
        onError: () => {
            void message.error('Failed to delete this key.');
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
                            void message.success('Publick key copied to clipboard');
                        }}
                        style={{ marginLeft: '8px' }}
                    />
                </div>
            );
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
            return <TokenGenerationForm username={whoAmI.data.username} pubkey={record.pubkey} />;
        }
    }, {
        title: '',
        dataIndex: 'delete',
        key: 'delete',
        render: (_, record) => {
            return <Popconfirm
                title="Are you sure to delete this key?"
                onConfirm={() => deletePubkey.mutate({
                    associatedUserId: whoAmI.data.id,
                    keyId: record.id
                })}
            >
                <Button danger>Delete</Button>
            </Popconfirm >;
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
                    style={{ width: '100%' }}
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
            void message.success('Key registered.');
        },
        onError: () => {
            void message.error('Failed to register this key.');
        }
    });

    const [signature, setSignature] = useState('');

    const [downloadLink, setDownloadLink] = useState('');
    // function for generating file and set download link
    const makeTextFile = (filecontent: string) => {
        const data = new Blob([filecontent], { type: 'text/plain' });
        // Avoid memory leaks
        if (downloadLink !== '') window.URL.revokeObjectURL(downloadLink);
        // Update the download link state
        setDownloadLink(window.URL.createObjectURL(data));
    };

    return (
        <div>
            <Button type='primary' onClick={() => setIsKeyGenOpen(true)}>Generate a Key Pair</Button>
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
                <Button type='primary' onClick={() => {
                    void (async () => {
                        const keyPair = await cryptoInBrowser.keyGen();
                        const exportedKeyPair = await Key.exportRSAKey(keyPair);
                        setExportedKeyPair(exportedKeyPair);
                        const message = exportedKeyPair.publicKey;
                        const signature = await cryptoInBrowser.signGen(message, keyPair.privateKey);
                        setcompletedKeypairGen(true);
                        setSignature(signature);
                    })();
                }}>
                    Do not have public/private keypair? Generate one (In-browser)!
                </Button>
                {
                    completedKeypairGen ? <div>
                        Public key: <TextArea value={exportedKeyPair.publicKey.replace(/\n/g, '\\n')} disabled={true} />
                        <a download='publicKey.pem' href={downloadLink}>
                            <Button type='primary' onClick={() => makeTextFile(exportedKeyPair.publicKey)}>
                                Save the public key (PEM file)
                            </Button>
                        </a><br /><br />
                        {/* Secret key: <TextArea value={exportedKeyPair.privateKey.replace(/\n/g, '\\n')} disabled={true} /> */}
                        <a download='privateKey.pem' href={downloadLink}>
                            <Button type='primary' onClick={() => makeTextFile(exportedKeyPair.privateKey)}>
                                Save the private key (PEM file)
                            </Button>
                        </a><br />

                        {/* Signature: <TextArea value={signature} disabled={true} /> */}
                        {/* <a download='signature.txt' href={downloadLink}>
                            <Button type='primary' onClick={() => makeTextFile(signature)}>
                                Save the signature (TXT file)
                            </Button>
                        </a><br /> */}
                        <Button onClick={() => {
                            void (async () => {
                                await registerPubkey.mutate({
                                    pubkey: exportedKeyPair.publicKey,
                                    signature: signature,
                                    associatedUserId: userId
                                });
                            })();
                        }}>
                            Register this key pair
                        </Button>
                    </div>
                        : null
                }
            </Modal>
        </div >
    );
};

const TokenGenerationForm = ({ username, pubkey }) => {
    const [form] = Form.useForm();
    const [privateKey, setPrivateKey] = useState<string | null>(null);

    const requestAccessToken = trpc.user.requestAccessToken.useMutation({
        onSuccess: async (data) => {
            if (!privateKey) {
                void message.error('Private key not loaded.');
                return;
            }
            const signature = await signWithPrivateKey(privateKey, data.challenge);
            getAccessToken.mutate({ username, pubkey, signature: signature });
        },
        onError: () => {
            void message.error('Failed to generate token.');
        }
    });

    const getAccessToken = trpc.user.getAccessToken.useMutation({
        onSuccess: (data) => {
            void message.success('Token generated.');
            copy(data);  // Assuming `copy` is defined elsewhere
        },
        onError: () => {
            void message.error('Failed to generate token.');
        }
    });

    const handleGenerateClick = async () => {
        requestAccessToken.mutate({ username, pubkey });
    };

    const handleFileUpload = (info) => {
        const file = info.file.originFileObj as File; // Get the selected file
        const reader = new FileReader();

        reader.onload = async (e) => {
            const pem = e?.target?.result as string | undefined;
            if (pem) {
                try {
                    setPrivateKey(pem);
                } catch (error) {
                    void message.error('Failed to load the private key.');
                }
            }
        };

        reader.onerror = () => {
            void message.error('Failed to read the private key file.');
        };

        reader.readAsText(file);  // Read the file as text
    };

    async function signWithPrivateKey(pemKey, hashedChallengeHex) {
        // Convert PEM to ArrayBuffer
        function pemToArrayBuffer(pem) {
            const b64 = pem
                .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
                .replace(/\s+/g, '');
            const binary = window.atob(b64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
        }

        // Import the private key
        async function importPrivateKey(pemKey) {
            const keyData = pemToArrayBuffer(pemKey);
            return await crypto.subtle.importKey(
                'pkcs8', // The format of the key, PKCS8 for private keys
                keyData, // The ArrayBuffer from the PEM
                {
                    name: 'RSA-PSS', // The algorithm to use
                    hash: { name: 'SHA-256' } // The hash function to use
                },
                false, // Not extractable
                ['sign'] // Key usages
            );
        }

        // Convert the hex string to ArrayBuffer
        function hexToArrayBuffer(hexString) {
            const byteArray = new Uint8Array(
                hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
            );
            return byteArray.buffer;
        }

        // Convert Uint8Array to Base64
        function arrayBufferToBase64(buffer) {
            const byteArray = new Uint8Array(buffer);
            let binary = '';
            byteArray.forEach(byte => {
                binary += String.fromCharCode(byte);
            });
            return window.btoa(binary);
        }

        // Import the private key
        const privateKey = await importPrivateKey(pemKey);

        // Convert the hashed challenge from hex to ArrayBuffer
        const challengeBuffer = hexToArrayBuffer(hashedChallengeHex);

        // Sign the hashed challenge
        const signatureBuffer = await crypto.subtle.sign(
            {
                name: 'RSA-PSS', // Using RSA-PSS for the signing algorithm
                saltLength: 32 // Typically the same length as the hash output (32 bytes for SHA-256)
            },
            privateKey, // The private key object
            challengeBuffer // The data to be signed, as an ArrayBuffer
        );

        // Convert the signature to a Base64 string
        const signatureBase64 = arrayBufferToBase64(signatureBuffer);

        return signatureBase64;
    }

    return (
        <Form form={form} layout="inline">
            <Form.Item
                name="life"
                rules={[{ required: true, message: 'Life is required' }]}
            >
                {
                    !privateKey ?
                        <Upload
                            onChange={handleFileUpload}
                            accept='.pem'
                            showUploadList={false}
                        >
                            <Button icon={<UploadOutlined />}>Select Private Key</Button>
                        </Upload>
                        :
                        <Button style={{ backgroundColor: 'lightgreen' }}>Private Key Loaded</Button>
                }
            </Form.Item>
            <Form.Item>
                <Button
                    type="primary"
                    onClick={() => {
                        void (async () => {
                            await handleGenerateClick();
                        })();

                    }}
                >
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
