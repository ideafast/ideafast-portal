import { FunctionComponent } from 'react';
import { NavLink, Route, Routes, useParams } from 'react-router-dom';
import LoadSpinner from '../reusable/loadSpinner';
import css from './projectPage.module.css';
import { enumUserTypes } from '@itmat-broker/itmat-types';
import { FileRepositoryTabContent } from './tabContent';
import { DashboardTabContent } from './tabContent/dashboard/dashboardTab';
import { StatisticsTabContent } from './tabContent/dataStatistics/dataStatistics';
import { trpc } from '../../utils/trpc';

export const DatasetDetailPage: FunctionComponent = () => {
    const { studyId } = useParams();
    const whoAmI = trpc.user.whoAmI.useQuery();
    const getStudies = trpc.study.getStudies.useQuery({ studyId: studyId });
    if (getStudies.isLoading || whoAmI.isLoading) {
        return <LoadSpinner />;
    }
    if (getStudies.isError || whoAmI.isError) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }

    if (!studyId || !getStudies.data[0])
        return <LoadSpinner />;
    return <div className={css.page_container}>
        <div className={css.ariane}>
            <h2>{getStudies.data[0].name.toUpperCase()}</h2>
            <div className={css.tabs}>
                {
                    whoAmI.data.type === enumUserTypes.ADMIN ?
                        <>
                            <NavLink to='dashboard' className={({ isActive }) => isActive ? css.active : undefined}>DASHBOARD</NavLink>
                            {/* <NavLink to='field_management' className={({ isActive }) => isActive ? css.active : undefined}>DATA STANDARDIZATION</NavLink> */}
                            <NavLink to='data_management' className={({ isActive }) => isActive ? css.active : undefined}>DATA MANAGEMENT</NavLink>
                            <NavLink to='data_statistics' className={({ isActive }) => isActive ? css.active : undefined}>DATA STATISTICS</NavLink>
                            <NavLink to='files' className={({ isActive }) => isActive ? css.active : undefined}>FILES REPOSITORY</NavLink>
                            <NavLink to='admin' className={({ isActive }) => isActive ? css.active : undefined}>ADMINISTRATION</NavLink>
                            {/* <NavLink to='projects' className={({ isActive }) => isActive ? css.active : undefined}>PROJECTS</NavLink> */}
                        </>
                        :
                        <>
                            <NavLink to={'files'} className={({ isActive }) => isActive ? css.active : undefined}>FILES REPOSITORY</NavLink>
                            <NavLink to={'data_management'} className={({ isActive }) => isActive ? css.active : undefined}>DATA MANAGEMENT</NavLink>
                            <NavLink to='projects' className={({ isActive }) => isActive ? css.active : undefined}>PROJECTS</NavLink>
                        </>
                }
            </div >
        </div >
        <div className={css.content}>
            <Routes>
                <Route path='dashboard' element={<DashboardTabContent studyId={studyId} />} />
                {/* <Route path='field_management' element={<FieldManagementTabContentFetch studyId={studyId} />} /> */}
                {/* <Route path='data_management' element={<DataManagementTabContentFetch />} /> */}
                <Route path='data_STATISTICS' element={<StatisticsTabContent studyId={studyId} />} />
                <Route path='files' element={<FileRepositoryTabContent studyId={studyId} />} />
                {/* <Route path='projects/*' element={<ProjectsTabContent projectList={data.getStudy.projects} />} /> */}
                {/* <Route path='admin' element={<AdminTabContent />} /> */}
                {/* <Route path='*' element={<Navigate to='dashboard' />} /> */}
            </Routes>
        </div >
    </div >;

};
