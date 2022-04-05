import 'antd/lib/switch/style/css';
import * as React from 'react';
import { useQuery, useMutation } from '@apollo/client/react/hooks';
import { GET_STUDY_FIELDS, EDIT_FIELD } from 'itmat-commons';
import { DeleteOutlined, EditOutlined, FrownTwoTone, SmileTwoTone, UpCircleOutlined, DownCircleOutlined } from '@ant-design/icons';
import LoadSpinner from '../../../reusable/loadSpinner';
import { Subsection, SubsectionWithComment } from '../../../reusable/subsection/subsection';
import css from './tabContent.module.css';
import { Button, Input, Modal, Table, Select, Timeline, notification, Row, Col, Statistic, Typography } from 'antd';
const { Option } = Select;

const fontSizes = {
    table: 24,
    innerTable: 20,
    ontology: 24
};

export const FieldManagementTabContentFetch: React.FunctionComponent<{ studyId: string }> = ({ studyId }) => {
    const { loading: getStudyFieldsLoading, error: getStudyFieldsError, data: getStudyFieldsData } = useQuery(GET_STUDY_FIELDS, { variables: { studyId: studyId } });
    const [editField, {
        loading: editFieldLoading,
        error: editFieldError
    }] = useMutation(EDIT_FIELD, {
        onCompleted: () => {
            notification.open({
                message: 'Success',
                description:
                  `Field ${selectedField.fieldId.toString()} has been updated.`,
                icon: <SmileTwoTone twoToneColor='#4BB543' />
            });
        },
        onError: () => {
            notification.open({
                message: 'Failed',
                description:
                  `Field ${selectedField.fieldId.toString()} failed to update.`,
                icon: <FrownTwoTone twoToneColor='#FC100D' />
            });
        }
    });
    const [isModalOn, setIsModalOn] = React.useState(false);
    const [selectedField, setSelectedField] = React.useState<any>({
        currentIndex: -1,
        currentOntologyIndex: -1,
        fieldId: '',
        stdRules: [],
        ontologyPath: [],
    });
    const [editMode, setEditMode] = React.useState(false);
    if (getStudyFieldsLoading || editFieldLoading) {
        return <LoadSpinner />;
    }
    if (getStudyFieldsError || editFieldError) {
        return <p>
            A error occured, please contact your administrator
        </p>;
    }
    const stdRuleColumns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (__unused__value, record, index) => {
                return editMode ? <Input style={{ fontSize: fontSizes.table }} defaultValue={record.name} onChange={(e) => {
                    const tmp: any = JSON.parse(JSON.stringify(selectedField));
                    tmp.stdRules[index].name = e.target.value;
                    setSelectedField(tmp);
                }} /> : <Typography.Text style={{ fontSize: fontSizes.table }}>
                    {record.name}
                </Typography.Text>;
            }
        },
        {
            title: 'Source',
            dataIndex: 'source',
            key: 'source',
            render: (__unused__value, record, index) => {
                return editMode ? <Select style={{ fontSize: fontSizes.table }} defaultValue={record.source} onChange={(value) => {
                    const tmp: any = JSON.parse(JSON.stringify(selectedField));
                    tmp.stdRules[index].source = value;
                    setSelectedField(tmp);
                }}>
                    <Option value='value' >Value</Option>
                    <Option value='data' >Data</Option>
                    <Option value='field' >Field</Option>
                    <Option value='inc' >Inc</Option>
                </Select>
                    : <Typography.Text style={{ fontSize: fontSizes.table }}>
                        {record.source}
                    </Typography.Text>;
            }
        },
        {
            title: 'Parameter',
            dataIndex: 'parameter',
            key: 'parameter',
            render: (__unused__value, record, index) => {
                return editMode ? <Input style={{ fontSize: fontSizes.table }} defaultValue={record.parameter} onChange={(e) => {
                    const tmp: any = JSON.parse(JSON.stringify(selectedField));
                    tmp.stdRules[index].parameter = e.target.value;
                    setSelectedField(tmp);
                }} /> : <Typography.Text style={{ fontSize: fontSizes.table }}>
                    {record.parameter}
                </Typography.Text>;
            }
        },
        {
            title: 'Dict',
            dataIndex: 'dict',
            key: 'dict',
            render: (__unused__value, record) => {
                return (<>
                    {
                        record.dict === null ? null :
                            <Table
                                rowKey={(rec) => rec.id}
                                columns={stdRulesDictColumns}
                                dataSource={record.dict}
                                size='small'
                                pagination={false}
                            >
                            </Table>
                    }
                    {
                        editMode ?
                            <Button type='link' onClick={() => {
                                const tmp: any = JSON.parse(JSON.stringify(selectedField));
                                if (tmp.stdRules[selectedField.currentIndex].dict === null) {
                                    tmp.stdRules[selectedField.currentIndex].dict = [
                                        {
                                            code: '',
                                            description: ''
                                        }
                                    ];
                                } else {
                                    tmp.stdRules[selectedField.currentIndex].dict.splice(tmp.stdRules[selectedField.currentIndex].dict.length, 0, {
                                        code: '',
                                        description: ''
                                    });
                                }
                                setSelectedField(tmp);
                            }}>
                        Add
                            </Button> : null
                    }
                </>);
            }
        },
        {
            title: 'Delete',
            dataIndex: 'delete',
            key: 'delete',
            render: (__unused__value, __unused__record, index) => {
                return editMode ? <DeleteOutlined key='delete' onClick={() => {
                    const tmp: any = JSON.parse(JSON.stringify(selectedField));
                    tmp.stdRules.splice(index, 1);
                    setSelectedField(tmp);
                }}/> : null;
            }
        }
    ];
    const stdRulesDictColumns = [
        {
            title: 'Code',
            dataIndex: 'code',
            key: 'code',
            render: (__unused__value, record, index) => {
                return editMode ? <Input style={{ fontSize: fontSizes.ontology }} defaultValue={record.code} onChange={(e) => {
                    const tmp: any = JSON.parse(JSON.stringify(selectedField));
                    tmp.stdRules[selectedField.currentIndex].dict[index].code = e.target.value;
                    setSelectedField(tmp);
                }} /> : <Typography.Text style={{ fontSize: fontSizes.innerTable }}>
                    {record.code}
                </Typography.Text>;
            }
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            render: (__unused__value, record, index) => {
                return editMode ? <Input style={{ fontSize: fontSizes.ontology }} defaultValue={record.description} onChange={(e) => {
                    const tmp: any = JSON.parse(JSON.stringify(selectedField));
                    tmp.stdRules[selectedField.currentIndex].dict[index].description = e.target.value;
                    setSelectedField(tmp);
                }} /> : <Typography.Text style={{ fontSize: fontSizes.innerTable }}>
                    {record.description}
                </Typography.Text>;
            }
        }
    ];
    if (editMode) {
        stdRulesDictColumns.push({
            title: 'Delete',
            dataIndex: 'delete',
            key: 'delete',
            render: (__unused__value, record, index) => {
                return editMode ? <DeleteOutlined key='delete' onClick={() => {
                    const tmp: any = JSON.parse(JSON.stringify(selectedField));
                    tmp.stdRules[selectedField.currentIndex].dict.splice(index, 1);
                    setSelectedField(tmp);
                }}/> : <></>;
            }
        });
    }
    return <div className={css.tab_page_wrapper}>
        <div className={css.field_management_section}>
            <div style={{ gridArea: 'b' }}>
                <Select
                    style={{ width: '50%' }}
                    placeholder='Select Field'
                    allowClear
                    onSelect={(value: string) => {
                        const searchedField = getStudyFieldsData.getStudyFields.filter(el => el.fieldId === value)[0] || { fieldId: '' };
                        const tmp: any = JSON.parse(JSON.stringify(selectedField));
                        setSelectedField({ ...tmp, ...convertDictToArray(searchedField)}); }
                    }
                    showSearch
                    filterOption={(input, option) =>
                        option?.props?.children?.toLowerCase().indexOf(input.toLowerCase()) >= 0
                    }
                >
                    {
                        getStudyFieldsData.getStudyFields.filter(el => (el.stdRules !== undefined && el.stdRules !== null)).map(el => <Option value={el.fieldId}>{el.fieldId.concat('-').concat(el.fieldName)}</Option>)
                    }
                </Select>
                <Button onClick={() => {
                    setEditMode(true);
                }}>Edit
                </Button>
                <Button onClick={() => {
                    setEditMode(false);
                }}>Cancel
                </Button><br/><br/>
            </div>
            <div style={{ gridArea: 'b' }}>
                <SubsectionWithComment title='Standardization Rules' comment={<Button onClick={() => {
                    const editedField = convertArrayToDict(selectedField);
                    editField({ variables: {
                        studyId: studyId,
                        fieldInput: {
                            fieldId: editedField.fieldId,
                            fieldName: editedField.fieldName,
                            tableName: editedField.tableName,
                            dataType: editedField.dataType,
                            possibleValues: editedField.possibleValues,
                            stdRules: editedField.stdRules,
                            ontologyPath: editedField.ontologyPath,
                            unit: editedField.unit,
                            comments: editedField.comments
                        }
                    }});
                }}>Submit
                </Button>}>
                    {
                        selectedField.fieldId !== undefined ?
                            <>
                                <Table
                                    rowKey={(rec) => rec.id}
                                    columns={stdRuleColumns}
                                    dataSource={selectedField?.stdRules || []}
                                    size='small'
                                    pagination={false}
                                    onRow={(__unused__record, rowIndex) => {
                                        return {
                                            onMouseEnter: () => {
                                                const tmp: any = JSON.parse(JSON.stringify(selectedField));
                                                tmp.currentIndex = rowIndex;
                                                setSelectedField(tmp);
                                            }
                                        };
                                    }}
                                >
                                </Table>
                                {
                                    editMode ?
                                        <Button onClick={() => {
                                            const tmp: any = JSON.parse(JSON.stringify(selectedField));
                                            tmp.stdRules.splice(tmp.stdRules.length, 0, {
                                                name: '',
                                                source: 'value',
                                                parameter: '',
                                                dict: null
                                            });
                                            setSelectedField(tmp);
                                        }}>
                                        Add
                                        </Button> : null
                                }
                            </>
                            :
                            null
                    }
                </SubsectionWithComment><br/>
            </div>
            <div style={{ gridArea: 'c' }}>
                <Subsection title='Ontology Path'>
                    {
                        (selectedField.fieldId !== undefined && selectedField?.ontologyPath.length !== 0) ?
                            <>
                                <Timeline>
                                    {
                                        selectedField.ontologyPath.map((el, index) => {
                                            return (<>
                                                <Timeline.Item>
                                                    <Typography.Text style={{ fontSize: fontSizes.ontology }}>
                                                        {
                                                            index !== selectedField.ontologyPath.length -1 ? el.value :
                                                                getStudyFieldsData.getStudyFields.filter(es => es.fieldId === el.value)[0].fieldName
                                                        }
                                                    </Typography.Text>
                                                    <Row gutter={16}  style={{ float: 'right' }}>
                                                        <Col span={6}>
                                                            <UpCircleOutlined onClick={() => {
                                                                const tmp: any = JSON.parse(JSON.stringify(selectedField));
                                                                tmp.ontologyPath.splice(index, 0, {
                                                                    type: 'STRING',
                                                                    value: ''
                                                                });
                                                                tmp.currentOntologyIndex = index;
                                                                setSelectedField(tmp);
                                                                setIsModalOn(true);
                                                            }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <DownCircleOutlined onClick={() => {
                                                                const tmp: any = JSON.parse(JSON.stringify(selectedField));
                                                                tmp.ontologyPath.splice(index + 1, 0, {
                                                                    type: 'STRING',
                                                                    value: ''
                                                                });
                                                                tmp.currentOntologyIndex = index + 1;
                                                                setSelectedField(tmp);
                                                                setIsModalOn(true);
                                                            }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <EditOutlined onClick={() => {
                                                                setIsModalOn(true);
                                                                const tmp: any = JSON.parse(JSON.stringify(selectedField));
                                                                tmp.currentOntologyIndex = index;
                                                                setSelectedField(tmp);
                                                            }}/>
                                                        </Col>
                                                        <Col span={6}>
                                                            <DeleteOutlined onClick={() => {
                                                                const tmp: any = JSON.parse(JSON.stringify(selectedField));
                                                                tmp.ontologyPath.splice(index, 1);
                                                                tmp.currentOntologyIndex = -1;
                                                                setSelectedField(tmp);
                                                            }} />
                                                        </Col>
                                                    </Row>
                                                </Timeline.Item>
                                            </>);
                                        })
                                    }
                                </Timeline>
                            </> :
                            null
                    }
                </Subsection>
                <Modal
                    width={'50%'}
                    visible={isModalOn}
                    onOk={() => {
                        setIsModalOn(false);
                        const tmp: any = JSON.parse(JSON.stringify(selectedField));
                        tmp.currentOntologyIndex = -1;
                        setSelectedField(tmp);
                    }}
                    onCancel={() => {
                        setIsModalOn(false);
                        const tmp: any = JSON.parse(JSON.stringify(selectedField));
                        tmp.currentOntologyIndex = -1;
                        setSelectedField(tmp);
                    }}
                >
                    <span>Ontology Node Type: </span>
                    <Select
                        value={selectedField.currentOntologyIndex === -1 ? '' : selectedField.ontologyPath[selectedField.currentOntologyIndex].type}
                        onChange={(value) => {
                            const tmp: any = JSON.parse(JSON.stringify(selectedField));
                            tmp.ontologyPath[selectedField.currentOntologyIndex].type = value;
                            setSelectedField(tmp);
                        }}
                    >
                        <Option value='STRING'>STRING</Option>
                        <Option value='FIELD'>FIELD</Option>
                    </Select><br/><br/>
                    <span>Ontology Node Value: </span>
                    <Input
                        style={{ width: '80%' }}
                        value={selectedField.currentOntologyIndex === -1 ? '' : selectedField.ontologyPath[selectedField.currentOntologyIndex].value}
                        onChange={(e) => {
                            const tmp: any = JSON.parse(JSON.stringify(selectedField));
                            tmp.ontologyPath[selectedField.currentOntologyIndex].value = e.target.value;
                            setSelectedField(tmp);
                        }}
                    ></Input>
                </Modal>
            </div>
            <div style={{ gridArea: 'd' }}>
                <Subsection title={'Other Info'}>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Statistic title='Field ID' value={selectedField?.fieldId || 'NA'} />
                        </Col>
                        <Col span={12}>
                            <Statistic title='Field Name' value={selectedField?.fieldName || 'NA'} />
                        </Col>
                    </Row><br/>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Statistic title='Data Type' value={selectedField?.dataType || 'NA'} />
                        </Col>
                        <Col span={12}>
                            <Statistic title='Unit' value={selectedField?.unit || 'NA'} />
                        </Col>
                    </Row><br/>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Statistic title='Comments' value={selectedField?.comments || 'NA'} />
                        </Col>
                    </Row><br/>
                </Subsection>
            </div>
        </div>
    </div>;
};

function convertDictToArray(field: any) {
    if (field === undefined) {
        return null;
    }
    const newField = JSON.parse(JSON.stringify(field));
    if (newField.stdRules !== undefined) {
        for (let i=0; i<newField.stdRules.length; i++) {
            if (newField.stdRules[i].dict !== null) {
                const newDict = Object.keys(newField.stdRules[i].dict).sort().reduce((acc,curr) => {
                    acc.push({
                        code: curr,
                        description: newField.stdRules[i].dict[curr]
                    });
                    return acc;
                }, ([] as any));
                newField.stdRules[i] = { ...newField.stdRules[i], dict: newDict };
            }
        }
    }
    return newField;
}

function convertArrayToDict(field: any) {
    if (field === undefined) {
        return null;
    }
    const newField: any = JSON.parse(JSON.stringify(field));
    if (newField.stdRules !== undefined) {
        for (let i=0; i<newField.stdRules.length; i++) {
            if (newField.stdRules[i].dict !== null) {
                if (newField.stdRules[i].dict.length === 0) {
                    newField.stdRules[i].dict = null;
                } else {
                    const newDict = newField.stdRules[i].dict.reduce((acc, curr) => {
                        acc[curr.code] = curr.description;
                        return acc;
                    }, {});
                    newField.stdRules[i].dict = newDict;
                }
            }
            delete newField.stdRules[i].id;
            delete newField.stdRules[i].__typename;
        }
    }
    if (newField.ontologyPath !== undefined) {
        for (let i=0; i<newField.ontologyPath.length; i++) {
            delete newField.ontologyPath[i].__typename;
            delete newField.ontologyPath[i].id;
        }
    }
    return newField;
}
