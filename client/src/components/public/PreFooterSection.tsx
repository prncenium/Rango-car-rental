import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../ui/Button';
import { SearchIcon } from '../ui/icons';
import { useAuthStore } from '../../store/auth.store';

// Full-bleed image banner, one beat before the footer. Same placeholder
// convention as WhyRentSection/HowItWorksSection: blank string falls back to
// a labeled neutral-900 box instead of a broken <img>. Swap in the real
// Cloudinary URL once the asset exists — see the prompt below the component.
const PRE_FOOTER_IMAGE_URL =
  'https://res.cloudinary.com/gitn9iob/image/upload/v1789741881/Gemini_Generated_Image_uqgvjcuqgvjcuqgv.png';

export function PreFooterSection() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');
  const reducedMotion = useReducedMotion();

  return (
    <section className="relative isolate overflow-hidden bg-neutral-900">
      <div className="absolute inset-0">
        {PRE_FOOTER_IMAGE_URL ? (
          <img
            src={PRE_FOOTER_IMAGE_URL}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-caption text-neutral-400">
            Image placeholder
          </div>
        )}
        {/* surface-overlay token, docs/design/03-design-system.md §2 — darkens any photo enough for neutral-0 text */}
        <div className="absolute inset-0 bg-surface-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/40 to-transparent" />
      </div>

      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center sm:px-6 sm:py-32 lg:px-8"
      >
        <p className="text-caption font-medium uppercase tracking-wide text-brand-accent">
          Ready when you are
        </p>
        <h2 className="mt-3 max-w-2xl font-display text-display-md text-neutral-0 sm:text-display-lg">
          Your next car is one admin-approved listing away.
        </h2>
        <p className="mt-4 max-w-xl text-body-lg text-neutral-200">
          Browse what's live right now, or list your own car and let an admin get it in front of
          real renters.
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
      </motion.div>
    </section>
  );
}
