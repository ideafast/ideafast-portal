import { Col, List, Row, Select, Typography } from 'antd';
import { FunctionComponent } from 'react';
import { trpc } from '../../utils/trpc';
import LoadSpinner from '../reusable/loadSpinner';
import React from 'react';
import css from './profile.module.css';
import { OrganizationGraph } from '@ant-design/graphs';
const { Title } = Typography;

export const MyGroup: FunctionComponent = () => {
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getUserGroups = trpc.user.getUserGroups.useQuery({ userId: whoAmI.data?.id });
    const getUsers = trpc.user.getUsers.useQuery({});
    const [selectedGroup, setSelectedGroup] = React.useState<string | null>(getUserGroups?.data ? getUserGroups?.data[0]?.id ?? null : null);
    if (whoAmI.isLoading || getUserGroups.isLoading || getUsers.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (whoAmI.isError || getUserGroups.isError || getUsers.isError) {
        return <>
            An error occured.
        </>;
    }
    return (<div className={css.group_wrapper}>
        <List
            header={
                <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div className={css['overview-icon']}></div>
                        <div>My Groups</div>
                    </div>
                    <div>
                        <Select
                            placeholder='Select a Group'
                            onSelect={(value) => setSelectedGroup(value)}
                            options={getUserGroups.data.map(el => {
                                return {
                                    value: el.id,
                                    label: el.nameOrId
                                };
                            })}
                        />
                    </div>
                </div>
            }
        >
            <List.Item>
                <div className={css.shared_container}>
                    <Row>
                        <OrganizationGraph
                            data={constructGroupGraphData(getUserGroups.data?.filter(el => el.id === selectedGroup)[0], getUsers.data)}

                        />
                    </Row>
                </div>
            </List.Item>
        </List>

    </div>);
};

function constructGroupGraphData(data, users) {
    if (!data) {
        return { id: 'NA', value: { name: 'NA' }, children: [] };
    }
    const obj = {
        id: data.id,
        value: { name: data.nameOrId },
        children: data.children.map(el => {
            const user = users.filter(ek => ek.id === el)[0];
            return {
                id: el,
                value: { name: user ? `${user.firstname} ${user.lastname}` : 'NA' },
                children: []
            };
        })
    };
    return obj;
}