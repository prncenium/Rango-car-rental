import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listPublicCars, type PublicCarQuery, type SortOption } from '../../api/cars';
import { PublicLayout } from './PublicLayout';
import { PageHero } from '../../components/public/PageHero';
import { PreFooterSection } from '../../components/public/PreFooterSection';
import { CarCard } from '../../components/public/CarCard';
import { CarCardSkeleton } from '../../components/public/CarCardSkeleton';
import { EmptyState } from '../../components/public/EmptyState';
import { EMPTY_FILTERS, FilterChip, FilterPanel, hasActiveFilters, type FilterState } from '../../components/public/FilterPanel';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { ChevronLeftIcon, ChevronRightIcon, GearIcon, MapPinIcon, SearchIcon, SlidersIcon } from '../../components/ui/icons';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'publishedAt:desc', label: 'Newest first' },
  { value: 'rentalPricePerDay:asc', label: 'Price: low to high' },
  { value: 'rentalPricePerDay:desc', label: 'Price: high to low' },
  { value: 'year:desc', label: 'Year: newest' },
  { value: 'seats:asc', label: 'Seats: fewest first' },
];

const FUEL_LABEL: Record<string, string> = {
  PETROL: 'Petrol',
  DIESEL: 'Diesel',
  ELECTRIC: 'Electric',
  HYBRID: 'Hybrid',
  CNG: 'CNG',
};

function toQuery(filters: FilterState, sort: SortOption, page: number): PublicCarQuery {
  const query: PublicCarQuery = { page, limit: 12, sort };
  if (filters.q) query.q = filters.q;
  if (filters.city) query.city = filters.city;
  if (filters.transmission.length) query.transmission = filters.transmission as ('MANUAL' | 'AUTOMATIC')[];
  if (filters.fuelType.length) query.fuelType = filters.fuelType;
  if (filters.seatsMin) query.seatsMin = Number(filters.seatsMin);
  if (filters.priceMin) query.priceMin = Number(filters.priceMin);
  if (filters.priceMax) query.priceMax = Number(filters.priceMax);
  return query;
}

export function SearchPage() {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortOption>('publishedAt:desc');
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const debouncedFilters = useDebouncedValue(filters, 350);
  const query = useMemo(() => toQuery(debouncedFilters, sort, page), [debouncedFilters, sort, page]);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['public-cars', 'search', query],
    queryFn: () => listPublicCars(query),
    placeholderData: (prev) => prev,
  });

  const cars = data?.data ?? [];
  const meta = data?.meta;

  function updateFilters(next: FilterState) {
    setFilters(next);
    setPage(1);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function scrollToResults() {
    document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [
    ...(filters.q ? [{ key: 'q', label: `"${filters.q}"`, onRemove: () => updateFilters({ ...filters, q: '' }) }] : []),
    ...(filters.city ? [{ key: 'city', label: filters.city, onRemove: () => updateFilters({ ...filters, city: '' }) }] : []),
    ...filters.transmission.map((t) => ({
      key: `t-${t}`,
      label: t === 'AUTOMATIC' ? 'Automatic' : 'Manual',
      onRemove: () => updateFilters({ ...filters, transmission: filters.transmission.filter((v) => v !== t) }),
    })),
    ...filters.fuelType.map((f) => ({
      key: `f-${f}`,
      label: FUEL_LABEL[f] ?? f,
      onRemove: () => updateFilters({ ...filters, fuelType: filters.fuelType.filter((v) => v !== f) }),
    })),
    ...(filters.seatsMin
      ? [{ key: 'seats', label: `${filters.seatsMin}+ seats`, onRemove: () => updateFilters({ ...filters, seatsMin: '' }) }]
      : []),
    ...(filters.priceMin || filters.priceMax
      ? [
          {
            key: 'price',
            label: `₹${filters.priceMin || '0'}–${filters.priceMax || '∞'}/day`,
            onRemove: () => updateFilters({ ...filters, priceMin: '', priceMax: '' }),
          },
        ]
      : []),
  ];

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Admin-approved listings"
        title="Browse cars"
        subcopy="Every car below is admin-approved and currently listed."
        // PageHero crossfades through every entry here every 3s.
        backgroundImages={[
          'https://res.cloudinary.com/gitn9iob/image/upload/v1789912528/Gemini_Generated_Image_by8x9cby8x9cby8x.png',
          'https://res.cloudinary.com/gitn9iob/image/upload/v1789916056/ChatGPT_Image_Sep_20_2026_08_23_55_PM.png',
          'https://res.cloudinary.com/gitn9iob/image/upload/v1789916057/Gemini_Generated_Image_sus1sssus1sssus1.png',
        ]}
        content={
          <div className="max-w-3xl">
            <div className="flex flex-col gap-4 rounded-lg bg-surface-card p-4 shadow-lg sm:flex-row sm:items-end sm:p-5">
              <div className="flex-1">
                <label htmlFor="hero-city" className="flex items-center gap-1.5 text-caption font-medium uppercase tracking-wide text-neutral-500">
                  <MapPinIcon className="h-3.5 w-3.5 text-brand-accent" />
                  City
                </label>
                <input
                  id="hero-city"
                  value={filters.city}
                  onChange={(e) => updateFilters({ ...filters, city: e.target.value })}
                  placeholder="e.g. Vadodara"
                  className="mt-1.5 h-11 w-full rounded-sm border border-border-strong bg-surface-sunken px-3 text-body-md text-neutral-900 placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="hero-transmission" className="flex items-center gap-1.5 text-caption font-medium uppercase tracking-wide text-neutral-500">
                  <GearIcon className="h-3.5 w-3.5 text-brand-accent" />
                  Transmission
                </label>
                <select
                  id="hero-transmission"
                  value={filters.transmission[0] ?? ''}
                  onChange={(e) => updateFilters({ ...filters, transmission: e.target.value ? [e.target.value] : [] })}
                  className="mt-1.5 h-11 w-full rounded-sm border border-border-strong bg-surface-sunken px-3 text-body-md text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
                >
                  <option value="">Any</option>
                  <option value="MANUAL">Manual</option>
                  <option value="AUTOMATIC">Automatic</option>
                </select>
              </div>
              <Button variant="primary" size="lg" className="sm:w-auto" onClick={scrollToResults}>
                <SearchIcon className="h-4 w-4" />
                Search
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <p className="text-body-sm text-neutral-100">Ready to drive today?</p>
              <Button variant="primary" onClick={scrollToResults}>
                Book now
              </Button>
            </div>
          </div>
        }
      />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
          {/* Sidebar — persistent at lg+ */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-lg border border-border bg-surface-card p-5">
              <FilterPanel value={filters} onChange={updateFilters} onReset={resetFilters} />
            </div>
          </aside>

          <div id="results">
            {/* Toolbar: mobile filter trigger + sort + result count */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
                  <SlidersIcon className="h-4 w-4" />
                  Filters
                  {hasActiveFilters(filters) && (
                    <span className="ml-1 rounded-full bg-brand-accent px-1.5 text-caption text-neutral-0">
                      {activeChips.length}
                    </span>
                  )}
                </Button>
                <p className="text-body-sm text-neutral-500">
                  {meta ? `${meta.total} car${meta.total === 1 ? '' : 's'} found` : ' '}
                </p>
              </div>

              <Select
                aria-label="Sort by"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortOption);
                  setPage(1);
                }}
                className="w-auto"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            {activeChips.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {activeChips.map((chip) => (
                  <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
                ))}
              </div>
            )}

            {/* Results grid */}
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => <CarCardSkeleton key={i} />)}

              {!isLoading && !isError && cars.map((car) => <CarCard key={car.id} car={car} />)}
            </div>

            {!isLoading && !isError && cars.length === 0 && (
              <div className="mt-6">
                <EmptyState
                  title="No cars match your filters"
                  description="Try widening your search — remove a filter or adjust the price range."
                  action={hasActiveFilters(filters) ? { label: 'Clear all filters', onClick: resetFilters } : undefined}
                />
              </div>
            )}

            {isError && (
              <div className="mt-6">
                <EmptyState
                  title="Couldn't load cars"
                  description="Something went wrong reaching the server. Please try again shortly."
                />
              </div>
            )}

            {/* Pagination */}
            {meta && meta.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={meta.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                  className="flex h-9 w-9 items-center justify-center rounded-sm border border-border-strong text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <span className="text-body-sm text-neutral-600">
                  Page {meta.page} of {meta.totalPages}
                  {isFetching && ' · updating…'}
                </span>
                <button
                  type="button"
                  disabled={!meta.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                  className="flex h-9 w-9 items-center justify-center rounded-sm border border-border-strong text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <PreFooterSection
        eyebrow="Have a car of your own?"
        heading="List it, and let an admin get it in front of real renters."
        body="Every listing is reviewed before it goes public — no payment gateway, no unvetted cars, handover happens in person."
        showBrowseCta={false}
        backgroundImage="https://res.cloudinary.com/gitn9iob/image/upload/v1789912349/ChatGPT_Image_Sep_20_2026_07_22_18_PM.png"
      />

      {/* Mobile filter drawer */}
      <Modal open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Filters">
        <ModalBody className="max-h-[60vh] overflow-y-auto">
          <FilterPanel value={filters} onChange={updateFilters} onReset={resetFilters} showHeader={false} />
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={resetFilters}>
            Clear all
          </Button>
          <Button variant="primary" onClick={() => setDrawerOpen(false)}>
            Show results
          </Button>
        </ModalFooter>
      </Modal>
    </PublicLayout>
  );
}
