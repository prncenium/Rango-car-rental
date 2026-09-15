export const BOOKING_STATUSES = [
  'REQUESTED',
  'CONFIRMED',
  'REJECTED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'CANCELLATION_REQUESTED',
  'TERMINATED',
  'NO_SHOW',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
