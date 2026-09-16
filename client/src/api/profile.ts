import { apiFetch } from '../lib/apiClient';

// GET/PATCH /api/user/profile (E-25/E-26). Unlike GET /api/auth/me's
// UserSummary (drivingLicence.numberMasked), user.profile.routes.ts's
// getProfile() returns the raw User document as-is — the full,
// server-normalized (uppercased) licence number, since this is the user
// reading their own record. There is no drivingLicenceNumber key in
// updateProfileBody (server/src/routes/user.profile.routes.ts) — only
// `name`/`phone` are writable here; the licence number has no edit path
// yet despite spec 05 §3.8 sketching one, so it renders read-only below.
export interface ProfileUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  drivingLicence: {
    number: string;
    expiryDate?: string;
    enteredAt: string;
    updatedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
}

export function getProfile(): Promise<ProfileUser> {
  return apiFetch<ProfileUser>('/user/profile');
}

export function updateProfile(input: UpdateProfileInput): Promise<ProfileUser> {
  return apiFetch<ProfileUser>('/user/profile', { method: 'PATCH', body: input });
}
