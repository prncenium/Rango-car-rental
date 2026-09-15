import { describe, expect, it } from 'vitest';
import { getDummyPasswordHash, hashPassword, verifyPassword } from '../../src/lib/password.js';

describe('password hashing (AUTH-06)', () => {
  it('round-trips: a hash verifies against its own password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
  });

  it('produces a different hash each time for the same input (unique salt)', async () => {
    const [a, b] = await Promise.all([hashPassword('same password same password'), hashPassword('same password same password')]);
    expect(a).not.toBe(b);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'wrong password entirely')).toBe(false);
  });

  it('exposes a stable dummy hash usable for timing-uniform verification', async () => {
    const dummy = await getDummyPasswordHash();
    expect(dummy).toContain('$argon2id$');
    expect(await verifyPassword(dummy, 'anything')).toBe(false);
  });
});
