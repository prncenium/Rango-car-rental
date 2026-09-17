import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listPublicCars } from '../../api/cars';
import { PublicLayout } from './PublicLayout';
import { VideoHero } from '../../components/public/VideoHero';
import { MakingOfSection } from '../../components/public/MakingOfSection';
import { ScrollZoomHero } from '../../components/sections/ScrollZoomHero';
import { CarCard } from '../../components/public/CarCard';
import { CarCardSkeleton } from '../../components/public/CarCardSkeleton';
import { EmptyState } from '../../components/public/EmptyState';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/auth.store';
import { BadgePercentIcon, HandshakeIcon, SearchIcon, ShieldCheckIcon } from '../../components/ui/icons';

const VALUE_PROPS = [
  {
    icon: ShieldCheckIcon,
    title: 'Every listing, reviewed',
    body: 'An admin reviews the car and its details by hand before a listing ever goes public — no unreviewed listings, no surprises on pickup day.',
  },
  {
    icon: HandshakeIcon,
    title: 'Handover, in person',
    body: 'No online payment gateway. You meet the owner, inspect the car, and pay directly — the way a car handover should work.',
  },
  {
    icon: BadgePercentIcon,
    title: 'Transparent daily pricing',
    body: 'The price you see is the price you pay per day. No hidden platform fees baked into the listing.',
  },
];

const STEPS = [
  { step: '01', title: 'Browse & filter', body: 'Search by city, price, seats, and more to find the right car.' },
  { step: '02', title: 'Request a booking', body: 'Send a request for your dates — the owner and admin review it.' },
  { step: '03', title: 'Meet & drive off', body: 'Confirm in person, hand over payment, and take the keys.' },
];

export function HomePage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-cars', 'featured'],
    queryFn: () => listPublicCars({ limit: 8, sort: 'publishedAt:desc' }),
  });

  const cars = data?.data ?? [];

  return (
    <PublicLayout>
      {/* Hero — spec 05 §3.1 amendment: scroll-linked shrinking video hero */}
      <VideoHero>
        <p className="text-caption font-medium uppercase tracking-wide text-brand-accent">
          Rental, run properly
        </p>
        <h1 className="mt-3 max-w-2xl font-display text-display-lg text-neutral-0 sm:text-display-xl">
          Rent a real car, every listing reviewed by a real admin.
        </h1>
        <p className="mt-5 max-w-xl text-body-lg text-neutral-200">
          Every listing on Rango is approved before it's public and every rental is handed over
          in person — no online payment, no unvetted cars, no guesswork.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button
            variant="primary"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => navigate('/cars')}
          >
            <SearchIcon className="h-4 w-4" />
            Browse available cars
          </Button>
          <Link
            to={isAuthenticated ? '/account/listings/new' : '/register'}
            className="inline-flex h-12 w-full items-center justify-center rounded-sm border border-neutral-0/30 px-6 text-body-md text-neutral-0 transition-colors hover:bg-neutral-0/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2 sm:w-auto"
          >
            List your car
          </Link>
        </div>
      </VideoHero>

      <MakingOfSection />

      {/* Featured / recent listings */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-heading-lg text-neutral-900">Recently listed</h2>
            <p className="mt-1 text-body-md text-neutral-600">Freshly approved cars, ready to book.</p>
          </div>
          <Link to="/cars" className="hidden text-body-md font-medium text-brand-accent hover:underline sm:inline">
            View all cars →
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => <CarCardSkeleton key={i} />)}

          {!isLoading && !isError && cars.map((car) => <CarCard key={car.id} car={car} />)}
        </div>

        {!isLoading && !isError && cars.length === 0 && (
          <div className="mt-8">
            <EmptyState
              title="No cars listed yet"
              description="Check back soon — new listings appear here as soon as an admin approves them."
            />
          </div>
        )}

        {isError && (
          <div className="mt-8">
            <EmptyState
              title="Couldn't load listings"
              description="Something went wrong reaching the server. Please try again shortly."
            />
          </div>
        )}

        <div className="mt-8 text-center sm:hidden">
          <Button variant="secondary" onClick={() => navigate('/cars')}>
            View all cars
          </Button>
        </div>
      </section>

      <ScrollZoomHero
        imageUrl="https://res.cloudinary.com/gitn9iob/image/upload/v1789638457/ChatGPT_Image_Sep_17_2026_03_15_21_PM.png"
        imageAlt="A car from the Rango fleet, ready to be rented"
        eyebrow="Rango"
        heading="Rent cars."
        body="No middleman apps, no hidden fees — just a real car, a real person, and the keys in your hand."
      />

      {/* Value proposition */}
      <section className="bg-surface-card">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-center font-display text-heading-lg text-neutral-900">Why rent with Rango</h2>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="text-center sm:text-left">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-sm bg-brand-accent-subtle text-brand-accent sm:mx-0">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-display text-heading-sm text-neutral-900">{title}</h3>
                <p className="mt-2 text-body-md text-neutral-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-center font-display text-heading-lg text-neutral-900">How it works</h2>
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {STEPS.map(({ step, title, body }) => (
            <div key={step} className="relative rounded-lg border border-border bg-surface-card p-6">
              <span className="font-display text-heading-lg text-brand-accent/40">{step}</span>
              <h3 className="mt-2 font-display text-heading-sm text-neutral-900">{title}</h3>
              <p className="mt-2 text-body-md text-neutral-600">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}
