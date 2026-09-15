import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'server',
      root: './server',
      environment: 'node',
      setupFiles: ['./tests/env.setup.ts', './tests/setup.ts'],
      include: ['tests/**/*.test.ts'],
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  },
  {
    test: {
      name: 'root',
      root: '.',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  },
]);
