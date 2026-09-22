import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listPublicCars } from '../../api/cars';
import { PublicLayout } from './PublicLayout';
import { VideoHero } from '../../components/public/VideoHero';
import { HeroLine, HeroReveal } from '../../components/public/HeroLine';
import { MakingOfSection } from '../../components/public/MakingOfSection';
import { WhyRentSection } from '../../components/public/WhyRentSection';
import { TestimonialsSection } from '../../components/public/TestimonialsSection';
import { HowItWorksSection } from '../../components/public/HowItWorksSection';
import { PreFooterSection } from '../../components/public/PreFooterSection';
import { ScrollZoomHero } from '../../components/sections/ScrollZoomHero';
import { CarCard } from '../../components/public/CarCard';
import { CarCardSkeleton } from '../../components/public/CarCardSkeleton';
import { EmptyState } from '../../components/public/EmptyState';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/auth.store';
import { SearchIcon } from '../../components/ui/icons';

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
          <HeroLine delayMs={0}>Rental, run properly</HeroLine>
        </p>
        <h1 className="mt-3 max-w-2xl font-display text-display-lg text-neutral-0 sm:text-display-xl">
          <HeroLine delayMs={150}>Rent a real car, every</HeroLine>
          <HeroLine delayMs={300}>listing reviewed by a</HeroLine>
          <HeroLine delayMs={450}>real admin.</HeroLine>
        </h1>
        <p className="mt-5 max-w-xl text-body-lg text-neutral-200">
          <HeroLine delayMs={650}>
            Every listing on Rango is approved before it's public and every rental is handed over
            in person — no online payment, no unvetted cars, no guesswork.
          </HeroLine>
        </p>
        <HeroReveal delayMs={800}>
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
        </HeroReveal>
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

          {!isLoading &&
            !isError &&
            cars.map((car, index) => (
              // Mobile shows only the first 5, then the "View all cars"
              // button below takes over — desktop/tablet (sm+) still shows
              // every fetched car, unaffected. `hidden sm:block` (rather than
              // slicing the array) keeps this purely a mobile-viewport
              // concern with no change to what's fetched or how sm+ renders.
              <div key={car.id} className={index >= 5 ? 'hidden sm:block' : undefined}>
                <CarCard car={car} />
              </div>
            ))}
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
        body="No middleman apps, no hidden fees — just a real car, a real person, and the keys in your hand. Every listing is admin-approved before it goes live, and every handover happens in person at our godown."
        actions={
          <>
            <Button variant="primary" size="lg" onClick={() => navigate('/cars')}>
              <SearchIcon className="h-4 w-4" />
              Browse available cars
            </Button>
            <Link
              to={isAuthenticated ? '/account/listings/new' : '/register'}
              className="inline-flex h-12 items-center justify-center rounded-sm border border-neutral-0/30 px-6 text-body-md text-neutral-0 transition-colors hover:bg-neutral-0/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2"
            >
              List your car
            </Link>
          </>
        }
        stats={[
          { value: 'Admin-approved', label: 'Every listing reviewed before it goes live' },
          { value: 'No online payment', label: 'Pay directly, in person, at handover' },
          { value: '24–48 hrs', label: 'Typical time to hear back on a request' },
        ]}
      />

      <HowItWorksSection />

      <TestimonialsSection />

      <WhyRentSection />

      <PreFooterSection />
    </PublicLayout>
  );
}
