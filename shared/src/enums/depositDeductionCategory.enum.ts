export const DEPOSIT_DEDUCTION_CATEGORIES = [
  'DAMAGE',
  'FUEL',
  'CLEANING',
  'LATE_FEE',
  'TRAFFIC_FINE',
  'OTHER',
] as const;
export type DepositDeductionCategory = (typeof DEPOSIT_DEDUCTION_CATEGORIES)[number];
