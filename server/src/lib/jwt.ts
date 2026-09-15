import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuthError } from './errors.js';
import { env } from '../config/env.js';

// Minimal HS256 JWT verifier. Only verification is needed by this block
// (issuing tokens belongs to AUTH-02, not implemented here) — the access
// token's shape is fixed by design §8 / spec 02 §6.1.
export interface AccessTokenPayload {
  sub: string; // user id
  role: string;
  isActive: boolean;
  iat: number;
  exp: number;
  jti: string;
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(headerAndPayload: string, secret: string): string {
  return base64UrlEncode(createHmac('sha256', secret).update(headerAndPayload).digest());
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthError('Malformed access token.');
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  const signingInput = `${headerB64}.${payloadB64}`;

  const secrets = [env.JWT_ACCESS_SECRET, env.JWT_ACCESS_SECRET_PREVIOUS].filter(
    (s): s is string => Boolean(s),
  );
  const expectedSignature = signatureB64;
  const verified = secrets.some((secret) => {
    const candidate = sign(signingInput, secret);
    const a = Buffer.from(candidate);
    const b = Buffer.from(expectedSignature);
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!verified) {
    throw new AuthError('Invalid access token.');
  }

  let payload: AccessTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as AccessTokenPayload;
  } catch {
    throw new AuthError('Malformed access token.');
  }

  if (typeof payload.exp !== 'number' || Date.now() >= payload.exp * 1000) {
    throw new AuthError('Access token has expired.');
  }
  if (!payload.sub || !payload.role) {
    throw new AuthError('Malformed access token.');
  }
  return payload;
}
