import { FunctionComponent, useEffect, useState } from 'react';
import { Mutation } from '@apollo/client/react/components';
import { LOGIN, WHO_AM_I, GET_CONFIG, GET_DOCS } from '@itmat-broker/itmat-models';
import { NavLink } from 'react-router-dom';
import css from './login.module.css';
import { Input, Form, Button, Alert, Checkbox, Image, Carousel } from 'antd';
import { useMutation, useQuery } from '@apollo/client/react/hooks';
import LoadSpinner from '../reusable/loadSpinner';
import { IConfig, ISystemConfig, enumConfigType, enumDocTypes } from '@itmat-broker/itmat-types';
import 'react-quill/dist/quill.snow.css'; // for Snow theme
import { GithubOutlined } from '@ant-design/icons';
import { trpc } from '../../utils/trpc';

export const LoginBox: FunctionComponent = () => {
    const getSystemConfig = trpc.config.getConfig.useQuery({ configType: enumConfigType.SYSTEMCONFIG, key: null, useDefault: true });
    const getDocs = trpc.doc.getDocs.useQuery({ docId: null, studyId: null, docTypes: [enumDocTypes.HOMEPAGE], verbose: true });
    const login = trpc.user.login.useMutation();

    if (getSystemConfig.isLoading || getDocs.isLoading) {
        return <LoadSpinner />;
    }
    if (getSystemConfig.isError || getDocs.isError) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }

    if (!getSystemConfig.data) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }
    const systemConfig = (getSystemConfig.data as IConfig).properties as ISystemConfig;
    return (<div className={css.login_wrapper}>
        <div className={css.login_left}>
            <div className={css.carousel_wrapper}>
                <Carousel autoplay>
                    {
                        getDocs.data.map(el => {
                            if (el.attachmentFileIds && el.attachmentFileIds.length === 1) {
                                return <Image src={`${window.location.origin}/file/${el.attachmentFileIds[0]}`} />;
                            } else {
                                return null;
                            }
                        })
                    }
                </Carousel>
            </div>
        </div>
        <div className={css.login_right}>
            <div className={css.login_logo}>
                <Image height={systemConfig.logoSize[1]} width={systemConfig.logoSize[0]} src={systemConfig.logoLink ?? ''} />
            </div>
            <div className={css.login_logo} style={{ top: '10px', right: (parseInt(systemConfig.logoSize[1].replace(/\D/g, '')) * 1 + 10) + 'px' }}>
                <Button type="text" href={systemConfig.archiveAddress} icon={<GithubOutlined style={{ fontSize: systemConfig.logoSize[1] }} />} />
            </div>
            <div className={css.login_author}>
                Designed by Data Science Institute
            </div>
            <div className={css.login_box}>
                <div className={css.hello_text}>
                    Hello again.
                </div>
                <Form onFinish={(variables) => login.mutate({ ...variables, requestexpirydate: false })}>
                    <Form.Item name='username' hasFeedback rules={[{ required: true, message: ' ' }]}>
                        <Input className={css.login_box_input} placeholder='Username' />
                    </Form.Item>
                    <Form.Item name='password' hasFeedback rules={[{ required: true, message: ' ' }]}>
                        <Input.Password className={css.login_box_input} placeholder='Password' />
                    </Form.Item>
                    <Form.Item name='totp' hasFeedback rules={[{ required: true, len: 6, message: ' ' }]}>
                        <Input.Password className={css.login_box_input} placeholder='One-Time Passcode' />
                    </Form.Item>
                    <Button className={css.login_box_input} type='primary' disabled={false} loading={false} htmlType='submit'>
                        Login
                    </Button><br /><br />
                    <NavLink className={css.navlink} to='/reset'>Forgot password</NavLink><br /><br />
                    <NavLink className={css.navlink} to='/register'>Please register</NavLink><br />
                </Form>
            </div>
        </div>
    </div >);
};
