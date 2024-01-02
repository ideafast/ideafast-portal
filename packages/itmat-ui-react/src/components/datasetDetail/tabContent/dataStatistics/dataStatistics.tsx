import React, { CSSProperties, FunctionComponent } from 'react';
import css from './dataStatistics.module.css';
import { Column, Pie } from '@ant-design/plots';
import LoadSpinner from '../../../reusable/loadSpinner';
import { trpc } from '../../../../utils/trpc';
import { Empty } from 'antd';

export const StatisticsTabContent: FunctionComponent<{ studyId: string }> = ({ studyId }) => {
    const getStudies = trpc.study.getStudies.useQuery({ studyId: studyId });

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

    const study = getStudies.data[0];

    return (
        <div className={css.page_container}>
            <div className={css.gridBlock}>
                {/* {
                    study.webLayout ?
                        study.webLayout.map(el => <BlockRendering studyId={studyId} blockConfig={el} />)
                        : null
                } */}
            </div>
        </div>
    );
};

export const BlockRendering: FunctionComponent<{ studyId: string, blockConfig: any }> = ({ studyId, blockConfig }) => {
    const [selectedField, setSelectedField] = React.useState<string | undefined>(undefined);

    const getData = trpc.data.getData.useQuery({ studyId: studyId, fieldIds: blockConfig.fieldIds.length === 1 ? blockConfig.fieldIds : [selectedField], aggregation: blockConfig.aggregation });
    if (getData.isLoading) {
        return <>
            <div className='page_ariane'>Loading...</div>
            <div className='page_content'>
                <LoadSpinner />
            </div>
        </>;
    }

    if (getData.isError) {
        return <>An error occurred.</>;
    }
    if (!getData.data) {
        return <Empty />;
    }
    if (blockConfig.graphType === 'Column') {
        console.log(getData.data);
    }
    if (blockConfig.graphType === 'Pie') {
        return <BasicPieChart
            data={getData.data}
            blockSize={blockConfig.blockSize}
            blockPos={blockConfig.blockPos}
            basicBlockSize={blockConfig.basicBlockSize}
            blockConfig={...blockConfig}
        />;
    }
    return null;
};


export const BasicBarChart: FunctionComponent<{
    data: any,
    blockSize: number[],
    blockPos: number[],
    basicBlockSize: number[],
    blockConfig: any
}> = ({ data, blockSize, blockPos, basicBlockSize, blockConfig }) => {
    const style = calculateStyle(blockSize, blockPos, basicBlockSize);
    const config = blockConfig.config;
    return (
        <div className={css.gridBlock} style={style}>
            <Column data={data} {...config} />
        </div>
    );
};

export const BasicPieChart: FunctionComponent<{
    data: any,
    blockSize: number[],
    blockPos: number[],
    basicBlockSize: number[],
    blockConfig: any
}> = ({ data, blockSize, blockPos, basicBlockSize, blockConfig }) => {
    const style = calculateStyle(blockSize, blockPos, basicBlockSize);
    const config = blockConfig.config;
    return (
        <div className={css.gridBlock} style={style}>
            <div style={{
                height: `${basicBlockSize[2]}px`, // This div is for the title
                lineHeight: `${basicBlockSize[2]}px`, // Center the title vertically
                textAlign: 'left', // Center the title horizontally
                fontWeight: 'bold'
            }}>
                {blockConfig.title}
            </div>
            <div style={{ height: `${blockSize[0] * basicBlockSize[0]}px` }}> {/* This div is for the Pie chart */}
                <Pie
                    data={data.data}
                    {...config}
                />
            </div>
            <div style={{
                height: `${basicBlockSize[2]}px`, // This div is for the title
                lineHeight: `${basicBlockSize[2]}px`, // Center the title vertically
                textAlign: 'center' // Center the title horizontally
                // fontWeight: 'bold'
            }}>
                {blockConfig.config.title}
            </div>
        </div>
    );
};

export function calculateStyle(blockSize: number[], blockPos: number[], basicBlockSize: number[]): CSSProperties {
    const width = blockSize[1] * basicBlockSize[1];
    const graphHeight = blockSize[0] * basicBlockSize[0];
    const titleHeight = basicBlockSize[2]; // This is the new z axis for title height
    const totalHeight = graphHeight + titleHeight; // Combine graph height and title height
    const top = (blockPos[0] - 1) * basicBlockSize[0] + (blockPos[0] - 1) * basicBlockSize[2];
    const left = (blockPos[1] - 1) * basicBlockSize[1];

    return {
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        height: `${totalHeight}px`, // Use the total height for the container
        position: 'absolute'
    };
}
