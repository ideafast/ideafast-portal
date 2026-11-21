const importDependencies = async () => {
    const fetch = (await import('node-fetch')).default;
    const crossSpawn = (await import('cross-spawn')).default;
    const getPort = (await import('get-port')).default;
    const { v4: uuid } = await import('uuid');
    const chalk = (await import('chalk')).default;
    return { fetch, crossSpawn, getPort, uuid, chalk };
}
// Docker Hub no longer serves the upstream community image.
const MINIO_TEST_IMAGE = 'ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z@sha256:69b55a1c1c5dc285ce04db96689f5b2102317fc77a50680a1874ca6efd1c87f9';
const minioHelpers = {
    minioContainerSetup: async (container, port) => {
        const { chalk, crossSpawn, fetch, getPort, uuid } = await importDependencies();
        const _port = await getPort({ port });
        const _container = container ?? uuid();
        const image = MINIO_TEST_IMAGE;
        const cached = crossSpawn.sync('docker', ['image', 'inspect', image], { stdio: 'ignore' });
        if (cached.status !== 0) {
            const pull = crossSpawn.sync('docker', ['pull', image], { stdio: 'inherit' });
            if (pull.error || pull.status !== 0)
                throw pull.error ?? new Error(`Could not pull test image ${image}`);
        }

        console.log(`Bringing Container on port ${_port}...`);
        const start = crossSpawn.sync('docker', [
            'run', '--detach', '--rm',
            '--name', _container,
            '-p', `127.0.0.1:${_port}:9000`,
            image, 'server', '/data'
        ], { stdio: 'inherit' });
        if (start.error || start.status !== 0)
            throw start.error ?? new Error(`Could not start test container ${_container}`);

        try {
            for (let attempt = 0; attempt < 60; attempt++) {
                const ready = await fetch(`http://127.0.0.1:${_port}/minio/health/ready`, { timeout: 1000 })
                    .then(res => res.status === 200, () => false);
                if (ready) {
                    console.log(chalk.green('Docker Minio has started up.'));
                    return [_container, _port];
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            throw new Error(`MinIO test container ${_container} did not become ready`);
        } catch (error) {
            crossSpawn.sync('docker', ['stop', _container], { stdio: 'inherit' });
            throw error;
        }
    },
    minioContainerTeardown: (container) => {
        return new Promise(async (resolve, reject) => {
            const { chalk, crossSpawn, fetch, getPort, uuid } = await importDependencies();
            try {
                crossSpawn.sync('docker', ['stop', `${container}`], { stdio: 'inherit' });
                resolve();
            } catch (e) {
                console.error(e);
                reject(e);
            }
        });
    }
};

module.exports = minioHelpers;
