import React from 'react';
import { Mutation, Query } from '@apollo/client/react/components';
import { NavLink } from 'react-router-dom';
import { CREATE_DATA_CURATION_JOB, GET_STUDY, IFile } from 'itmat-commons';
import LoadSpinner from '../../../reusable/loadSpinner';
import { Select, Button } from 'antd';
const { Option } = Select;

export const UploadNewData: React.FunctionComponent<{ studyId: string; fieldTreeId: string; cancelButton: (__unused__shown: boolean) => void }> = ({ studyId, fieldTreeId, cancelButton }) => {
    return <div>
        <p>To upload a new version of the dataset, please make sure you have <NavLink to={`/datasets/${studyId}/files`}><span style={{ color: 'var(--color-primary-color)', textDecoration: 'underline' }}>uploaded the data file to the file repository</span></NavLink>.</p>
        <br /><br />

        <Query<any, any> query={GET_STUDY} variables={{ studyId }}>
            {({ loading, data, error }) => {
                if (loading) { return <LoadSpinner />; }
                if (error) { return <p>{error.toString()}</p>; }
                if (!data.getStudy || data.getStudy.files === undefined || data.getStudy.files.length === 0) {
                    return null;
                }
                return <UploadNewDataForm cancelButton={cancelButton} studyId={studyId} fieldTreeId={fieldTreeId} files={data.getStudy.files} />;
            }}
        </Query>

    </div>;
};

const UploadNewDataForm: React.FunctionComponent<{ studyId: string; fieldTreeId: string; files: IFile[]; cancelButton: (__unused__shown: boolean) => void }> = ({ cancelButton, files, fieldTreeId, studyId }) => {
    const [error, setError] = React.useState('');
    const [successfullySaved, setSuccessfullySaved] = React.useState(false);
    const [selectedFile, setSelectedFile] = React.useState<string[]>([]); // files.length > 0 because of checks above

    return <>
        <span>Data file:</span>
        <Select
            mode='multiple'
            onChange={(value) => {
                const newArr: string[] = [];
                for (let i=0; i<(value as any).length; i++) {
                    newArr.push(value[i].toString());
                }
                setSelectedFile(newArr);
                setError('');
            }}
            style={{width: '80%'}}
            placeholder='Select files'
        >
            {files.map((el: IFile) => {
                return <Option value={el.id}>{el.fileName}</Option>;
            })}
        </Select><br/><br/>

        <Mutation<any, any>
            mutation={CREATE_DATA_CURATION_JOB}
            onCompleted={() => setSuccessfullySaved(true)}
            // update={(store, { data: { createDataCurationJob } }) => {
            //     // Read the data from our cache for this query.
            //     const data: any = store.readQuery({ query: GET_STUDY, variables: { studyId } });
            //     // Add our comment from the mutation to the end.
            //     const newjobs = data.getStudy.jobs.concat(createDataCurationJob);
            //     data.getStudy.jobs = newjobs;
            //     // Write our data back to the cache.
            //     store.writeQuery({ query: GET_STUDY, variables: { studyId }, data });
            // }}
        >
            {(createCurationJob, { loading, error }) => {
                if (loading) { return <button style={{ width: '45%', display: 'inline-block' }}>Loading..</button>; }
                if (error) { console.log(error); return <button style={{ width: '45%', display: 'inline-block' }}>{JSON.stringify(error)}</button>; }
                return <Button style={{ width: '45%', display: 'inline-block' }} onClick={() => {
                    if (!selectedFile) {
                        setError('Please select a file.');
                        setSuccessfullySaved(false);
                        return;
                    }
                    createCurationJob({
                        variables: {
                            file: selectedFile,
                            studyId,
                            fieldTreeId: fieldTreeId
                        }
                    });

                }}>Submit</Button>;
            }}
        </Mutation>
        <Button style={{ width: '45%', display: 'inline-block' }} className='button_grey' onClick={() => cancelButton(false)}>Cancel</Button>
        {error ? <div className='error_banner'>{error}</div> : null}
        {successfullySaved ? <div className='saved_banner'>Job created and queued.</div> : null}
    </>;

};

// const CreateNewDataVersion: React.FunctionComponent<{ studyId: string; dataVersion: string; tag: string }> = ({ studyId, dataVersion, tag }) => {

// };
