const jsonRules = {
    indent: [
        'error',
        4,
        {
            SwitchCase: 1,
            ignoredNodes: ['VariableDeclaration[declarations.length=0]']
        }
    ]
};

const javascriptRules = {
    ...jsonRules,
    '@nx/enforce-module-boundaries': [
        'error',
        {
            enforceBuildableLibDependency: true,
            allow: [],
            depConstraints: [
                {
                    sourceTag: '*',
                    onlyDependOnLibsWithTags: ['*']
                }
            ]
        }
    ],
    'quotes': ['error', 'single'],
    'quote-props': ['error', 'consistent-as-needed'],
    'comma-dangle': ['error', 'never'],
    'no-trailing-spaces': 'error',
    'no-extra-semi': 'error',
    'no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^__unused',
        caughtErrorsIgnorePattern: '^__unused',
        destructuredArrayIgnorePattern: '^__unused',
        varsIgnorePattern: '^__unused',
        ignoreRestSiblings: true
    }],
    'semi': ['error', 'always'],
    'react-hooks/purity': 'off',
    'react-hooks/set-state-in-effect': 'off',
    'react/style-prop-object': 'off'
};

const typescriptRules = {
    ...javascriptRules,
    'no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/no-unused-vars': [
        'error',
        {
            args: 'after-used',
            argsIgnorePattern: '^__unused',
            caughtErrorsIgnorePattern: '^__unused',
            destructuredArrayIgnorePattern: '^__unused',
            varsIgnorePattern: '^__unused',
            ignoreRestSiblings: true
        }
    ],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/promise-function-async': 'error',
    '@typescript-eslint/no-misused-promises': 'error'
};

module.exports = {
    root: true,
    env: { es6: true },
    parserOptions: {
        ecmaVersion: 2022,
        tsconfigRootDir: __dirname,
        projectService: true,
        allowDefaultProject: true,
        warnOnUnsupportedTypeScriptVersion: false
    },
    ignorePatterns: ['**/*', '!**/*.json', '!**/*.js', '!**/*.ts', '!scripts', '!tools', '!.vscode'],
    plugins: ['@nx'],
    overrides: [
        {
            files: ['*.ts', '*.tsx', '*.mts'],
            extends: ['plugin:@nx/typescript'],
            rules: typescriptRules
        },
        {
            files: ['*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx'],
            extends: ['plugin:@nx/typescript'],
            rules: {
                ...typescriptRules,
                '@typescript-eslint/no-explicit-any': 'warn'
            }
        },
        {
            files: ['*.js', '*.jsx'],
            extends: ['plugin:@nx/javascript'],
            rules: javascriptRules
        },
        {
            files: ['*.mjs'],
            extends: ['plugin:@nx/javascript'],
            rules: javascriptRules,
            parserOptions: {
                sourceType: 'module'
            }
        },
        {
            files: ['*.json'],
            parser: 'jsonc-eslint-parser',
            extends: ['plugin:jsonc/recommended-with-json'],
            rules: jsonRules
        }
    ]
};
