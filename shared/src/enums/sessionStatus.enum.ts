export const SESSION_STATUSES = ['ACTIVE', 'ROTATED', 'REVOKED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
