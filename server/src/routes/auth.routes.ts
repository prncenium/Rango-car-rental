import { Router, type Response } from 'express';
import { loginDto, redeemPasswordResetDto, registerDto } from '@rango/shared';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthError } from '../lib/errors.js';
import {
  getUserSummary,
  login,
  logout,
  redeemPasswordReset,
  refresh,
  register,
  type AuthTokens,
} from '../services/auth.service.js';

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

// rgo_csrf must be readable by client JS (document.cookie) from any page in
// the SPA, not just paths under /api — a cookie scoped to Path=/api is
// invisible to document.cookie on e.g. /account/listings/1/edit, which
// silently breaks the double-submit CSRF header on every write. The
// httpOnly session cookies stay scoped to /api since only the server ever
// needs them, and only on /api requests.
function csrfCookieOptions() {
  return { ...baseCookieOptions(), path: '/', httpOnly: false };
}

function setAuthCookies(res: Response, tokens: AuthTokens): void {
  res.cookie('rgo_at', tokens.accessToken, { ...baseCookieOptions(), httpOnly: true, maxAge: ACCESS_TOKEN_MAX_AGE_MS });
  res.cookie('rgo_rt', tokens.refreshToken, { ...baseCookieOptions(), httpOnly: true, maxAge: REFRESH_TOKEN_MAX_AGE_MS });
  res.cookie('rgo_csrf', tokens.csrfToken, csrfCookieOptions());
}

// Re-issuing with Max-Age=0 and the identical attribute set is what actually
// clears a cookie (spec 03 §9.6) — a mismatched attribute silently fails to.
function clearAuthCookies(res: Response): void {
  res.clearCookie('rgo_at', { ...baseCookieOptions(), httpOnly: true });
  res.clearCookie('rgo_rt', { ...baseCookieOptions(), httpOnly: true });
  res.clearCookie('rgo_csrf', csrfCookieOptions());
}

router.post('/register', async (req, res, next) => {
  try {
    const body = registerDto.parse(req.body);
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
    const body = loginDto.parse(req.body);
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

// spec 03 §7 E-75 — public redemption of an admin-issued reset token
// (E-66, not yet implemented). No cookie is used and the token in the body
// is itself the credential, so this is CSRF-exempt (§8.4) and requires no
// auth. No session is established on success — the client logs in next,
// consistent with E-01 (spec 02 OQ-21).
router.post('/password/reset', async (req, res, next) => {
  try {
    const body = redeemPasswordResetDto.parse(req.body);
    await redeemPasswordReset(body);
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
