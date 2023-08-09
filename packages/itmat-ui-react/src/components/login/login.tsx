import { FunctionComponent } from 'react';
import { Mutation } from '@apollo/client/react/components';
import { LOGIN, WHO_AM_I, GET_CONFIG, GET_DOCS } from '@itmat-broker/itmat-models';
import { NavLink } from 'react-router-dom';
import css from './login.module.css';
import { Input, Form, Button, Alert, Checkbox, Image, Carousel } from 'antd';
import { useMutation, useQuery } from '@apollo/client/react/hooks';
import LoadSpinner from '../reusable/loadSpinner';
import { enumConfigType, enumDocTypes } from '@itmat-broker/itmat-types';
import 'react-quill/dist/quill.snow.css'; // for Snow theme

export const LoginBox: FunctionComponent = () => {
    const { loading: getConfigLoading, error: getConfigError, data: getConfigData } = useQuery(GET_CONFIG, { variables: { configType: enumConfigType.SYSTEMCONFIG, key: null } });
    const {loading: getDocsLoading, error: getDocsError, data: getDocsData} = useQuery(GET_DOCS, { variables: { docId: null, studyId: null, docTypes: [enumDocTypes.HOMEPAGE], verbose: true} });
    const [login] = useMutation(LOGIN);
    if (getConfigLoading || getDocsLoading) {
        return <LoadSpinner />;
    }
    if (getConfigError || getDocsError) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }
    const systemConfig = getConfigData.getConfig.properties;
    

    return (<div className={css.login_wrapper}>
        <div className={css.login_left}>
            <Carousel autoplay>
                {
                    getDocsData.getDocs.map(el => (
                    // <div className={css.carousel_block}>
                        <div className={css.inner_block} dangerouslySetInnerHTML={{ __html: el.contents}}>
                        </div>
                    // </div>
                    ))
                }
            </Carousel>
        </div>
        <div className={css.login_right}>
            <div className={css.login_logo}>
                <Image width={systemConfig.logoSize[0]} src={systemConfig.logoLink} />
            </div>
            <div className={css.login_box}>
                Hello again.
                <Form onFinish={(variables) => login({ variables })}>
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
                    <NavLink to='/reset'>Forgot password</NavLink><br /><br />
                    <NavLink to='/register'>Please register</NavLink><br />
                </Form>
            </div>
        </div>
    </div>);
};
