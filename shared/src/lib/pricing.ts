// Daily distance cap for rentals: each rental day includes this many free
// km. Distance driven beyond `days * DAILY_DISTANCE_CAP_KM` is billed at the
// car's `extraKmRatePerKm` (specs/04-business-logic.md §2.2a).
export const DAILY_DISTANCE_CAP_KM = 300;
