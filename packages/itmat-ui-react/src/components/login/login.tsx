import { FunctionComponent, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import css from './login.module.css';
import { Input, Form, Button } from 'antd';
import LoadSpinner from '../reusable/loadSpinner';
import { IConfig, ISystemConfig, enumConfigType } from '@itmat-broker/itmat-types';
import 'react-quill/dist/quill.snow.css'; // for Snow theme
import { GithubOutlined } from '@ant-design/icons';
import { trpc } from '../../utils/trpc';
import logo from '../../assets/logo.png';
import dsi from '../../assets/datascienceinstitute.png';
import mainPageImage from '../../assets/mainPageImage.png';
export const LoginBox: FunctionComponent = () => {
    const getSystemConfig = trpc.config.getConfig.useQuery({ configType: enumConfigType.SYSTEMCONFIG, key: null, useDefault: true });
    const getSubPath = trpc.tool.getCurrentSubPath.useQuery();
    const getDomains = trpc.domain.getDomains.useQuery({ domainPath: getSubPath.data }, {
        enabled: !!getSubPath.data
    });
    const login = trpc.user.login.useMutation({
        onSuccess: () => {
            window.location.reload();
        }
    });
    if (getSystemConfig.isLoading || getSubPath.isLoading || getDomains.isLoading) {
        return <LoadSpinner />;
    }
    if (getSystemConfig.isError || getSubPath.isError || getDomains.isError) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }

    if (!getSystemConfig.data || getDomains.data.length === 0) {
        return <p>
            An error occured, please contact your administrator
        </p>;
    }
    const systemConfig = (getSystemConfig.data as IConfig).properties as ISystemConfig;
    const domainProfile = getDomains.data[0] ? (getDomains.data[0].logo ?? '') : null;
    return (
        <div className={css.login_wrapper}>
            <div className={css.login_left}>
                <img
                    src={domainProfile ? `${window.location.origin}/file/${domainProfile}` : mainPageImage}
                    alt=''
                />
            </div>
            <div className={css.login_right}>
                <ParticleEffect />
                <div className={css.login_logo}>
                    <a href={systemConfig.logoLink ?? '/'}>
                        <img
                            src={dsi}
                            alt="Main Logo"
                            height={systemConfig.logoSize[1]}
                            width={'45px'}
                        />
                    </a>
                </div>
                <div className={css.login_logo} style={{ right: (parseInt(systemConfig.logoSize[1].replace(/\D/g, '')) * 1 + 10) + 'px' }}>
                    <a href={systemConfig.logoLink ?? '/'}>
                        <img
                            src={logo}
                            alt="Main Logo"
                            height={systemConfig.logoSize[1]}
                            width={systemConfig.logoSize[0]}
                        />
                    </a>
                </div>
                <div className={css.login_logo} style={{ right: (parseInt(systemConfig.logoSize[1].replace(/\D/g, '')) * 2 + 20) + 'px' }}>
                    <a href={systemConfig.archiveAddress} target="_blank" rel="noopener noreferrer">
                        <GithubOutlined style={{ fontSize: systemConfig.logoSize[1] }} />
                    </a>
                </div>
                <div className={css.login_author}>
                    Designed by Data Science Institute
                </div>
                <div className={css.login_box}>
                    <div className={css.hello_text}>
                        Hello again.
                    </div>
                    <Form onFinish={(variables) => login.mutate({ ...variables, requestexpirydate: false })}>
                        <Form.Item name='username' hasFeedback rules={[{ required: true, message: ' ' }]}>
                            <Input className={css.login_box_input} placeholder='Username' />
                        </Form.Item>
                        <Form.Item name='password' hasFeedback rules={[{ required: true, message: ' ' }]}>
                            <Input.Password className={css.login_box_input} placeholder='Password' />
                        </Form.Item>
                        <Form.Item name='totp' hasFeedback rules={[{ required: true, len: 6, message: ' ' }]}>
                            <Input.Password className={css.login_box_input} placeholder='One-Time Passcode' />
                        </Form.Item>
                        <Button className={css.login_box_input} type='primary' disabled={false} loading={false} htmlType='submit'>
                            Login
                        </Button><br /><br />
                        <NavLink className={css.navlink} to='/reset'>Forgot password</NavLink><br /><br />
                        <NavLink className={css.navlink} to='/register'>Please register</NavLink><br />
                    </Form>
                </div>
            </div>
        </div >
    );
};

const ParticleEffect: React.FunctionComponent = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas!.getContext('2d')!;
        canvas!.width = canvas!.offsetWidth;
        canvas!.height = canvas!.offsetHeight;

        let particles: Particle[] = [];
        const numberOfParticles = 100;
        const mouse = {
            x: null as null | number,
            y: null as null | number,
            radius: 100
        };

        class Particle {
            public x: number;
            public y: number;
            public size: number;
            private speedX: number;
            private speedY: number;
            private speedFactor: number;

            constructor() {
                this.x = Math.random() * canvas!.width;
                this.y = Math.random() * canvas!.height;
                this.speedFactor = 0.5;
                this.size = this.speedFactor * (Math.random() * 3 + 1);
                this.speedX = this.speedFactor * (Math.random() * 2 - 1);
                this.speedY = this.speedFactor * (Math.random() * 2 - 1);
            }

            update() {
                if (this.x > canvas!.width || this.x < 0) {
                    this.speedX = -this.speedX;
                }
                if (this.y > canvas!.height || this.y < 0) {
                    this.speedY = -this.speedY;
                }
                this.x += this.speedX;
                this.y += this.speedY;

                if (mouse.x !== null && mouse.y !== null) {
                    const dx = mouse.x - this.x;
                    const dy = mouse.y - this.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < mouse.radius) {
                        this.speedX = -this.speedX;
                        this.speedY = -this.speedY;
                    }
                }
            }

            draw() {
                ctx.fillStyle = '#333333';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const handleMouseMove = (event: MouseEvent) => {
            mouse.x = event.x - canvas!.getBoundingClientRect().left;
            mouse.y = event.y - canvas!.getBoundingClientRect().top;
        };

        const init = () => {
            particles = [];
            for (let i = 0; i < numberOfParticles; i++) {
                particles.push(new Particle());
            }
        };

        const connectParticles = () => {
            for (let a = 0; a < particles.length; a++) {
                for (let b = a; b < particles.length; b++) {
                    const distance = ((particles[a].x - particles[b].x) ** 2) + ((particles[a].y - particles[b].y) ** 2);
                    if (distance < (canvas!.width / 7) * (canvas!.height / 7)) {
                        ctx.strokeStyle = `rgba(51, 51, 51, ${1 - distance / 20000})`; // Dark gray color for lines
                        ctx.beginPath();
                        ctx.lineWidth = 1;
                        ctx.moveTo(particles[a].x, particles[a].y);
                        ctx.lineTo(particles[b].x, particles[b].y);
                        ctx.stroke();
                    }
                }
            }
        };

        const animate = () => {
            ctx.clearRect(0, 0, canvas!.width, canvas!.height);
            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();
            }
            connectParticles();
            requestAnimationFrame(animate);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('resize', () => {
            canvas!.width = canvas!.offsetWidth;
            canvas!.height = canvas!.offsetHeight;
        });

        init();
        animate();

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    return <canvas ref={canvasRef} className={css.particleCanvas}></canvas>;
};
