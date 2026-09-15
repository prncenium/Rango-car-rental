import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '4000',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/rango?replicaSet=rs0',
  CLIENT_ORIGIN: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
} satisfies NodeJS.ProcessEnv;

describe('env config (INF-01)', () => {
  it('accepts a fully valid environment', () => {
    const result = parseEnv(validEnv);
    expect(result.success).toBe(true);
  });

  it('rejects a missing required var', () => {
    const { MONGODB_URI: _omit, ...rest } = validEnv;
    const result = parseEnv(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a malformed PORT', () => {
    const result = parseEnv({ ...validEnv, PORT: 'not-a-number' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed CLIENT_ORIGIN', () => {
    const result = parseEnv({ ...validEnv, CLIENT_ORIGIN: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects a JWT secret shorter than 32 bytes', () => {
    const result = parseEnv({ ...validEnv, JWT_ACCESS_SECRET: 'too-short' });
    expect(result.success).toBe(false);
  });

  it('rejects access and refresh secrets that are equal', () => {
    const result = parseEnv({ ...validEnv, JWT_REFRESH_SECRET: validEnv.JWT_ACCESS_SECRET });
    expect(result.success).toBe(false);
  });

  it('rejects the committed .env.example placeholder secrets', () => {
    const result = parseEnv({
      ...validEnv,
      JWT_ACCESS_SECRET: 'replace-this-with-a-random-value-of-at-least-32-bytes',
      JWT_REFRESH_SECRET: 'replace-this-with-a-different-random-value-32-bytes-min',
    });
    expect(result.success).toBe(false);
  });

  it('accepts an optional JWT_ACCESS_SECRET_PREVIOUS', () => {
    const result = parseEnv({ ...validEnv, JWT_ACCESS_SECRET_PREVIOUS: 'c'.repeat(32) });
    expect(result.success).toBe(true);
  });
});
