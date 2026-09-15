export const AUDIT_ENTITY_TYPES = [
  'USER',
  'CAR',
  'BOOKING',
  'PAYMENT',
  'SESSION',
  'SYSTEM_CONFIG',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
