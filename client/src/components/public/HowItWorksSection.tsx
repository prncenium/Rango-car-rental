import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';

const ROTATE_INTERVAL_MS = 3000;

const HOW_IT_WORKS_SLIDES = [
  {
    step: '01',
    title: 'Browse &\nfilter',
    leftImage:
      'https://res.cloudinary.com/gitn9iob/image/upload/v1789737078/Gemini_Generated_Image_2l6lz82l6lz82l6l.png',
    rightImage:
      'https://res.cloudinary.com/gitn9iob/image/upload/v1789737078/Gemini_Generated_Image_1fx41q1fx41q1fx4.png',
    rightBody:
      'Search by city, price, seat count and more until you find the car that actually fits the trip you have in mind.',
  },
  {
    step: '02',
    title: 'Request a\nbooking',
    leftImage:
      'https://res.cloudinary.com/gitn9iob/image/upload/v1789737079/Gemini_Generated_Image_55tsm255tsm255ts.png',
    rightImage:
      'https://res.cloudinary.com/gitn9iob/image/upload/v1789737079/Gemini_Generated_Image_87ncwy87ncwy87nc.png',
    rightBody:
      'Send a request for your dates. The owner and an admin review it before anything is confirmed — no listing goes live, and no booking is approved, without a human checking it.',
  },
  {
    step: '03',
    title: 'Meet &\ndrive off',
    leftImage:
      'https://res.cloudinary.com/gitn9iob/image/upload/v1789737079/Gemini_Generated_Image_mxl5z7mxl5z7mxl5.png',
    rightImage:
      'https://res.cloudinary.com/gitn9iob/image/upload/v1789737080/Gemini_Generated_Image_npb50fnpb50fnpb5.png',
    rightBody:
      'Meet the owner in person, hand over payment offline, and take the keys. No online payment, no middleman app — just the two of you and the car.',
  },
] as const;

export function HowItWorksSection() {
  const [current, setCurrent] = useState(0);
  const reducedMotion = useReducedMotion();

  const next = () => setCurrent((prev) => (prev + 1) % HOW_IT_WORKS_SLIDES.length);
  const prev = () =>
    setCurrent((p) => (p === 0 ? HOW_IT_WORKS_SLIDES.length - 1 : p - 1));

  // Auto-advance every 3s; paused entirely for reduced-motion users.
  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => {
      setCurrent((prev) => (prev + 1) % HOW_IT_WORKS_SLIDES.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [reducedMotion]);

  const slide = HOW_IT_WORKS_SLIDES[current]!;

  return (
    <section className="bg-surface-page">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-caption font-medium uppercase tracking-wide text-brand-accent">
            How it works
          </p>
          <h2 className="mt-3 font-display text-heading-lg text-neutral-900 sm:text-display-md">
            Three steps, no surprises
          </h2>
        </div>

        <div className="relative mt-8 overflow-hidden rounded-lg border border-border shadow-sm sm:mt-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={reducedMotion ? false : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
              className="flex flex-col sm:flex-row"
            >
              {/* Left — step number, title, background image */}
              <div
                className="relative flex h-64 w-full flex-col justify-end overflow-hidden bg-neutral-900 p-6 sm:h-[45.9rem] sm:w-1/2 sm:justify-center sm:p-16"
                style={
                  slide.leftImage
                    ? {
                        backgroundImage: `url(${slide.leftImage})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : undefined
                }
              >
                <div className="relative z-10 whitespace-pre-line">
                  <span className="font-display text-heading-md text-neutral-0/50 sm:text-heading-lg">
                    {slide.step}
                  </span>
                  <h3 className="mt-1 font-display text-heading-lg text-neutral-0 sm:mt-2 sm:text-display-md">
                    {slide.title}
                  </h3>
                </div>
              </div>

              {/* Right — supporting image + body copy */}
              <div className="flex w-full flex-col justify-center bg-surface-sunken px-6 pb-20 pt-6 sm:h-[45.9rem] sm:w-1/2 sm:p-16">
                <div className="h-40 w-full overflow-hidden rounded-md sm:h-[26rem]">
                  {slide.rightImage ? (
                    <img
                      src={slide.rightImage}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-caption text-neutral-400">
                      Image placeholder
                    </div>
                  )}
                </div>
                <p className="mt-4 max-w-md text-body-md text-neutral-600 sm:mt-6 sm:text-body-lg">
                  {slide.rightBody}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Controls */}
          <div className="absolute bottom-6 right-6 flex gap-3 sm:bottom-8 sm:right-8">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous step"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-card text-neutral-900 transition-colors hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next step"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-card text-neutral-900 transition-colors hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-2">
          {HOW_IT_WORKS_SLIDES.map((s, i) => (
            <span
              key={s.step}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current ? 'w-6 bg-brand-accent' : 'w-1.5 bg-border-strong'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
