import { FunctionComponent } from 'react';
import { ProfileManagementSection } from './profile';
import { MyFile } from './file';
import css from './profile.module.css';
import { Divider } from 'antd';
import { MyGroup } from './group';
import { MyKeys } from './keys';

export const ProfilePage: FunctionComponent = () => {
    return (
        <div className={css.page_container}>
            <ProfileManagementSection />
            <Divider />
            <MyFile />
            <Divider />
            <MyGroup />
            <MyKeys />
        </div>
    );
};
