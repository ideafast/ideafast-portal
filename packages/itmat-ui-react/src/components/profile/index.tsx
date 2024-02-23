import { FunctionComponent } from 'react';
import { ProfileManagementSection } from './profile';
import css from './profile.module.css';
import { Divider } from 'antd';
import { MyGroup } from './group';
import { MyKeys } from './keys';
import {MyWebauthn} from './webauthn';

export const ProfilePage: FunctionComponent = () => {
    return (
        <div className={css.page_container}>
            <div className={css.section}>
                <ProfileManagementSection />
                <Divider />
            </div>
            <div className={css.section}>
                <MyGroup />
                <Divider />
            </div>
            <div className={css.section}>
                <MyKeys />
                <Divider />
            </div>
            <div className={css.section}>
                <MyWebauthn />
                <Divider />
            </div>
        </div>
    );
};
