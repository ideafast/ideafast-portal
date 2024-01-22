import { FunctionComponent } from 'react';
import { Route, Routes } from 'react-router-dom';
import { DatasetDetailPage } from '../datasetDetail';
import { DatasetPage } from '../dataset';
// import { ProjectDetailPage } from '../projectDetail';
// import { ProjectListPage } from '../projectList';
import { UserPage } from '../users';
// import { LogPage } from '../log';
// import { MyFilePage } from '../files';
import { ProfilePage } from '../profile';
import { OrganisationPage } from '../organisations';
import css from './scaffold.module.css';
import { LogPage } from '../logs';
import { DocumentPage } from '../documents';
import { JobPage } from '../job';
import { DrivePage } from '../drive';


export const MainPanel: FunctionComponent = () => {
    return (
        <div className={css.main_panel}>
            <Routes>
                <Route path='/datasets/:studyId/*' element={<DatasetDetailPage />} />
                <Route path='/datasets' element={<DatasetPage />} />
                <Route path='/users' element={<UserPage />} />
                {/* <Route path='/users/:userId' element={<UserPage />} /> */}
                <Route path='/logs' element={<LogPage />} />
                <Route path='/profile' element={<ProfilePage />} />
                <Route path='/drive' element={<DrivePage />} />
                <Route path='/documents' element={<DocumentPage />} />
                <Route path='/organisations' element={<OrganisationPage />} />
                <Route path='/jobs' element={<JobPage />} />
                {/* <Route path='/myfiles' element={<MyFilePage />} /> */}
                {/* <Route path='/pun/sys/dashboard' /> */}
                {/* <Route path='*' element={<Navigate to='/datasets' />} /> */}
            </Routes>
        </div>
    );
};
