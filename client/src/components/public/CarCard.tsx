import type { PublicCarSummary } from '../../api/cars';
import { CarSilhouetteIcon, FuelIcon, GearIcon, MapPinIcon, SeatIcon } from '../ui/icons';

const FUEL_LABEL: Record<string, string> = {
  PETROL: 'Petrol',
  DIESEL: 'Diesel',
  ELECTRIC: 'Electric',
  HYBRID: 'Hybrid',
  CNG: 'CNG',
};

// Listing card — radius-lg per docs/design/03-design-system.md §5 ("large
// public-page cards"), a hairline border rather than a shadow (§6: shadow
// is reserved for genuine elevation, not flat cards).
export function CarCard({ car }: { car: PublicCarSummary }) {
  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-surface-card transition-shadow hover:shadow-sm">
      <div className="relative aspect-[4/3] bg-surface-sunken">
        {car.primaryImageUrl ? (
          <img
            src={car.primaryImageUrl}
            alt={`${car.make} ${car.model}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-300">
            <CarSilhouetteIcon className="h-16 w-16" />
          </div>
        )}
        <span className="absolute right-3 top-3 rounded-sm bg-neutral-900/70 px-2 py-1 text-caption font-medium text-neutral-0">
          {car.year}
        </span>
      </div>

      <div className="p-4">
        <h3 className="font-display text-heading-sm text-neutral-900">
          {car.make} {car.model}
        </h3>

        <div className="mt-1 flex items-center gap-1 text-body-sm text-neutral-500">
          <MapPinIcon className="h-4 w-4 shrink-0" />
          <span>
            {car.location.city}, {car.location.state}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-4 text-body-sm text-neutral-600">
          <span className="flex items-center gap-1">
            <SeatIcon className="h-4 w-4 text-neutral-400" />
            {car.seats}
          </span>
          <span className="flex items-center gap-1">
            <GearIcon className="h-4 w-4 text-neutral-400" />
            {car.transmission === 'AUTOMATIC' ? 'Auto' : 'Manual'}
          </span>
          <span className="flex items-center gap-1">
            <FuelIcon className="h-4 w-4 text-neutral-400" />
            {FUEL_LABEL[car.fuelType] ?? car.fuelType}
          </span>
        </div>

        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
          <div>
            <span className="font-display text-heading-sm text-brand-primary">
              ₹{car.rentalPricePerDay.toLocaleString('en-IN')}
            </span>
            <span className="text-body-sm text-neutral-500"> / day</span>
          </div>
        </div>
      </div>
    </article>
  );
}
