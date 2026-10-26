// @ts-check
import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importX from 'eslint-plugin-import-x';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const LAYERS = {
  domain: './src/**/domain/**',
  application: './src/**/application/**',
  infrastructure: './src/**/infrastructure/**',
  presentation: './src/**/presentation/**',
  generated: './src/generated/**',
};

// Regex instead of gitignore globs: 'prisma/*' would also match './infrastructure/prisma/...'.
const PRISMA_IMPORTS = String.raw`^(?:@prisma/|prisma(?:/|$))|/generated/prisma(?:/|$)`;
const FRAMEWORK_IMPORTS = String.raw`^(?:@nestjs/|class-validator$|class-transformer$|express$)`;
const PRISMA_MESSAGE = 'Prisma solo se usa en la capa infrastructure.';

/** @param {string} regex @param {string} message */
const restrictImports = (regex, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ regex, message }] }],
});

export default defineConfig(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/generated/**'],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-console': 'error',
      'no-warning-comments': [
        'error',
        { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'anywhere' },
      ],
      eqeqeq: ['error', 'always'],
      'import-x/no-cycle': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-duplicates': 'error',
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'no-public' }],
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: LAYERS.domain,
              from: [
                LAYERS.application,
                LAYERS.infrastructure,
                LAYERS.presentation,
                LAYERS.generated,
              ],
              message: 'domain no depende de application, infrastructure ni presentation.',
            },
            {
              target: LAYERS.application,
              from: [LAYERS.infrastructure, LAYERS.presentation, LAYERS.generated],
              message: 'application no depende de infrastructure ni presentation.',
            },
            {
              target: LAYERS.presentation,
              from: [LAYERS.infrastructure, LAYERS.generated],
              message: 'presentation no depende de infrastructure.',
            },
            {
              target: LAYERS.infrastructure,
              from: [LAYERS.presentation],
              message: 'infrastructure no depende de presentation.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/infrastructure/**'],
    rules: restrictImports(PRISMA_IMPORTS, PRISMA_MESSAGE),
  },
  {
    files: ['src/**/domain/**/*.ts'],
    rules: restrictImports(
      `${FRAMEWORK_IMPORTS}|${PRISMA_IMPORTS}`,
      'domain es TypeScript puro: sin framework ni ORM.',
    ),
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettierConfig,
);
