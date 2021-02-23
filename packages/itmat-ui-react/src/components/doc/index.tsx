import * as React from 'react';
import { DocListSection } from './docList';
import css from './docList.module.css';

export const DocPage: React.FunctionComponent = () => {
    return (
        <div className={css.page_container}>
            <div className={css.user_list_section + ' page_section'}>
                <div className='page_ariane'>
                    Documents
                </div>
                <div className='page_content'>
                    <DocListSection />
                </div>
            </div>
        </div>
    );
};
