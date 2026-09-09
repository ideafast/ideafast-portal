import { readFileSync } from 'fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Recreate __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Reading the SWC compilation config and remove the "exclude"
// for the test files to be compiled by SWC
const { exclude: _, ...swcJestConfig } = JSON.parse(
    readFileSync(`${__dirname}/.lib.swcrc`, 'utf-8')
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
