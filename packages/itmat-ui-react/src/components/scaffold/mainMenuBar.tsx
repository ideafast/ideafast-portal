import { FunctionComponent } from 'react';
import { Mutation } from '@apollo/client/react/components';
import { NavLink } from 'react-router-dom';
import { LOGOUT, WHO_AM_I } from '@itmat-broker/itmat-models';
import { IProject, enumUserTypes } from '@itmat-broker/itmat-types';
import css from './scaffold.module.css';
import { DatabaseOutlined, TeamOutlined, PoweroffOutlined, HistoryOutlined, SettingOutlined, DesktopOutlined, WarningTwoTone, CloudOutlined, FileOutlined, GlobalOutlined, CodeSandboxOutlined } from '@ant-design/icons';
import LoadSpinner from '../reusable/loadSpinner';
import dayjs from 'dayjs';
import { Tooltip } from 'antd';
import React from 'react';
import { trpc } from '../../utils/trpc';

type MainMenuBarProps = {
    projects: IProject[];
}
export const MainMenuBar: FunctionComponent<MainMenuBarProps> = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
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
        {whoAmI.data.type === enumUserTypes.ADMIN ?
            <div>
                <NavLink to='/users' title='Users' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                    <div className={css.button}><TeamOutlined /> Users</div>
                </NavLink>
            </div> : null
        }
        {(whoAmI.data.type === enumUserTypes.ADMIN || whoAmI.data.metadata?.logPermission) ?
            <div>
                <NavLink to='/logs' title='Logs' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                    <div className={css.button}><HistoryOutlined /> Logs</div>
                </NavLink>
            </div> : null
        }
        <div>
            <NavLink to='/drive' title='Drives' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                <div className={css.button}><CloudOutlined /> My Drive</div>
            </NavLink>
        </div>

        <div>
            <NavLink to='/documents' title='Documents' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                <div className={css.button}><FileOutlined /> Documents</div>
            </NavLink>
        </div>

        <div>
            <NavLink to='/organisations' title='Organisations' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                <div className={css.button}><GlobalOutlined /> Organisations</div>
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
        {/* {(whoAmI.data.type === enumUserTypes.ADMIN || whoAmI.data.metadata?.logPermission) ?
            <div>
                <NavLink to='/jobs' title='Jobs' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                    <div className={css.button}><CodeSandboxOutlined /> Jobs</div>
                </NavLink>
            </div> : null
        } */}
        {
            <div>
                <NavLink to='/instances' title='Analytical Environment' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                    <div className={css.button}><DesktopOutlined /> Analytical Environment</div>
                </NavLink>
            </div>
        }
        {(whoAmI.data.type === enumUserTypes.ADMIN) ?
            <div>
                <NavLink to='/lxd' title='instances' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                    <div className={css.button}><DesktopOutlined /> LXDManagement</div>
                </NavLink>
            </div> : null
        }
        {/* {(whoAmI.data.type === enumUserTypes.ADMIN || whoAmI.data.metadata?.aePermission === true)
            ? <div>
                <NavLink to='/pun/sys/dashboard' target='_blank' title='Analytical Environment' className={({ isActive }) => isActive ? css.clickedButton : undefined}>
                    <div className={css.button}><DesktopOutlined /> Analytical Environment</div>
                </NavLink>
            </div>
            : null
        } */}
        <div>
            <NavLink title='Logout' to='/'>
                <Mutation<any, any>
                    mutation={LOGOUT}
                    update={(cache, { data: { logout } }) => {
                        if (logout.successful === true) {
                            cache.writeQuery({
                                query: WHO_AM_I,
                                data: { whoAmI: null }
                            });
                        }
                    }}
                >
                    {(logout) => (
                        <div className={css.button} onClick={() => { logout(); }}><PoweroffOutlined /> Logout</div>
                    )}
                </Mutation>
            </NavLink>
        </div>
    </div >;
};
