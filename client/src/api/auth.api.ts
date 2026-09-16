import type { LoginDto, RedeemPasswordResetDto, RegisterDto } from '@rango/shared';
import { apiFetch } from '../lib/apiClient';

// Matches server/src/services/auth.service.ts's register()/login() response
// shape — the abbreviated identity returned at E-01/E-02, not the full
// UserSummary (that is GET /api/auth/me, E-05).
export interface AuthIdentity {
  id: string;
  email: string;
  role: string;
}

export function register(input: RegisterDto): Promise<AuthIdentity> {
  return apiFetch<AuthIdentity>('/auth/register', { method: 'POST', body: input });
}

export function login(input: LoginDto): Promise<AuthIdentity> {
  return apiFetch<AuthIdentity>('/auth/login', { method: 'POST', body: input });
}

export function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
}

export function redeemPasswordReset(input: RedeemPasswordResetDto): Promise<void> {
  return apiFetch<void>('/auth/password/reset', { method: 'POST', body: input });
}

// GET /api/auth/me (E-05) — matches server UserSummary.
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  drivingLicence: { numberMasked: string; expiryDate?: string };
  createdAt: string;
  flags: { isOwner: boolean; isSuperAdmin: boolean };
}

export function getCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/auth/me');
}
