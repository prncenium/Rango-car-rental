export const CAR_TRANSMISSIONS = ['MANUAL', 'AUTOMATIC'] as const;
export type CarTransmission = (typeof CAR_TRANSMISSIONS)[number];
