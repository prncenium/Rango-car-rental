export const PAYMENT_STATUSES = ['PENDING', 'SETTLED', 'VOID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
