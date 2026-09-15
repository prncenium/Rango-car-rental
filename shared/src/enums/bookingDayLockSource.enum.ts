export const BOOKING_DAY_LOCK_SOURCES = ['BOOKING', 'BUFFER', 'ADMIN_BLOCK'] as const;
export type BookingDayLockSource = (typeof BOOKING_DAY_LOCK_SOURCES)[number];
