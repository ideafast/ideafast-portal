import { FunctionComponent } from 'react';
import { NavLink } from 'react-router-dom';
import { enumUserTypes } from '@itmat-broker/itmat-types';
import css from './scaffold.module.css';
import { DatabaseOutlined, TeamOutlined, PoweroffOutlined, HistoryOutlined, SettingOutlined, DesktopOutlined, WarningTwoTone, CloudOutlined, ApartmentOutlined, ClusterOutlined } from '@ant-design/icons';
import LoadSpinner from '../reusable/loadSpinner';
import dayjs from 'dayjs';
import { Collapse, Tooltip } from 'antd';
import { trpc } from '../../utils/trpc';

export const MainMenuBar: FunctionComponent = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const logout = trpc.user.logout.useMutation({
        onSuccess: () => {
            window.location.reload();
        },
        onError: () => {
            window.location.reload();
        }
    });
    if (whoAmI.isLoading) {
        return <LoadSpinner />;
    }
    if (whoAmI.isError) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }

    return <div className={css.main_menubar}>
        <div>
            <NavLink to='/datasets' title='Datasets' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                <div className={css.button}><DatabaseOutlined /> Datasets</div>
            </NavLink>
        </div>
        <div>
            <NavLink to='/profile' title='My account' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                <div className={css.button}>
                    {
                        (whoAmI.data.type !== enumUserTypes.ADMIN && dayjs().add(2, 'week').valueOf() - dayjs(whoAmI.data.expiredAt).valueOf() > 0) ?
                            <><SettingOutlined /><Tooltip title={'Your account will expire soon. You can make a request on the login page.'}> My Account<WarningTwoTone /></Tooltip></> :
                            <><SettingOutlined /> My Account</>
                    }
                </div>
            </NavLink >
        </div >
        <div>
            <NavLink to='/drive' title='Drives' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                <div className={css.button}><CloudOutlined /> My Drive</div>
            </NavLink>
        </div>
        <div>
            <NavLink to='/pun/sys/dashboard' target='_blank' title='Analytical Environment' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                <div className={css.button}><DesktopOutlined /> Analytical Environment</div>
            </NavLink>
        </div>
        {
            (whoAmI.data.type === enumUserTypes.ADMIN) ?
                <div>
                    <Collapse
                        items={[{
                            key: 'admin_tab_list',
                            label: 'Admin',
                            children: <div>
                                <div>
                                    <NavLink to='/logs' title='Logs' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                                        <div className={css.button} style={{ color: 'black' }}><HistoryOutlined /> Logs</div>
                                    </NavLink>
                                </div>
                                <div>
                                    <NavLink to='/users' title='Users' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                                        <div className={css.button} style={{ color: 'black' }}><TeamOutlined /> Users</div>
                                    </NavLink>
                                </div>
                                <div>
                                    <NavLink to='/domains' title='Domains' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                                        <div className={css.button} style={{ color: 'black' }}><ApartmentOutlined /> Domains</div>
                                    </NavLink>
                                </div>
                                <div>
                                    <NavLink to='/organisations' title='Organisations' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                                        <div className={css.button} style={{ color: 'black' }}><ClusterOutlined /> Organisations</div>
                                    </NavLink>
                                </div>
                            </div>
                        }]}
                    />
                </div>
                : null
        }
        <div>
            <NavLink title='Logout' to='/'>
                <div className={css.button} onClick={() => { logout.mutate(); }}><PoweroffOutlined /> Logout</div>
            </NavLink>
        </div>
    </div >;
};
