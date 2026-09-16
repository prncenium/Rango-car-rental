import { CAR_FUEL_TYPES, CAR_TRANSMISSIONS } from '@rango/shared';
import { Input } from '../ui/Input';
import { cn } from '../ui/cn';

export interface FilterState {
  q: string;
  city: string;
  transmission: string[];
  fuelType: string[];
  seatsMin: string;
  priceMin: string;
  priceMax: string;
}

export const EMPTY_FILTERS: FilterState = {
  q: '',
  city: '',
  transmission: [],
  fuelType: [],
  seatsMin: '',
  priceMin: '',
  priceMax: '',
};

export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.q !== '' ||
    filters.city !== '' ||
    filters.transmission.length > 0 ||
    filters.fuelType.length > 0 ||
    filters.seatsMin !== '' ||
    filters.priceMin !== '' ||
    filters.priceMax !== ''
  );
}

const FUEL_LABEL: Record<string, string> = {
  PETROL: 'Petrol',
  DIESEL: 'Diesel',
  ELECTRIC: 'Electric',
  HYBRID: 'Hybrid',
  CNG: 'CNG',
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// Filter sidebar content, shared between the persistent `lg`+ sidebar and the
// below-`lg` drawer (docs/design/03-design-system.md §7). publicCarQueryDto
// (spec 02 §9 E-06) is the ceiling on what can be filtered here — no field is
// offered that the endpoint can't accept.
export function FilterPanel({
  value,
  onChange,
  onReset,
  showHeader = true,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  onReset: () => void;
  /** Hide the built-in "Filters" title + clear-all link when the caller (e.g. a Modal) already provides that chrome. */
  showHeader?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {showHeader && (
        <div className="flex items-center justify-between">
          <h2 className="font-display text-heading-sm text-neutral-900">Filters</h2>
          {hasActiveFilters(value) && (
            <button type="button" onClick={onReset} className="text-body-sm text-brand-accent hover:underline">
              Clear all
            </button>
          )}
        </div>
      )}

      <Input
        label="Search"
        placeholder="Make or model"
        value={value.q}
        onChange={(e) => onChange({ ...value, q: e.target.value })}
      />

      <Input
        label="City"
        placeholder="e.g. Jaipur"
        value={value.city}
        onChange={(e) => onChange({ ...value, city: e.target.value })}
      />

      <fieldset>
        <legend className="mb-2 text-body-sm font-medium text-neutral-700">Transmission</legend>
        <div className="flex flex-col gap-2">
          {CAR_TRANSMISSIONS.map((t) => (
            <label key={t} className="flex items-center gap-2 text-body-sm text-neutral-700">
              <input
                type="checkbox"
                checked={value.transmission.includes(t)}
                onChange={() => onChange({ ...value, transmission: toggle(value.transmission, t) })}
                className="h-4 w-4 rounded-sm border-border-strong text-brand-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
              />
              {t === 'AUTOMATIC' ? 'Automatic' : 'Manual'}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-body-sm font-medium text-neutral-700">Fuel type</legend>
        <div className="flex flex-col gap-2">
          {CAR_FUEL_TYPES.map((f) => (
            <label key={f} className="flex items-center gap-2 text-body-sm text-neutral-700">
              <input
                type="checkbox"
                checked={value.fuelType.includes(f)}
                onChange={() => onChange({ ...value, fuelType: toggle(value.fuelType, f) })}
                className="h-4 w-4 rounded-sm border-border-strong text-brand-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
              />
              {FUEL_LABEL[f]}
            </label>
          ))}
        </div>
      </fieldset>

      <Input
        label="Minimum seats"
        type="number"
        min={1}
        max={20}
        placeholder="Any"
        value={value.seatsMin}
        onChange={(e) => onChange({ ...value, seatsMin: e.target.value })}
      />

      <div>
        <span className="mb-2 block text-body-sm font-medium text-neutral-700">Price per day (₹)</span>
        <div className="flex items-center gap-2">
          <Input
            aria-label="Minimum price"
            type="number"
            min={0}
            placeholder="Min"
            value={value.priceMin}
            onChange={(e) => onChange({ ...value, priceMin: e.target.value })}
          />
          <span className="text-neutral-400">–</span>
          <Input
            aria-label="Maximum price"
            type="number"
            min={0}
            placeholder="Max"
            value={value.priceMax}
            onChange={(e) => onChange({ ...value, priceMax: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

export function FilterChip({
  label,
  onRemove,
  className,
}: {
  label: string;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm bg-brand-accent-subtle px-2.5 py-1 text-body-sm text-neutral-800',
        className,
      )}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="text-neutral-600 hover:text-neutral-900"
      >
        ×
      </button>
    </span>
  );
}
