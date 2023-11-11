import { Col, Row, Select, Typography } from 'antd';
import { FunctionComponent } from 'react';
import { trpc } from '../../utils/trpc';
import LoadSpinner from '../reusable/loadSpinner';
import { IGroupNode } from '@itmat-broker/itmat-types';
import React from 'react';
import css from './profile.module.css';
import { RadialTreeGraph } from '@ant-design/graphs';
import FormItemLabel from 'antd/es/form/FormItemLabel';
const { Title } = Typography;

export const MyGroup: FunctionComponent = () => {
    const [selectedGroup, setSelectedGroup] = React.useState<string | null>(null);
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getUserGroups = trpc.user.getUserGroups.useQuery({ userId: whoAmI.data.id });
    const getUsers = trpc.user.getUsers.useQuery({ userId: null });
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
    constructGroupGraphData(getUserGroups.data[0], getUsers.data);
    return (<div className={css.group_wrapper}>
        <Row justify={'space-between'}>
            <Col span={10}>
                <Title level={2}>My Groups</Title>
            </Col>
            <Col>
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
            </Col>
        </Row>
        <Row>
            <RadialTreeGraph
                data={constructGroupGraphData(getUserGroups.data?.filter(el => el.id === selectedGroup)[0], getUsers.data)}
                nodeCfg={{
                    type: 'diamond'
                }}
                layout={{
                    type: 'compactBox',
                    direction: 'RL',
                    getId: function getId(d) {
                        return d.id;
                    },
                    getHeight: () => {
                        return 26;
                    },
                    getWidth: () => {
                        return 26;
                    },
                    getVGap: () => {
                        return 20;
                    },
                    getHGap: () => {
                        return 30;
                    },
                    radial: true
                }}
                height={1000}
                width={1500}
            />
        </Row>
    </div>);
};

function constructGroupGraphData(data, users) {
    if (!data) {
        return { id: 'NA', value: 'NA', children: [] };
    }
    const obj = {
        id: data.id,
        value: data.nameOrId,
        children: data.children.map(el => {
            const user = users.filter(ek => ek.id === el)[0];
            return {
                id: el,
                value: user ? `${user.firstname} ${user.lastname}` : 'NA',
                children: []
            };
        })
    };
    return obj;
}