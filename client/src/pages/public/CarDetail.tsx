import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPublicAvailability, getPublicCarDetail } from '../../api/cars';
import { ApiError } from '../../lib/apiClient';
import { PublicLayout } from './PublicLayout';
import { PageHero } from '../../components/public/PageHero';
import { PreFooterSection } from '../../components/public/PreFooterSection';
import { AvailabilityCalendar } from '../../components/public/AvailabilityCalendar';
import { EmptyState } from '../../components/public/EmptyState';
import { RentalTermsHighlights } from '../../components/public/RentalTermsHighlights';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/auth.store';
import { addMonthsIso, monthStartIso, todayIso } from '../../lib/dateUtc';
import { CarSilhouetteIcon, FuelIcon, GearIcon, MapPinIcon, SeatIcon } from '../../components/ui/icons';

const FUEL_LABEL: Record<string, string> = {
  PETROL: 'Petrol',
  DIESEL: 'Diesel',
  ELECTRIC: 'Electric',
  HYBRID: 'Hybrid',
  CNG: 'CNG',
};

function currentMonthStart(): string {
  const t = todayIso();
  return monthStartIso(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1);
}

export function CarDetailPage() {
  const { carId } = useParams<{ carId: string }>();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');
  const [activeImage, setActiveImage] = useState(0);
  const [visibleMonth, setVisibleMonth] = useState(currentMonthStart());

  const carQuery = useQuery({
    queryKey: ['public-car', carId],
    queryFn: () => getPublicCarDetail(carId!),
    enabled: Boolean(carId),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  const availabilityQuery = useQuery({
    queryKey: ['car-availability', carId, visibleMonth],
    queryFn: () => getPublicAvailability(carId!, visibleMonth, addMonthsIso(visibleMonth, 1)),
    enabled: Boolean(carId) && carQuery.isSuccess,
  });

  const car = carQuery.data;
  const is404 = carQuery.error instanceof ApiError && carQuery.error.status === 404;
  const blockedDays = new Set(availabilityQuery.data?.blockedDays ?? []);
  const today = todayIso();

  function goToRequest() {
    if (!carId) return;
    navigate(isAuthenticated ? `/cars/${carId}/request` : `/login?next=/cars/${carId}/request`);
  }

  if (is404) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8">
          <EmptyState
            title="This car isn't available anymore"
            description="It may have been delisted, or the link may be out of date."
            action={{ label: 'Back to search', onClick: () => navigate('/cars') }}
          />
        </div>
      </PublicLayout>
    );
  }

  if (carQuery.isError) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8">
          <EmptyState
            title="Couldn't load this listing"
            description="Something went wrong reaching the server. Please try again shortly."
            action={{ label: 'Retry', onClick: () => carQuery.refetch() }}
          />
        </div>
      </PublicLayout>
    );
  }

  if (carQuery.isLoading || !car) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid animate-pulse grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
            <div className="aspect-[4/3] rounded-lg bg-surface-sunken" />
            <div className="space-y-3 rounded-lg border border-border bg-surface-card p-5">
              <div className="h-6 w-2/3 rounded-sm bg-surface-sunken" />
              <div className="h-4 w-1/2 rounded-sm bg-surface-sunken" />
              <div className="h-10 w-full rounded-sm bg-surface-sunken" />
              <div className="h-48 w-full rounded-sm bg-surface-sunken" />
            </div>
          </div>
        </div>
      </PublicLayout>
    );
  }

  const images = car.images.length > 0 ? car.images : [];

  return (
    <PublicLayout>
      <PageHero
        breadcrumb={
          <nav className="text-body-sm text-neutral-200" aria-label="Breadcrumb">
            <Link to="/cars" className="hover:text-brand-accent hover:underline">
              Cars
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-neutral-0">
              {car.make} {car.model}
            </span>
          </nav>
        }
        eyebrow="Admin-approved listing"
        title={`${car.make} ${car.model} ${car.year}`}
        subcopy={`${car.location.city}, ${car.location.state} · ₹${car.rentalPricePerDay.toLocaleString('en-IN')} / day`}
        backgroundImage="https://res.cloudinary.com/gitn9iob/image/upload/v1789915305/Gemini_Generated_Image_wv0rrcwv0rrcwv0r.png"
      />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          {/* Photo gallery */}
          <div>
            <div className="aspect-[4/3] overflow-hidden rounded-lg border border-border bg-surface-sunken">
              {images.length > 0 ? (
                <img
                  src={images[activeImage]}
                  alt={`${car.make} ${car.model}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-neutral-300">
                  <CarSilhouetteIcon className="h-20 w-20" />
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    aria-label={`Show photo ${i + 1}`}
                    aria-pressed={i === activeImage}
                    className={`h-16 w-20 shrink-0 overflow-hidden rounded-sm border-2 ${
                      i === activeImage ? 'border-brand-accent' : 'border-transparent'
                    }`}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Specs */}
            <section className="mt-8">
              <h2 className="font-display text-heading-sm text-neutral-900">Specs</h2>
              <dl className="mt-3 grid grid-cols-2 gap-4 text-body-sm sm:grid-cols-4">
                <div className="flex items-center gap-2">
                  <GearIcon className="h-4 w-4 text-neutral-400" />
                  <div>
                    <dt className="text-neutral-500">Transmission</dt>
                    <dd className="text-neutral-800">{car.transmission === 'AUTOMATIC' ? 'Automatic' : 'Manual'}</dd>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FuelIcon className="h-4 w-4 text-neutral-400" />
                  <div>
                    <dt className="text-neutral-500">Fuel</dt>
                    <dd className="text-neutral-800">{FUEL_LABEL[car.fuelType] ?? car.fuelType}</dd>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <SeatIcon className="h-4 w-4 text-neutral-400" />
                  <div>
                    <dt className="text-neutral-500">Seats</dt>
                    <dd className="text-neutral-800">{car.seats}</dd>
                  </div>
                </div>
                <div>
                  <dt className="text-neutral-500">Distance cap</dt>
                  <dd className="text-neutral-800">
                    300 km/day{car.extraKmRatePerKm ? `, then ₹${car.extraKmRatePerKm}/km` : ''}
                  </dd>
                </div>
                {car.color && (
                  <div>
                    <dt className="text-neutral-500">Color</dt>
                    <dd className="text-neutral-800">{car.color}</dd>
                  </div>
                )}
              </dl>
            </section>

            {car.description && (
              <section className="mt-8">
                <h2 className="font-display text-heading-sm text-neutral-900">Description</h2>
                <p className="mt-2 whitespace-pre-line text-body-md text-neutral-700">{car.description}</p>
              </section>
            )}

            <RentalTermsHighlights />
          </div>

          {/* Summary card */}
          <aside className="h-fit lg:sticky lg:top-24">
            <div className="rounded-lg border border-border bg-surface-card p-5">
              <h1 className="font-display text-heading-md text-neutral-900">
                {car.make} {car.model} {car.year}
              </h1>
              <div className="mt-1 flex items-center gap-1 text-body-sm text-neutral-500">
                <MapPinIcon className="h-4 w-4 shrink-0" />
                <span>
                  {car.location.city}, {car.location.state}
                </span>
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <span className="font-display text-heading-sm text-brand-primary">
                  ₹{car.rentalPricePerDay.toLocaleString('en-IN')}
                </span>
                <span className="text-body-sm text-neutral-500"> / day</span>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                <h2 className="text-body-sm font-medium text-neutral-700">Availability</h2>
                <div className="mt-2">
                  <AvailabilityCalendar
                    mode="readonly"
                    visibleMonth={visibleMonth}
                    onVisibleMonthChange={setVisibleMonth}
                    blockedDays={blockedDays}
                    todayIsoValue={today}
                  />
                </div>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                <Button variant="primary" size="lg" className="w-full" onClick={goToRequest}>
                  Request to book
                </Button>
                <p className="mt-2 text-caption text-neutral-500">
                  Sending a request doesn't book the car — an admin reviews it and you're contacted to confirm in
                  person.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <PreFooterSection
        eyebrow="Sending a request costs nothing"
        heading={`Ready to make the ${car.make} ${car.model} yours?`}
        body="Request to book above — an admin reviews it and you're contacted to confirm the handover in person, no online payment involved."
        showBrowseCta={false}
        backgroundImage="https://res.cloudinary.com/gitn9iob/image/upload/v1789915336/Gemini_Generated_Image_jk6v9djk6v9djk6v.png"
      />
    </PublicLayout>
  );
}
