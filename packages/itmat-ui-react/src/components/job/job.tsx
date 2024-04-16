import { FunctionComponent, useState } from 'react';
// import { useQuery, useMutation, useApolloClient } from '@apollo/client/react/hooks';
// import { ProjectSection } from '../users/projectSection';
import { Button, DatePicker, Form, Input, InputNumber, List, Table, Tooltip, message } from 'antd';
import 'react-quill/dist/quill.snow.css';
import { trpc } from '../../utils/trpc';
import LoadSpinner from '../reusable/loadSpinner';
import css from './job.module.css';
import { convertMillisecondsToPeriod, formatInterval } from '../../utils/tools';
import Modal from 'antd/es/modal/Modal';
import dayjs from 'dayjs';

export const JobSection: FunctionComponent = () => {
    const getJobs = trpc.job.getJobs.useQuery({}, {
        refetchInterval: 60 * 1000
    });
    const getUsers = trpc.user.getUsers.useQuery({});
    const editJob = trpc.job.editJob.useMutation({
        onSuccess: () => {
            message.success('Job edited.');
        },
        onError: () => {
            message.error('Failed to edit this job.');
        }
    });
    const [isModelOn, setIsModalOn] = useState(false);
    const [form] = Form.useForm();
    if (getJobs.isLoading || getUsers.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }
    if (getJobs.isError || getUsers.isError) {
        return <>
            An error occured.
        </>;
    }
    const columns = [{
        title: 'Id',
        dataIndex: 'id',
        key: 'value',
        render: (id) => {
            return (
                <Tooltip title={id}>
                    <div style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100px', // Adjust this value based on your layout
                        cursor: 'pointer'
                    }}>
                        {id.length > 8 ? `${id.substring(0, 8)}...` : id}
                    </div>
                </Tooltip>
            );
        }
    }, {
        title: 'Name',
        dataIndex: 'name',
        key: 'name',
        render: (__unused__value, record) => {
            return record.name;
        }
    }, {
        title: 'Type',
        dataIndex: 'type',
        key: 'type',
        render: (__unused__value, record) => {
            return record.type;
        }
    }, {
        title: 'Priority',
        dataIndex: 'priority',
        key: 'priority',
        render: (__unused__value, record) => {
            return record.priority;
        }
    }, {
        title: 'Created At',
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (__unused__value, record) => {
            return (new Date(record.life.createdTime)).toLocaleString();
        }
    }, {
        title: 'Created By',
        dataIndex: 'createdBy',
        key: 'createdBy',
        render: (__unused__value, record) => {
            // const user = getUsers.data.filter(el => el === record.life?.createdUser)[0];
            const user = getUsers.data.find(el => el.id === record.life?.createdUser);
            return user ? `${user.firstname} ${user.lastname}` : 'NA';
        }
    }, {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (__unused__value, record) => {
            return (
                <span style={{
                    backgroundColor: JobStatusColor[record.status],
                    color: 'white',
                    padding: '2px 5px',
                    borderRadius: '4px'
                }}>
                    {record.status}
                </span>
            );
        }
    }, {
        title: 'Next execution',
        dataIndex: 'nextExecution',
        key: 'nextExecution',
        render: (__unused__value, record) => {
            return (new Date(record.nextExecutionTime)).toLocaleString();
        }
    }, {
        title: 'Period',
        dataIndex: 'period',
        key: 'period',
        render: (__unused__value, record) => {
            return formatInterval(record.period);
        }
    }, {
        title: 'History',
        dataIndex: 'history',
        key: 'history',
        render: (history, record) => {
            return history.length ? (
                <Tooltip
                    title={record.history.map((el, index) => <p key={index}><div>
                        <span>{`Last Time: ${(new Date(el.time).toLocaleString())}`}</span><br />
                        <span>{`Status: ${el.status}`}</span><br />
                    </div></p>)}
                    placement="top"
                >
                    <Button>Check</Button>
                </Tooltip>
            ) : null;
        }
    }, {
        title: 'Edit',
        dataIndex: 'edit',
        key: 'edit',
        render: (__unused__value, record) => {
            return <Button onClick={() => {
                setIsModalOn(true);
                console.log(record);
                form.setFieldsValue({
                    jobId: record.id,
                    priority: record.priority,
                    period: convertMillisecondsToPeriod(record.period),
                    nextExecutionTime: record.nextExecutionTime ? dayjs(record.nextExecutionTime) : undefined
                });
                console.log(form.getFieldsValue());
            }}>Edit</Button>;
        }
    }];

    return (<div className={css.page_container}>
        <List
            header={
                <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className={css['overview-header']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div className={css['overview-icon']}></div>
                            <div>My Jobs</div>
                        </div>
                    </div>
                </div>
            }
        >
            <List.Item>
                <Table
                    dataSource={getJobs.data}
                    columns={columns}
                />
                <Modal
                    open={isModelOn}
                    onCancel={() => {
                        setIsModalOn(false);
                        form.setFieldsValue({});
                    }}
                    onOk={() => {
                        const values: any = { ...form.getFieldsValue() };
                        values.nextExecutionTime = values.nextExecutionTime ? values.nextExecutionTime.valueOf() : null;
                        if (values.period.days || values.period.hours || values.period.minutes || values.period.seconds) {
                            const { days, hours, minutes, seconds } = values.period;
                            const totalMilliseconds =
                                (days * 24 * 60 * 60 * 1000) +
                                (hours * 60 * 60 * 1000) +
                                (minutes * 60 * 1000) +
                                (seconds * 1000);
                            values.period = totalMilliseconds === 0 ? null : totalMilliseconds;
                        } else {
                            values.period = null;
                        }
                        editJob.mutate({
                            jobId: values.jobId,
                            priority: values.priority,
                            period: values.period,
                            nextExecutionTime: values.nextExecutionTime
                        });
                    }}
                >
                    <Form form={form}>
                        <Form.Item
                            name="jobId"
                            label="Job Id"
                        >
                            <Input disabled={true} />
                        </Form.Item>
                        <Form.Item
                            name="priority"
                            label="Priority"
                            rules={[
                                {
                                    required: true,
                                    message: 'Please input the priority as a number',
                                    pattern: new RegExp(/^[0-9]+$/) // This regex checks for numeric characters
                                }
                            ]}
                        >
                            <Input placeholder="Enter priority" />
                        </Form.Item>

                        <Form.Item label="Period" required>
                            <Input.Group compact>
                                <Form.Item
                                    name={['period', 'days']}
                                    noStyle
                                    rules={[{ required: true, message: 'Days required' }]}
                                >
                                    <InputNumber min={0} placeholder="Days" style={{ width: '25%' }} />
                                </Form.Item>
                                <Form.Item
                                    name={['period', 'hours']}
                                    noStyle
                                    rules={[{ required: true, message: 'Hours required' }]}
                                >
                                    <InputNumber min={0} max={23} placeholder="Hours" style={{ width: '25%' }} />
                                </Form.Item>
                                <Form.Item
                                    name={['period', 'minutes']}
                                    noStyle
                                    rules={[{ required: true, message: 'Minutes required' }]}
                                >
                                    <InputNumber min={0} max={59} placeholder="Minutes" style={{ width: '25%' }} />
                                </Form.Item>
                                <Form.Item
                                    name={['period', 'seconds']}
                                    noStyle
                                    rules={[{ required: true, message: 'Seconds required' }]}
                                >
                                    <InputNumber min={0} max={59} placeholder="Seconds" style={{ width: '25%' }} />
                                </Form.Item>
                            </Input.Group>
                        </Form.Item>
                        <Form.Item
                            name="nextExecutionTime"
                            label="Next Execution Time"
                            rules={[
                                {
                                    required: false,
                                    message: 'Please select the next execution time'
                                }
                            ]}
                        >
                            <DatePicker
                                showTime={{ format: 'HH:mm:ss' }}
                                format="YYYY-MM-DD HH:mm:ss"
                                placeholder="Select time"
                            />
                        </Form.Item>
                    </Form>
                </Modal>
            </List.Item>
        </List>

    </div >);
};

export const JobStatusColor = {
    PENDING: '#007bff',
    CANCELLED: '#dc3545',
    FINISHED: '#28a745',
    INUSE: '#fd7e14'
};