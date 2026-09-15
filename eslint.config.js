// @ts-check
import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Design §3: /shared imports neither client nor server; client and server
// never import each other. Enforced mechanically, not by convention.
const boundaryZones = [
  { target: './shared/**/*', from: ['./client/**/*', './server/**/*'] },
  { target: './client/**/*', from: ['./server/**/*'] },
  { target: './server/**/*', from: ['./client/**/*'] },
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: boundaryZones,
        },
      ],
    },
  },
  {
    files: ['shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'mongoose', message: '/shared must not depend on mongoose (D9).' },
            { name: 'express', message: '/shared must not depend on express (D9).' },
          ],
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  prettier,
);
