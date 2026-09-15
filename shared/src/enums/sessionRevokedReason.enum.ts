export const SESSION_REVOKED_REASONS = [
  'LOGOUT',
  'LOGOUT_ALL',
  'PASSWORD_CHANGED',
  'ADMIN_REVOKED',
  'REUSE_DETECTED',
  'ACCOUNT_DEACTIVATED',
  'SUPERSEDED',
] as const;
export type SessionRevokedReason = (typeof SESSION_REVOKED_REASONS)[number];
