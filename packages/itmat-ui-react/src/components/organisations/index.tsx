import * as React from 'react';
import { OrganisationsList } from './organisations';
import css from './organisations.module.css';

export const OrganisationPage: React.FunctionComponent = () => {
    return (
        <div className={css.page_container}>
            <div className={css.user_list_section + ' page_section'}>
                <div className='page_ariane'>
                    Organisations
                </div>
                <div className='page_content'>
                    <OrganisationsList />
                </div>
            </div>
        </div>
    );
};
