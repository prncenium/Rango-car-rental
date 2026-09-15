import { Router, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthError } from '../lib/errors.js';
import { getUserSummary, login, logout, refresh, register, type AuthTokens } from '../services/auth.service.js';

const router = Router();

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// spec 03 §4.1/§4.2 — httpOnly cookies, Path=/api, Secure in production,
// SameSite=Lax. rgo_csrf is the one exception: JS-readable by design and
// session-length (no Max-Age).
function baseCookieOptions() {
  return {
    path: '/api',
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
  };
}

function setAuthCookies(res: Response, tokens: AuthTokens): void {
  res.cookie('rgo_at', tokens.accessToken, { ...baseCookieOptions(), httpOnly: true, maxAge: ACCESS_TOKEN_MAX_AGE_MS });
  res.cookie('rgo_rt', tokens.refreshToken, { ...baseCookieOptions(), httpOnly: true, maxAge: REFRESH_TOKEN_MAX_AGE_MS });
  res.cookie('rgo_csrf', tokens.csrfToken, { ...baseCookieOptions(), httpOnly: false });
}

// Re-issuing with Max-Age=0 and the identical attribute set is what actually
// clears a cookie (spec 03 §9.6) — a mismatched attribute silently fails to.
function clearAuthCookies(res: Response): void {
  res.clearCookie('rgo_at', { ...baseCookieOptions(), httpOnly: true });
  res.clearCookie('rgo_rt', { ...baseCookieOptions(), httpOnly: true });
  res.clearCookie('rgo_csrf', { ...baseCookieOptions(), httpOnly: false });
}

// D10/AUTHZ-4 — no role, isActive, or status field is ever accepted from the
// body; z.strictObject rejects any unrecognised key as 400, never silently
// stripping it.
const registerBody = z.strictObject({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(1).max(20),
  password: z.string().min(12).max(128),
  drivingLicenceNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(8)
    .max(20)
    .regex(/^[A-Z0-9- ]+$/, 'Driving licence number must contain only letters, digits, hyphens, and spaces.'),
  drivingLicenceExpiryDate: z.coerce.date().optional(),
});

const loginBody = z.strictObject({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

router.post('/register', async (req, res, next) => {
  try {
    const body = registerBody.parse(req.body);
    const { user, tokens } = await register(body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setAuthCookies(res, tokens);
    res.status(201).json({ data: { id: user._id, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const body = loginBody.parse(req.body);
    const { user, tokens } = await login(body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setAuthCookies(res, tokens);
    res.status(200).json({ data: { id: user._id, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.rgo_rt as string | undefined;
    if (!rawRefreshToken) {
      throw new AuthError('Refresh token required.');
    }
    const { tokens } = await refresh(rawRefreshToken, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setAuthCookies(res, tokens);
    res.status(200).json({ data: { ok: true } });
  } catch (err) {
    // spec 03 §4.5 step 3 — reuse (and any other invalid-refresh case) clears
    // all three cookies so the client is forced back to a clean re-login.
    if (err instanceof AuthError) {
      clearAuthCookies(res);
    }
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.rgo_rt as string | undefined;
    await logout(rawRefreshToken);
    clearAuthCookies(res);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const summary = await getUserSummary(req.actor!);
    res.status(200).json({ data: summary });
  } catch (err) {
    next(err);
  }
});

export { router as authRoutes };
