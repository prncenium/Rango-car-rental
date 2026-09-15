export const CAR_LISTING_STATES = ['UNLISTED', 'LISTED', 'DELISTED'] as const;
export type CarListingState = (typeof CAR_LISTING_STATES)[number];
