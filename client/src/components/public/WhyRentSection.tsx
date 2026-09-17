import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const WHY_RENT_IMAGE_URL =
  'https://res.cloudinary.com/gitn9iob/image/upload/v1789645722/Gemini_Generated_Image_4343n04343n04343.png';

const WHY_RENT_SLIDES = [
  {
    title: 'Wide choice',
    body: 'A growing range of hatchbacks, sedans and SUVs for different kinds of trips.',
  },
  {
    title: 'Clear pricing',
    body: 'Simple daily rates so you know what you’re choosing before you book.',
  },
  {
    title: 'Easy booking',
    body: 'Choose a car, send an enquiry and let us help you get your booking sorted.',
  },
];

const ROTATE_INTERVAL_MS = 2000;

export function WhyRentSection() {
  const [active, setActive] = useState(0);
  const reducedMotion = useReducedMotion();

  // Auto-advance the right-hand copy only — the left image stays fixed.
  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => {
      setActive((prev) => (prev + 1) % WHY_RENT_SLIDES.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [reducedMotion]);

  const slide = WHY_RENT_SLIDES[active]!;

  return (
    <section className="bg-surface-card">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <p className="text-caption font-medium uppercase tracking-wide text-brand-accent">
            Why choose us
          </p>
          <h2 className="mt-3 font-display text-heading-lg text-neutral-900 sm:text-display-md">
            Why rent with Rango
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 overflow-hidden rounded-lg border border-border shadow-sm sm:grid-cols-2">
          {/* Left — fixed image, never rotates */}
          <div className="relative h-[45.9rem]">
            {WHY_RENT_IMAGE_URL ? (
              <img
                src={WHY_RENT_IMAGE_URL}
                alt="A Rango car, ready to rent"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-caption text-neutral-400">
                Image placeholder
              </div>
            )}
          </div>

          {/* Right — copy rotates through WHY_RENT_SLIDES every 2s */}
          <div className="relative flex h-[45.9rem] flex-col justify-center overflow-hidden bg-surface-sunken px-8 py-8 sm:px-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.title}
                initial={reducedMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reducedMotion ? 0 : -16 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                <span className="font-display text-heading-lg text-brand-accent/40">
                  0{active + 1}
                </span>
                <h3 className="mt-2 font-display text-heading-md text-neutral-900">{slide.title}</h3>
                <p className="mt-4 max-w-sm text-body-lg text-neutral-600">{slide.body}</p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-8 flex gap-2">
              {WHY_RENT_SLIDES.map((s, i) => (
                <span
                  key={s.title}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === active ? 'w-6 bg-brand-accent' : 'w-1.5 bg-border-strong'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
