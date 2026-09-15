export const CAR_MODERATION_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
] as const;
export type CarModerationStatus = (typeof CAR_MODERATION_STATUSES)[number];
