import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// Running ESLint's own `ESLint` class inside Vitest is unreliable: Vitest's
// module loader (vite-node) intercepts the dynamic `import()` ESLint's flat
// config loader uses internally, and the resulting instance silently linted
// with no rules at all. Shelling out to the real `eslint` binary — exactly
// what `npm run lint` does — sidesteps that entirely.

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const fixtureDir = path.join(rootDir, 'shared', 'src', '__boundary_fixture__');
// Invoke the real eslint.js script with `node` directly (rather than the
// .bin/eslint(.cmd) shim) so a space in the repo path can't break argument
// parsing through a Windows shell.
const eslintScript = path.join(rootDir, 'node_modules', 'eslint', 'bin', 'eslint.js');

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

function lintFixture(fileName: string, content: string): { ruleIds: string[]; errorCount: number } {
  mkdirSync(fixtureDir, { recursive: true });
  const filePath = path.join(fixtureDir, fileName);
  writeFileSync(filePath, content, 'utf8');

  try {
    execFileSync(process.execPath, [eslintScript, filePath, '--format', 'json'], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    return { ruleIds: [], errorCount: 0 };
  } catch (err) {
    const { stdout } = err as { stdout: string };
    const [result] = JSON.parse(stdout) as Array<{ messages: Array<{ ruleId: string | null }>; errorCount: number }>;
    return {
      ruleIds: (result?.messages ?? []).map((m) => m.ruleId).filter((id): id is string => id !== null),
      errorCount: result?.errorCount ?? 0,
    };
  }
}

describe('dependency-boundary lint rule (P-03)', () => {
  it('rejects a /shared file that imports from /server', () => {
    const { ruleIds } = lintFixture(
      'badServerImport.ts',
      "import { app } from '../../../server/src/app';\nexport { app };\n",
    );
    expect(ruleIds).toContain('import/no-restricted-paths');
  });

  it('rejects a /shared file that imports mongoose', () => {
    const { ruleIds } = lintFixture('badMongoose.ts', "import mongoose from 'mongoose';\nexport { mongoose };\n");
    expect(ruleIds).toContain('no-restricted-imports');
  });

  it('does not flag an ordinary /shared file with no cross-boundary import', () => {
    const { errorCount } = lintFixture('ok.ts', 'export const x = 1;\n');
    expect(errorCount).toBe(0);
  });
});
