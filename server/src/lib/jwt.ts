import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AuthError } from './errors.js';
import { env } from '../config/env.js';

// Lifetimes fixed here, per design §8 / spec 03 §4.3 — 15 min access,
// 30 days refresh. Not sourced from env: the two blocking questions in spec
// 03 (OQ-A5 mobile clients, secret-rotation env vars) are unresolved, and
// `env.ts` (INF-01, merged) does not declare `ACCESS_TOKEN_TTL`/
// `REFRESH_TOKEN_TTL` — adding them is out of this block's scope.
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const ISSUER = 'rango';
const AUDIENCE = 'rango-web';

export interface AccessTokenPayload {
  sub: string; // user id
  role: string;
  isActive: boolean;
  sid?: string; // Session._id — spec 03 §4.4, ties the token to a revocable session
  typ?: string;
  iat: number;
  exp: number;
  jti: string;
  iss?: string;
  aud?: string;
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  typ: 'refresh';
  iat: number;
  exp: number;
  jti: string;
  iss: string;
  aud: string;
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(headerAndPayload: string, secret: string): string {
  return base64UrlEncode(createHmac('sha256', secret).update(headerAndPayload).digest());
}

function encodeToken(payload: object, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  return `${signingInput}.${sign(signingInput, secret)}`;
}

// Shared decode-and-verify core for both token types. Algorithm is pinned to
// HS256 by construction (the `alg` header is never read back out) — spec 03
// §4.4.
function decodeAndVerify<T extends { exp: number }>(token: string, secrets: readonly string[], errorLabel: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthError(`Malformed ${errorLabel} token.`);
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  const signingInput = `${headerB64}.${payloadB64}`;

  const verified = secrets.some((secret) => {
    const candidate = sign(signingInput, secret);
    const a = Buffer.from(candidate);
    const b = Buffer.from(signatureB64);
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!verified) {
    throw new AuthError(`Invalid ${errorLabel} token.`);
  }

  let payload: T;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as T;
  } catch {
    throw new AuthError(`Malformed ${errorLabel} token.`);
  }

  if (typeof payload.exp !== 'number' || Date.now() >= payload.exp * 1000) {
    throw new AuthError(`${errorLabel[0]!.toUpperCase()}${errorLabel.slice(1)} token has expired.`);
  }
  return payload;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secrets = [env.JWT_ACCESS_SECRET, env.JWT_ACCESS_SECRET_PREVIOUS].filter(
    (s): s is string => Boolean(s),
  );
  const payload = decodeAndVerify<AccessTokenPayload>(token, secrets, 'access');
  if (!payload.sub || !payload.role) {
    throw new AuthError('Malformed access token.');
  }
  return payload;
}

export interface IssueAccessTokenInput {
  sub: string;
  sid: string;
  role: string;
  isActive: boolean;
}

export function signAccessToken(input: IssueAccessTokenInput): { token: string; expiresAt: Date } {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + ACCESS_TOKEN_TTL_SECONDS;
  const payload: AccessTokenPayload = {
    sub: input.sub,
    sid: input.sid,
    role: input.role,
    isActive: input.isActive,
    typ: 'access',
    iat: nowSeconds,
    exp,
    jti: randomUUID(),
    iss: ISSUER,
    aud: AUDIENCE,
  };
  return { token: encodeToken(payload, env.JWT_ACCESS_SECRET), expiresAt: new Date(exp * 1000) };
}

// Refresh tokens are verified against JWT_REFRESH_SECRET only — a token
// signed with the access secret (or vice versa) fails verification here,
// which is what makes the `typ` separation in spec 03 §4.4 an actual
// enforcement rather than a convention.
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = decodeAndVerify<RefreshTokenPayload>(token, [env.JWT_REFRESH_SECRET], 'refresh');
  if (payload.typ !== 'refresh' || !payload.sub || !payload.sid) {
    throw new AuthError('Malformed refresh token.');
  }
  return payload;
}

export function signRefreshToken(input: { sub: string; sid: string }): { token: string; expiresAt: Date } {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + REFRESH_TOKEN_TTL_SECONDS;
  const payload: RefreshTokenPayload = {
    sub: input.sub,
    sid: input.sid,
    typ: 'refresh',
    iat: nowSeconds,
    exp,
    jti: randomUUID(),
    iss: ISSUER,
    aud: AUDIENCE,
  };
  return { token: encodeToken(payload, env.JWT_REFRESH_SECRET), expiresAt: new Date(exp * 1000) };
}
