import { readFileSync } from 'fs';
import { resolve } from 'node:path';

// Reading the SWC compilation config and remove the "exclude"
// for the test files to be compiled by SWC
const { exclude: _, ...swcJestConfig } = JSON.parse(
    readFileSync(resolve(process.cwd(), 'packages/itmat-commons/.lib.swcrc'), 'utf-8')
);
export default {
    displayName: 'itmat-commons',
    preset: '../../jest.preset.cjs',
    transform: {
        '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
    },
    moduleFileExtensions: ['ts', 'js', 'html'],
    coverageDirectory: '../../coverage/packages/itmat-commons',
    testEnvironment: '<rootDir>/../../test/fixtures/_minioJestEnv',
    transformIgnorePatterns: [
        'node_modules',
        '\\.pnp\\.[^\\/]+$',
        'test[\\/]fixtures[\\/]_minio'
    ],
    moduleNameMapper: { '^uuid$': 'uuid' }
};
