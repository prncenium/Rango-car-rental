export const CAR_FUEL_TYPES = ['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'CNG'] as const;
export type CarFuelType = (typeof CAR_FUEL_TYPES)[number];
