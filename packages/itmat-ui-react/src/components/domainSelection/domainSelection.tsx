import { FunctionComponent } from 'react';
import css from './domainSelection.module.css';
import mainPageImage from '../../assets/mainPageImage.png';
import LoadSpinner from '../reusable/loadSpinner';
import { trpc } from '../../utils/trpc';
import { Card, Col, Row, Image } from 'antd';
import { useNavigate } from 'react-router-dom';
export const DomainSelectionBox: FunctionComponent = () => {
    const getDomains = trpc.domain.getDomains.useQuery({});
    const navigate = useNavigate();
    if (getDomains.isLoading) {
        return <LoadSpinner />;
    }
    if (getDomains.isError) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }
    const handleClick = (domain) => {
        navigate(`/${domain.domainPath}`, { state: { endpoint: domain.domainPath } });
        setTimeout(() => {
            // Refresh the page
            window.location.reload();
        }, 0);
    };
    return (
        <div className={css.wrapper}>
            <div className={css.left}>
                <img src={mainPageImage} alt='' />
            </div>
            <div className={css.right}>
                <Row gutter={[16, 24]} justify="center"> {/* Increased vertical gutter */}
                    {getDomains.data.filter(el => el.domainPath !== 'main').map((domain, index) => (
                        <Col key={index} xs={24} sm={12} md={8} style={{ display: 'flex', justifyContent: 'center' }}>
                            <Card
                                title={<div className={css.cardHead}>{domain.name}</div>}
                                bordered={false}
                                className={css.card} // Apply the card styles
                            >
                                <div onClick={() => handleClick(domain)} style={{ cursor: 'pointer' }} className={css.cardImageContainer}>
                                    <Image
                                        style={{ maxHeight: '150px', maxWidth: '100%', display: 'block', margin: 'auto' }}
                                        src={domain.logo ? `${window.location.origin}/file/${domain.logo}` : undefined}
                                        preview={false}
                                    />
                                </div>
                            </Card>
                        </Col>
                    ))}
                </Row>
            </div>
        </div>
    );
};

