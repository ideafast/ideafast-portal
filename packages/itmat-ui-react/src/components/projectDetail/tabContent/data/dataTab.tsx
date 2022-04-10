import { demographicsFields } from '../utils/defaultParameters';
import { filterFields } from '../utils/tools';
import * as React from 'react';
import { useQuery, useLazyQuery } from '@apollo/client/react/hooks';
import { GET_STUDY_FIELDS, GET_PROJECT, GET_DATA_RECORDS, IFieldEntry, IProject, enumValueType } from 'itmat-commons';
import { Query } from '@apollo/client/react/components';
// import { FieldListSectionWithFilter } from '../../../reusable/fieldList/fieldList';
import LoadSpinner from '../../../reusable/loadSpinner';
// import { DeleteOutlined } from '@ant-design/icons';
import { Subsection, SubsectionWithComment } from '../../../reusable/subsection/subsection';
import css from './tabContent.module.css';
import exportFromJSON from 'export-from-json';
import { CSVLink } from 'react-csv';
import { Pagination, Select, Statistic, Row, Col, Tooltip, Button, Table, Empty } from 'antd';
import { Pie, BidirectionalBar, Heatmap, Violin, Column } from '@ant-design/plots';
import { UserOutlined, ProfileOutlined, QuestionCircleTwoTone, DownloadOutlined, DoubleRightOutlined } from '@ant-design/icons';
const { Option } = Select;

const domains = {
    LB: 'Laboratory Test',
    FT: 'Function Test',
    VS: 'Vital Sign',
    QS: 'Questionnaires'
};

export const DataTabContent: React.FunctionComponent<{ studyId: string; projectId: string }> = ({ studyId, projectId }) => {
    const { loading: getStudyFieldsLoading, error: getStudyFieldsError, data: getStudyFieldsData } = useQuery(GET_STUDY_FIELDS, { variables: { studyId: studyId, projectId: projectId } });
    const { loading: getProjectLoading, error: getProjectError, data: getProjectData } = useQuery(GET_PROJECT, { variables: { projectId: projectId, admin: false } });

    if (getStudyFieldsLoading || getProjectLoading) {
        return <LoadSpinner />;
    }
    if (getStudyFieldsError || getProjectError) {
        return <div className={`${css.tab_page_wrapper} ${css.both_panel} ${css.upload_overlay}`}>
            A error occured, please contact your administrator
        </div>;
    }
    return <div className={css.tab_page_wrapper}>
        <div className={css.scaffold_wrapper}>
            <div style={{ gridArea: 'a' }}>
                <Subsection title='Demographics'>
                    <DemographicsBlock studyId={studyId} projectId={projectId} fields={filterFields(getStudyFieldsData.getStudyFields, ['DM'])} />
                </Subsection>
            </div>
            <div style={{ gridArea: 'b' }}>
                <Subsection title='Meta Data'>
                    <ProjectMetaDataBlock project={getProjectData.getProject} fields={getStudyFieldsData.getStudyFields} />
                </Subsection>
            </div>
            <div style={{ gridArea: 'c' }}>
                <FieldViewer fields={getStudyFieldsData.getStudyFields} />
            </div>
            <div style={{ gridArea: 'd' }}>
                <Subsection title='Data Completeness'>
                    <DataCompletenessBlock studyId={studyId} projectId={projectId} fields={filterFields(getStudyFieldsData.getStudyFields, ['LB', 'FT', 'VS', 'QS'])} />
                </Subsection>
            </div>
            <div style={{ gridArea: 'e' }}>
                <Subsection title='Data Distribution'>
                    <DataDetailsBlock studyId={studyId} projectId={projectId} project={getProjectData.getProject} fields={getStudyFieldsData.getStudyFields} />
                </Subsection>
            </div>
            <div style={{ gridArea: 'f' }}>
                <DataDownloadBlock project={getProjectData.getProject} />
            </div>
        </div>
    </div>;
};

export const DemographicsBlock: React.FunctionComponent<{ studyId: string, projectId: string, fields: IFieldEntry[] }> = ({ studyId, projectId, fields }) => {
    const { loading: getDataRecordsLoading, error: getDataRecordsError, data: getDataRecordsData } = useQuery(GET_DATA_RECORDS, { variables: { studyId: studyId,
        projectId: projectId,
        queryString: {
            format: 'grouped',
            data_requested: Object.values(demographicsFields),
            new_fields: [],
            cohort: [[]],
            subjects_requested: null,
            visits_requested: null
        }
    }});
    if (getDataRecordsLoading) {
        return <LoadSpinner />;
    }
    if (getDataRecordsError) {
        return <div className={`${css.tab_page_wrapper} ${css.both_panel} ${css.upload_overlay}`}>
            A error occured, please contact your administrator
        </div>;
    }
    // process the data
    const obj: any = {};
    const data = getDataRecordsData.getDataRecords.data;
    const genderField = fields.filter(el => el.fieldId === demographicsFields.genderID)[0];
    obj.SEX = genderField === undefined ? {} : data[demographicsFields.genderID][demographicsFields.visit].data.reduce((acc, curr) => {
        const thisGender = genderField?.possibleValues?.filter(el => el.code === curr)[0].description || '';
        if (acc.filter(es => es.type === thisGender).length === 0) {
            acc.push({ type: thisGender, value: 0 });
        }
        acc[acc.findIndex(es => es.type === thisGender)].value += 1;
        return acc;
    }, []);
    obj.SEX.push({
        type: 'Missing',
        value: data[demographicsFields.genderID][demographicsFields.visit].totalNumOfRecords - data[demographicsFields.genderID][demographicsFields.visit].valieNumOfRecords
    });
    const raceField = fields.filter(el => el.fieldId === demographicsFields.race)[0];
    if (data[demographicsFields.race] === undefined) {
        obj.RACE = [];
    } else {
        obj.RACE = genderField === undefined ? {} : data[demographicsFields.race][demographicsFields.visit].data.reduce((acc, curr) => {
            const thisRace = raceField?.possibleValues?.filter(el => el.code === curr)[0].description || '';
            if (acc.filter(es => es.type === thisRace).length === 0) {
                acc.push({ type: thisRace, value: 0 });
            }
            acc[acc.findIndex(es => es.type === thisRace)].value += 1;
            return acc;
        }, []);
        obj.RACE.push({
            type: 'Missing',
            value: data[demographicsFields.race][demographicsFields.visit].totalNumOfRecords - data[demographicsFields.race][demographicsFields.visit].valieNumOfRecords
        });
    }
    const siteField = fields.filter(el => el.fieldId === demographicsFields.genderID)[0];
    obj.SITE = siteField === undefined ? {} : data[demographicsFields.siteID][demographicsFields.visit].data.reduce((acc, curr) => {
        if (acc.filter(es => es.type === curr.toString()).length === 0) {
            acc.push({ type: curr.toString(), value: 0 });
        }
        acc[acc.findIndex(es => es.type === curr.toString())].value += 1;
        return acc;
    }, []);
    obj.SITE.push({
        type: 'Missing',
        value: data[demographicsFields.siteID][demographicsFields.visit].totalNumOfRecords - data[demographicsFields.siteID][demographicsFields.visit].validNumOfRecords
    });
    const ageField = fields.filter(el => el.fieldId === demographicsFields.age)[0];
    obj.AGE = ageField === undefined ? {} : data[demographicsFields.age][demographicsFields.visit].data.reduce((acc, curr, index) => {
        if (acc.filter(es => es.age === curr).length === 0) {
            acc.push({ age: curr, Male: 0, Female: 0 });
        }
        if (data[demographicsFields.genderID][demographicsFields.visit].data[index] === '1') {
            acc[acc.findIndex(el => el.age === curr)].Female += 1;
        } else {
            acc[acc.findIndex(el => el.age === curr)].Male += 1;
        }
        return acc;
    }, []);
    return (<>
        {
            genderField === undefined ? null :
                <div style={{ width: '25%', float: 'left' }}>
                    <Pie
                        data={obj.SEX}
                        autoFit={true}
                        angleField={'value'}
                        colorField={'type'}
                        legend={{
                            layout: 'horizontal',
                            position: 'bottom',
                            // offsetY: -80
                        }}
                        meta={{
                            count: { min: 0 }
                        }}
                        label={false}
                        radius={0.8}
                        interactions={[
                            {
                                type: 'element-active',
                            },
                        ]}
                    />
                    <h1 style={{textAlign: 'center'}} >Sex</h1>
                </div>
        }
        {
            raceField === undefined ? null :
                <div style={{ width: '25%', float: 'left' }}>
                    <Pie
                        data={obj.RACE}
                        angleField={'value'}
                        colorField={'type'}
                        legend={{
                            layout: 'horizontal',
                            position: 'bottom',
                            // offsetY: -80
                        }}
                        meta={{
                            count: { min: 0 }
                        }}
                        label={false}
                        radius={0.8}
                        interactions={[
                            {
                                type: 'element-active',
                            },
                        ]}
                    />
                    <h1 style={{textAlign: 'center'}} >Race</h1>
                </div>
        }
        {
            siteField === undefined ? null :
                <div style={{ width: '25%', float: 'left' }}>
                    <Pie
                        data={obj.SITE}
                        angleField={'value'}
                        colorField={'type'}
                        legend={{
                            layout: 'horizontal',
                            position: 'bottom',
                            // offsetY: -80
                        }}
                        label={false}
                        radius={0.8}
                        interactions={[
                            {
                                type: 'element-active',
                            },
                        ]}
                    />
                    <h1 style={{textAlign: 'center'}} >Site</h1>
                </div>
        }
        {
            ageField === undefined ? null :
                <div style={{ width: '25%', float: 'left' }}>
                    <BidirectionalBar
                        data={obj.AGE}
                        xField={'age'}
                        xAxis={{
                            position: 'bottom'
                        }}
                        interactions={[
                            { type: 'active-region' }
                        ]}
                        yField={['Male', 'Female']}
                        tooltip={{
                            shared: true,
                            showMarkers: false
                        }}
                    />
                    <h1 style={{textAlign: 'center'}} >Age</h1>
                </div>
        }
    </>);
};

export const FieldViewer: React.FunctionComponent<{ fields: IFieldEntry[] }> = ({ fields }) => {
    const [selectedField, setSelectedField] = React.useState<string | undefined>('3321');
    const field = fields.filter(el => el.fieldId === selectedField)[0];
    return (<SubsectionWithComment title='Field Viewer' comment={<>
        <Select
            value={selectedField}
            style={{ float: 'left' }}
            placeholder='Select Field'
            allowClear
            onSelect={(value: string) => { setSelectedField(value); }}
        >
            {
                fields.map(el => <Option value={el.fieldId}>{el.fieldId.concat('-').concat(el.fieldName)}</Option>)
            }
        </Select>
    </>}>
        {
            field === undefined ? null :
                <>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Statistic title='Field ID' value={field?.fieldId || 'NA'} />
                        </Col>
                        <Col span={12}>
                            <Statistic title='Field Name' value={field?.fieldName || 'NA'} />
                        </Col>
                    </Row><br/>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Statistic title='Data Type' value={field?.dataType || 'NA'} />
                        </Col>
                        <Col span={12}>
                            <Statistic title='Unit' value={field?.unit || 'NA'} />
                        </Col>
                    </Row><br/>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Statistic title='Comments' value={field?.comments || 'NA'} />
                        </Col>
                    </Row><br/>
                    <Row gutter={16}>
                        <Col span={24}>
                            <Statistic title='Ontology Chain' prefix={<>
                                {
                                    (field.ontologyPath === undefined || field.ontologyPath === null ) ? null :
                                        field.ontologyPath.slice(0, field.ontologyPath.length-1).map(el => {
                                            if (el.type === 'STRING') {
                                                return <span>{el.value} <DoubleRightOutlined /> </span>;
                                            } else if (el.type === 'FIELD') {
                                                const thisField = fields.filter(es => es.fieldId === el.value)[0];
                                                if (thisField === undefined) {
                                                    return null;
                                                } else {
                                                    return <Tooltip title={thisField.fieldId.concat('-').concat(thisField.fieldName)} >{el.value}</Tooltip>;
                                                }
                                            } else {
                                                return <></>;
                                            }
                                        })
                                }
                            </>} value={field.fieldName} />
                        </Col>
                    </Row><br/>
                </>
        }
    </SubsectionWithComment>);
};

export const DataCompletenessBlock: React.FunctionComponent<{ studyId: string, projectId: string, fields: IFieldEntry[] }> = ({ studyId, projectId, fields }) => {
    const dataCompletenessdPageSize = 20;
    const [selectedDomain, setSelectedDomain] = React.useState('QS');
    const [domainFieldsIndex, setDomainFieldsIndex] = React.useState({
        start: 0,
        end: dataCompletenessdPageSize
    });
    const domainFieldIds: string[] = fields.filter(el => el.stdRules !== undefined && el.stdRules !== null && el.stdRules[el.stdRules?.findIndex(es => es.name === 'DOMAIN')].parameter === selectedDomain).map(ek => ek.fieldId).sort((a, b) => {
        return parseFloat(a) - parseFloat(b);
    });
    const { loading: getDataRecordsLoading, error: getDataRecordsError, data: getDataRecordsData } = useQuery(GET_DATA_RECORDS, { variables: { studyId: studyId,
        projectId: projectId,
        queryString: {
            format: 'summary',
            data_requested: domainFieldIds,
            cohort: [[]],
            subjects_requested: null,
            visits_requested: null
        }
    }});
    if (getDataRecordsLoading) {
        return <LoadSpinner />;
    }
    if (getDataRecordsError) {
        return <div className={`${css.tab_page_wrapper} ${css.both_panel} ${css.upload_overlay}`}>
            A error occured, please contact your administrator
        </div>;
    }
    // process the data
    const data = getDataRecordsData.getDataRecords.data;
    const obj: any[] = [];
    const domainFields = filterFields(fields, [selectedDomain]);
    for (const fieldId of Object.keys(data)) {
        for (const visitId of Object.keys(data[fieldId])) {
            obj.push({
                visit: visitId,
                field: fieldId,
                percentage: parseInt(((data[fieldId][visitId].validNumOfRecords / data[fieldId][visitId].totalNumOfRecords) * 100).toFixed(0))
            });
        }
    }
    const axisConfig = {
        xAxis: {
            title: {
                text: 'Visit ID',
                style: {
                    fill: '#6E759F',
                    fontSize: 14
                },
            }
        },
        yAxis: {
            title: {
                text: 'Field ID',
                style: {
                    fill: '#6E759F',
                    fontSize: 14
                },
            }
        }
    };
    const tooltipConfig = {
        showTitle: false,
        fields: ['visit', 'field', 'percentage'],
        formatter: (datum: any) => {
            return {
                name: domainFields.filter(el => el.fieldId === datum.field)[0].fieldName
                    .concat('-')
                    .concat(datum.visit.toString()),
                value: datum.percentage + '%'
            };
        }
    };
    return (
        <>
            <Heatmap
                data={obj.filter(es => domainFieldIds.filter(el => {
                    return obj.map(es => es.field).indexOf(el) !== -1;
                }).slice(domainFieldsIndex.start, domainFieldsIndex.end).includes(es.field))}
                xField={'visit'}
                yField={'field'}
                colorField={'percentage'}
                label={{
                    style: {
                        fill: '#fff',
                        shadowBlur: 2,
                        shadowColor: 'rgba(0, 0, 0, .45)',
                    },
                }}
                legend={{
                    layout: 'vertical',
                    position: 'right',
                    offsetY: 5,
                    min: Math.min(...obj.map(el => el.percentage)),
                    max: 100,
                    reversed: false
                }}
                tooltip={tooltipConfig}
                xAxis={axisConfig.xAxis}
                yAxis={axisConfig.yAxis}
            />
            <Pagination
                style={{ float: 'right' }}
                defaultCurrent={1}
                defaultPageSize={1}
                onChange={(value) => {
                    setDomainFieldsIndex({
                        start: (value - 1) * dataCompletenessdPageSize,
                        end: value * dataCompletenessdPageSize
                    });
                }}
                total={Math.ceil(domainFieldIds.filter(el => {
                    return obj.map(es => es.field).indexOf(el) !== -1;
                }).length / dataCompletenessdPageSize)}
            />
            <Select
                value={selectedDomain}
                style={{ float: 'left' }}
                placeholder='Select Field'
                allowClear
                onSelect={(value: string) => { setSelectedDomain(value); }}
            >
                {
                    Object.keys(domains).map(el => <Option value={el}>{domains[el]}</Option>)
                }
            </Select>
        </>
    );
};

export const DataDetailsBlock: React.FunctionComponent<{ studyId: string, projectId, project: IProject, fields: IFieldEntry[] }> = ({ studyId, projectId, project, fields }) => {
    const [requestedFieldId, setRequestedFieldId] = React.useState<string>('1788');
    return (<>
        <Query<any, any> query={GET_DATA_RECORDS} variables={{
            studyId: studyId,
            projectId: projectId,
            queryString: {
                format: 'grouped',
                data_requested: [requestedFieldId],
                cohort: [[]],
                subjects_requested: null,
                visits_requested: null
            }
        }}>
            {({ data, loading, error }) => {
                if (loading) { return <LoadSpinner />; }
                if (error) { return <p>{JSON.stringify(error)}</p>; }
                if (!data) { return <p>Not executed.</p>; }
                const fieldIdFromData: string = Object.keys(data.getDataRecords.data)[0];
                // return empty if the field is empty, this means that no such data is in database
                if (fieldIdFromData === undefined) {
                    return <Empty description={'No Data Found'} />;
                }
                if ([enumValueType.INTEGER, enumValueType.DECIMAL].includes(fields.filter(el => el.fieldId === fieldIdFromData)[0].dataType)) {
                    data = Object.keys(data.getDataRecords.data[fieldIdFromData]).reduce((acc,curr) => {
                        data.getDataRecords.data[fieldIdFromData][curr].data.forEach(el => {
                            if (el === '99999') {
                                return;
                            }
                            acc.push({ x: curr, y: el });
                        });
                        return acc;
                    }, ([] as any));
                } else if ([enumValueType.CATEGORICAL, enumValueType.BOOLEAN].includes(fields.filter(el => el.fieldId === fieldIdFromData)[0].dataType)) {
                    data = Object.keys(data.getDataRecords.data[fieldIdFromData]).reduce((acc,curr) => {
                        let count = 0;
                        data.getDataRecords.data[fieldIdFromData][curr].data.forEach(el => {
                            if (acc.filter(es => (es.visit === curr && es.value === el)).length === 0) {
                                if (el === '99999') {
                                    return;
                                }
                                acc.push({ visit: curr, value: el, count: 0 });
                            }
                            count += 1;
                            acc[acc.findIndex(es => (es.visit === curr && es.value === el))].count += 1;
                        });
                        // if no mising (either no missing or missing is considered as an option)
                        if (project.summary.subjects.length - count !== 0) {
                            acc.push({ visit: curr, value: 'No Record', count: project.summary.subjects.length - count });
                        }
                        return acc;
                    }, ([] as any));
                } else {
                    return null;
                }
                return (<>
                    {
                        [enumValueType.INTEGER, enumValueType.DECIMAL].includes(fields.filter(el => el.fieldId === fieldIdFromData)[0].dataType) ?
                            <Violin
                                data={data}
                                xField={'x'}
                                yField={'y'}
                            />
                            :
                            <Column
                                data={data}
                                xField={'visit'}
                                yField={'count'}
                                seriesField={'value'}
                                isPercent={true}
                                isStack={true}
                                interactions={[
                                    { type: 'element-highlight-by-color' },
                                    { type: 'element-link' }
                                ]}
                            />
                    }
                </>);
            }}
        </Query>
        <br/>
        <Select
            value={requestedFieldId}
            style={{ float: 'left', width: '40%' }}
            placeholder='Select Field'
            allowClear
            onSelect={(value: string) => { setRequestedFieldId(value); }}
            showSearch
            filterOption={(input, option) =>
                option?.props?.children?.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }
        >
            {
                fields.filter(el => [enumValueType.DECIMAL, enumValueType.INTEGER, enumValueType.CATEGORICAL, enumValueType.BOOLEAN].includes(el.dataType))
                    .map(el => <Option value={el.fieldId}>{el.fieldId.concat('-').concat(el.fieldName)}</Option>)
            }
        </Select>
    </>);
};

export const ProjectMetaDataBlock: React.FunctionComponent<{ project: IProject, fields: IFieldEntry[] }> = ({ project, fields }) => {
    return (<>
        <div style={{ gridArea: 'e' }}>
            <Row gutter={16}>
                <Col span={12}>
                    <Statistic title='Participants' value={project.summary.subjects.length} prefix={<UserOutlined />} />
                </Col>
                <Col span={12}>
                    <Statistic title='Data Version' value={project.dataVersion?.version} />
                </Col>
            </Row><br/>
            <Row gutter={16}>
                <Col span={12}>
                    <Statistic title='Visits' value={project.summary.visits.length} prefix={<ProfileOutlined />} />
                </Col>
                <Col span={12}>
                    <Statistic title='Version Tag' value={project.dataVersion?.tag} />
                </Col>
            </Row><br/>
            <Row gutter={16}>
                <Col span={12}>
                    <Statistic title={<>
                        Fields
                        <Tooltip title={
                            fields.filter(el => (el.stdRules !== undefined && el.stdRules !== null)).length.toString().concat(' of ').concat(fields.length.toString())
                                .concat(' fields can be standardized')
                        }>
                            <QuestionCircleTwoTone />
                        </Tooltip>
                    </>} value={fields.filter(el => (el.stdRules !== undefined && el.stdRules !== null)).length} suffix={' / '.concat(fields.length.toString())} />
                </Col>
            </Row><br/>
            <Row gutter={16}>
                <Col span={24}>
                    <Statistic title='Updated At' value={ project.dataVersion?.updateDate === undefined ? 'NA' : (new Date(parseFloat(project.dataVersion?.updateDate))).toUTCString() } />
                </Col>
            </Row>
        </div>
    </>);
};

export const DataDownloadBlock: React.FunctionComponent<{ project: IProject }> = ({ project }) => {
    const [ getDataRecordsLazy, { loading: getDataRecordsLoading, data: getDataRecordsData }] = useLazyQuery(GET_DATA_RECORDS, {});
    const [ selectedDataFormat, setSelectedDataFormat ] = React.useState('standardized');
    if (getDataRecordsLoading) {
        return <LoadSpinner />;
    }
    // getDataRecordsLazy({
    //     variables: {
    //         projectId: projectId,
    //         queryString: {
    //             format: 'summary',
    //             data_requested: null,
    //             cohort: [[]],
    //             subjects_requested: null,
    //             visits_requested: null
    //         }
    //     }
    // });
    const dataArray: any[] = [];
    let data;
    if (getDataRecordsData !== undefined) {
        data = getDataRecordsData.getDataRecords.data;
        if (selectedDataFormat === 'standardized') {
            Object.keys(data).forEach(domain => {
                dataArray.push({
                    domain: domain,
                    data: data[domain]
                });
            });
        } else {
            dataArray.push({
                numOfSubjects: Object.keys(data).length
            });
        }
    }
    const downloadColumns = [
        {
            title: 'DOMAIN',
            dataIndex: 'domain',
            key: 'domain',
            render: (__unused__value, record) => {
                return record.domain;
            }
        },
        {
            title: 'Number of Records',
            dataIndex: 'numOfRecords',
            key: 'numOfRecords',
            render: (__unused__value, record) => {
                return record.data.length;
            }
        },
        {
            title: 'Link',
            dataIndex: 'download',
            key: 'download',
            render: (__unused__value, record) => {
                return (<CSVLink data={record.data} filename={record.domain.concat('.csv')} >
                    <DownloadOutlined />
                </CSVLink>);
            }
        },
    ];
    const downloadJsonColumns = [
        {
            title: 'Subjects',
            dataIndex: 'numOfSubjects',
            key: 'numOfSubjects',
            render: (__unused__value, record) => {
                return record.numOfSubjects;
            }
        },
        {
            title: 'Link',
            dataIndex: 'download',
            key: 'download',
            render: (__unused__value, __unused__record) => {
                const fileName = 'data.json';
                const exportType = exportFromJSON.types.json;
                return (<DownloadOutlined key='download' onClick={() => {
                    exportFromJSON({data, fileName, exportType});
                }}/>);
            }
        }
    ];
    return (<SubsectionWithComment title='Data Download' comment={<>
        <Select
            value={selectedDataFormat}
            style={{ float: 'left' }}
            placeholder='Select Format'
            allowClear
            onSelect={(value: string) => { setSelectedDataFormat(value); }}
        >
            <Option value={'standardized'}>Standardized</Option>
            <Option value={'raw'}>Raw</Option>
            <Option value={'grouped'}>Grouped</Option>
        </Select>
        <Button onClick={() => {
            getDataRecordsLazy({
                variables: {
                    studyId: project.studyId,
                    projectId: project.id,
                    queryString: {
                        format: selectedDataFormat
                    }
                }
            });
        }}>Fetch data</Button>
    </>}>
        {
            (selectedDataFormat === 'standardized' && getDataRecordsData !== undefined) ? <>
                <Table
                    scroll={{ x: 'max-content' }}
                    // rowKey={(rec) => rec.id}
                    pagination={false}
                    columns={downloadColumns}
                    dataSource={dataArray}
                    size='middle'
                ></Table>
            </> : <>
                <Table
                    scroll={{ x: 'max-content' }}
                    // rowKey={(rec) => rec.id}
                    pagination={false}
                    columns={downloadJsonColumns}
                    dataSource={dataArray}
                    size='middle'
                ></Table>
            </>
        }
    </SubsectionWithComment>);
};

