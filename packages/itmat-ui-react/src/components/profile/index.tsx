import { FunctionComponent } from 'react';
import { ProfileManagementSection } from './profile';
import css from './profile.module.css';
import { Divider } from 'antd';
import { MyKeys } from './keys';
import {MyWebauthn} from './webauthn';

export const ProfilePage: FunctionComponent = () => {
    return (
        <div className={css.page_container}>
            <ProfileManagementSection />
            <Divider />
            <MyKeys />
            <Divider />
            <MyWebauthn />
        </div>
    );
};
