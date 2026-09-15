export const PAYMENT_PURPOSES = ['RENTAL', 'DEPOSIT'] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];
