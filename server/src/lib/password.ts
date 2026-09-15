import argon2 from 'argon2';

// Parameters fixed in exactly one place (AUTH-06) — spec 03 §6.1. The stored
// hash is the full PHC string, which carries these parameters with it.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP PHC minimum for argon2id at t=2
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// A fixed dummy hash so an unknown-email login still performs one
// argon2.verify() call, keeping its timing comparable to a real credential
// check (spec 03 §6.2) — skipping it turns login into an account-enumeration
// oracle. Computed lazily and cached rather than at import time, so pulling
// in this module never pays the ~100ms argon2 cost unless a login actually
// happens.
let dummyHashPromise: Promise<string> | undefined;

export function getDummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash('dummy-password-for-timing-uniformity', ARGON2_OPTIONS);
  return dummyHashPromise;
}
