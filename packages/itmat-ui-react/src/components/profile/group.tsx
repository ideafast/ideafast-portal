import { Col, Row, Typography } from 'antd';
import { FunctionComponent } from 'react';
import { trpc } from '../../utils/trpc';
import LoadSpinner from '../reusable/loadSpinner';
const { Title } = Typography;

export const MyGroup: FunctionComponent = () => {
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
    return (<div>
        <Row justify={'space-between'}>
            <Col span={10}>
                <Title level={2}>My Groups</Title>
            </Col>
        </Row>
    </div>);
};