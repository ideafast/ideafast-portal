import LoadSpinner from '../reusable/loadSpinner';
import { List, Table } from 'antd';
import css from './dataset.module.css';
import React from 'react';
import 'react-quill/dist/quill.snow.css';
import { Link } from 'react-router-dom';
import { trpc } from '../../utils/trpc';
import generic from '../../assets/generic.png';
import { stringCompareFunc } from '../../utils/tools';

export const DatasetSection: React.FunctionComponent = () => {
    const getStudies = trpc.study.getStudies.useQuery({});

    if (getStudies.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }

    if (getStudies.isError) {
        return <>An error occurred.</>;
    }

    const columns: any[] = [{
        title: 'Dataset',
        dataIndex: 'name',
        key: 'name',
        width: '20%',
        ellipsis: true,
        sorter: (a, b) => { return stringCompareFunc(a.name, b.name); },
        render: (__unused__value, record) => {
            return (
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '15px' }}>
                    <img
                        src={record.profile ? `${window.location.origin}/file/${record.profile}` : generic}
                        alt={''}
                        style={{ width: '50px', height: '50px', marginRight: '10px' }} // Adjust the size as needed
                    />
                    {record.name}
                </div>
            );
        }
    }, {
        title: 'Descrition',
        dataIndex: 'description',
        key: 'description',
        width: '40%',
        ellipsis: true,
        render: (__unused__value, record) => {
            return <div>
                {record.description ?? ''}
            </div>;
        }
    }, {
        title: '',
        dataIndex: 'link',
        key: 'link',
        render: (__unused__value, record) => {
            return <Link to={`/datasets/${record.id}`}>Go to study</Link>;
        }
    }];

    return (
        <div className={css.page_container}>
            <List
                header={
                    <div className={css['overview-header']}>
                        <div className={css['overview-icon']}></div>
                        <div>List of Datasets</div>
                    </div>
                }
            >
                <List.Item>
                    <div>
                        <Table
                            columns={columns}
                            dataSource={getStudies.data}
                            pagination={
                                {
                                    defaultPageSize: 50,
                                    showSizeChanger: true,
                                    pageSizeOptions: ['10', '20', '50', '100'],
                                    defaultCurrent: 1,
                                    showQuickJumper: true
                                }
                            }
                        />
                    </div>
                </List.Item>
            </List><br />
        </div>
    );
};



