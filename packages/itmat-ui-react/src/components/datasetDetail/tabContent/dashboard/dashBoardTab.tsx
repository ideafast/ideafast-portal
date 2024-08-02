import { FunctionComponent } from 'react';
import css from './tabContent.module.css';
import { trpc } from '../../../../utils/trpc';
import { Button, Calendar, CalendarProps, Card, Col, Divider, Form, Input, List, Row, Statistic, message } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { IDataSetSummary, IStudy } from '@itmat-broker/itmat-types';
import { Pie } from '@ant-design/plots';

export const DashboardTabContent: FunctionComponent<{ study: IStudy }> = ({ study }) => {
    const getStudyDataSummary = trpc.data.getStudyDataSummary.useQuery({ studyId: study.id, useCache: true });

    if (getStudyDataSummary.isLoading) {
        return <div className={css.tab_page_wrapper}>
            Loading...
        </div>;
    }
    if (getStudyDataSummary.isError) {
        return <div className={css.tab_page_wrapper}>
            An error occured.
        </div>;
    }

    return <div className={`${css.tab_page_wrapper} fade_in`}>
        <div className={css.page_container}>
            <List
                header={
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div className={css['overview-icon']}></div>
                                <div>Meta</div>
                            </div>
                        </div>
                        <div>
                        </div>
                    </div>
                }
            >
                <List.Item>
                    <MetaBlock study={study} dataSummary={getStudyDataSummary.data} />
                </List.Item>
            </List><br />
            <List
                header={
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div className={css['overview-icon']}></div>
                                <div>Data Versioning</div>
                            </div>
                        </div>
                        <div>
                        </div>
                    </div>
                }
            >
                <List.Item>
                    <DataVersionBlock study={study} dataSummary={getStudyDataSummary.data} />
                </List.Item>
            </List>
        </div>;
    </div>;
};

export const MetaBlock: FunctionComponent<{ study: IStudy, dataSummary: IDataSetSummary }> = ({ study, dataSummary }) => {
    const getStudyRoles = trpc.role.getStudyRoles.useQuery({ studyId: study.id });
    const getUsers = trpc.user.getUsers.useQuery({});

    if (getStudyRoles.isLoading || getUsers.isLoading) {
        return <div className={css.tab_page_wrapper}>
            Loading...
        </div>;
    }

    if (getStudyRoles.isError || getUsers.isError) {
        return <div className={css.tab_page_wrapper}>
            An error occured.
        </div>;
    }

    const totalUploaders = dataSummary.dataByUploaders.reduce((a, c) => a + c.count, 0);

    const dataByUploaders: { name: string, percentage: number }[] = [{
        name: 'Others',
        percentage: 0
    }];
    dataSummary.dataByUploaders.sort((a, b) => b.count - a.count).forEach((el, index) => {
        if (index < 10) {
            const user = getUsers.data.find(user => user.id === el.userId);
            dataByUploaders.push({
                name: user ? `${user.firstname} ${user.lastname}` : 'Unknown',
                percentage: el.count / totalUploaders
            });
        } else {
            dataByUploaders[0].percentage += el.count / totalUploaders;
        }
    });
    dataByUploaders.forEach(el => el.percentage = parseFloat((el.percentage * 100).toFixed(2)));

    const dataByUsers: { name: string, percentage: number }[] = [{
        name: 'Others',
        percentage: 0
    }];

    const totalUsers = dataSummary.dataByUsers.reduce((a, c) => a + c.count, 0);
    dataSummary.dataByUsers.sort((a, b) => b.count - a.count).forEach((el, index) => {
        if (index < 10) {
            const user = getUsers.data.find(user => user.id === el.userId);
            dataByUsers.push({
                name: user ? `${user.firstname} ${user.lastname}` : 'Unknown',
                percentage: el.count / totalUsers
            });
        } else {
            dataByUsers[0].percentage += el.count / totalUsers;
        }
    });
    dataByUsers.forEach(el => el.percentage = parseFloat((el.percentage * 100).toFixed(2)));


    return <div style={{ width: '100%' }}>
        <Row gutter={16}><br />
            <Col span={12}>
                <Card title='Description' bordered={false}>
                    <p>{study.description}</p>
                    <p>{`Created On ${(new Date(study.life.createdTime)).toLocaleDateString()}`}</p>
                </Card>
            </Col>
            <Col span={6}>
                <Card title='Users' bordered={false}>
                    <Statistic title='Users' value={Array.from(new Set(getStudyRoles.data.map(el => el.users).reduce((a, c) => {
                        a = a.concat(c);
                        return a;
                    }, []))).length} />
                </Card>
            </Col>
            <Col span={6}>
                <Card title='Roles' bordered={false}>
                    <Statistic title='Roles' value={getStudyRoles.data.length} />
                </Card>
            </Col>
        </Row><br />
        <Row gutter={16}><br />
            <Col span={12}>
                <Pie
                    data={dataByUploaders}
                    angleField={'percentage'}
                    colorField={'name'}
                    forceFit={true}
                    legend={false}
                    tooltip={{
                        title: 'name'
                    }}
                    radius={0.6}
                    innerRadius={0.3}
                    annotations={[{
                        type: 'text',
                        style: {
                            text: 'Producers',
                            x: '50%',
                            y: '50%',
                            textAlign: 'center',
                            fontSize: 20,
                            fontStyle: 'bold'
                        }
                    }]}
                    label={{
                        visible: true,
                        position: 'spider',
                        formatter: (text, item) => {
                            return item.name;
                        }
                    }}
                />
            </Col>
            <Col span={12}>
                <Pie
                    data={dataByUsers}
                    angleField={'percentage'}
                    colorField={'name'}
                    forceFit={true}
                    legend={false}
                    tooltip={{
                        title: 'name'
                    }}
                    radius={0.6}
                    innerRadius={0.3}
                    annotations={[{
                        type: 'text',
                        style: {
                            text: 'Consumers',
                            x: '50%',
                            y: '50%',
                            textAlign: 'center',
                            fontSize: 20,
                            fontStyle: 'bold'
                        }
                    }]}
                    label={{
                        visible: true,
                        position: 'spider',
                        formatter: (text, item) => {
                            return item.name;
                        }
                    }}
                />
            </Col>
        </Row><br />
    </div>;
};


export const DataVersionBlock: FunctionComponent<{ study: IStudy, dataSummary: IDataSetSummary }> = ({ study, dataSummary }) => {
    const [form] = Form.useForm();
    const createStudyDataVersion = trpc.study.createDataVersion.useMutation({
        onSuccess: () => {
            void message.success('Data version created successfully');
        },
        onError: () => {
            void message.error('Failed to create data version: ');
        }
    });
    const compareDates = (dayjsObj, unixTimestamp, checkDay) => {
        const unixDayjs = dayjs.unix(unixTimestamp / 1000);
        return dayjsObj.year() === unixDayjs.year() &&
            dayjsObj.month() === unixDayjs.month() &&
            (!checkDay || dayjsObj.date() === unixDayjs.date());
    };

    const cellRender: CalendarProps<Dayjs>['cellRender'] = (current, info) => {
        if (info.type === 'month') {
            const listData: { version: string, date: string }[] = [];
            for (let i = 0; i < study.dataVersions.length; i++) {
                const dataVersion = study.dataVersions[i];
                if (compareDates(current, dataVersion.life.createdTime, false)) {
                    listData.push({ version: dataVersion.version, date: (new Date(dataVersion.life.createdTime)).toLocaleDateString() });
                }
            }
            return (
                <ul className="events">
                    {listData.map((item) => (
                        <li key={item.version}>
                            <div style={{ backgroundColor: '#e0ffe0' }}>{`${item.version}    ${item.date}`}</div>
                        </li>
                    ))}
                </ul>
            );
        }
        return info.originNode;
    };

    return <div style={{ width: '100%' }}>
        <div style={{ width: '50%', float: 'left' }}>
            <Calendar cellRender={cellRender} mode='year' />
        </div>
        <div style={{ width: '45%', float: 'right' }}>
            <Divider>Data Summaries</Divider>
            <Row gutter={16}><br />
                <Col span={12}>
                    <Statistic title={<div style={{ backgroundColor: '#39F848' }}>Versioned Data</div>} value={dataSummary.numberOfVersionedRecords} />
                </Col>
                <Col span={12}>
                    <Statistic title={<div style={{ backgroundColor: '#39F848' }}>Versioned Fields</div>} value={dataSummary.numberOfVersionedFields} />
                </Col>
            </Row><br />
            <Row gutter={16}><br />
                <Col span={12}>
                    <Statistic title={<div style={{ backgroundColor: '#ff9b9b' }}>Unversioned Data</div>} value={dataSummary.numberOfUnversionedRecords} />
                </Col>
                <Col span={12}>
                    <Statistic title={<div style={{ backgroundColor: '#ff9b9b' }}>Unversioned Fields</div>} value={dataSummary.numberOfUnversionedFields} />
                </Col>
            </Row>
            <Divider>Create New Data Version</Divider>
            <Form
                form={form}
            >
                <Form.Item
                    name='dataVersion'
                    label='Data Version'
                    rules={[{ required: true, message: 'Please input the data version' }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name='tag'
                    label='Tag'
                    rules={[{ required: true, message: 'Please input the tag' }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item>
                    <Button type='primary' onClick={() => {
                        const values = form.getFieldsValue();
                        void createStudyDataVersion.mutate({
                            studyId: study.id,
                            dataVersion: values.dataVersion.toString(),
                            tag: values.tag.toString()
                        });
                    }}>Create Data Version</Button>
                </Form.Item>
            </Form>
        </div>
    </div >;
};