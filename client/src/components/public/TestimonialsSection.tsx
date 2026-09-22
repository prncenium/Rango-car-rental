import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

// Orbit-style testimonial picker: floating avatars around a center quote
// card. Clicking an avatar swaps the active quote in place (no dedicated
// /testimonials route exists yet, unlike the reference this was adapted
// from). `image` is left blank until real Cloudinary URLs are supplied —
// blank avatars fall back to initials, same placeholder convention as
// MakingOfSection's "Image placeholder" boxes.
type Testimonial = {
  id: number;
  name: string;
  role: string;
  quote: string;
  image: string;
  coords: { x: number; y: number; delay: number };
};

const TESTIMONIALS: Testimonial[] = [
  {
    id: 1,
    name: 'Anjali Verma',
    role: 'First-time renter',
    quote:
      "I was nervous booking a car online, but the listing matched exactly — same scratches, same odometer reading. Whoever approved it actually checked.",
    image: '',
    coords: { x: -300, y: -170, delay: 0.3 },
  },
  {
    id: 2,
    name: 'Rohan Mehta',
    role: 'Weekend road-tripper',
    quote:
      'No app trying to upsell insurance I didn’t need, no surprise charges at pickup. I paid the owner directly, exactly what was listed.',
    image: '',
    coords: { x: 290, y: -160, delay: 0.5 },
  },
  {
    id: 3,
    name: 'Kavita Nair',
    role: 'Rented for a family trip',
    quote:
      'The handover felt like meeting a person, not scanning a QR code. We walked around the car together before I drove off.',
    image: '',
    coords: { x: 300, y: 230, delay: 0.7 },
  },
  {
    id: 4,
    name: 'Suresh Iyer',
    role: 'Repeat customer',
    quote:
      'Every car I’ve booked through Rango has matched its listing. That consistency is why I keep coming back instead of the usual apps.',
    image: '',
    coords: { x: -280, y: 220, delay: 0.9 },
  },
];

function Avatar({ testimonial, className }: { testimonial: Testimonial; className?: string }) {
  const initials = testimonial.name
    .split(' ')
    .map((part) => part[0])
    .join('');

  if (testimonial.image) {
    return <img src={testimonial.image} alt={testimonial.name} className={`object-cover ${className ?? ''}`} />;
  }

  return (
    <span
      className={`flex items-center justify-center bg-surface-sunken font-display text-neutral-500 ${className ?? ''}`}
    >
      {initials}
    </span>
  );
}

export function TestimonialsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const active = TESTIMONIALS[activeIndex]!;

  return (
    <section className="relative overflow-hidden bg-surface-sunken py-16 sm:py-24">
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={reducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.12 } },
          }}
          className="flex flex-col items-center text-center"
        >
          <motion.p
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="text-caption font-medium uppercase tracking-wide text-brand-accent"
          >
            Customer stories
          </motion.p>
          <motion.h2
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="mt-3 font-display text-heading-lg text-neutral-900 sm:text-display-md"
          >
            Real renters, real reviews.
          </motion.h2>
          <motion.p
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="mt-4 max-w-xl text-body-lg text-neutral-600"
          >
            Every review comes from someone who actually picked up the keys — because every
            listing is checked before it goes live.
          </motion.p>
        </motion.div>

        {/* `scale()` only shrinks the *painted* content — the 560px layout box
            stays full height regardless, which is exactly right at sm+
            (nothing to fix there) but leaves a large dead-space gap below the
            visibly-smaller mobile content. This wrapper (holding the same
            mt-8/lg:mt-16 margin the box used to carry directly — moved here
            so overflow-hidden crops correctly) caps height to the box's
            actual scaled content on mobile only; at `sm` and up it's inert
            (auto height, visible overflow), so the orbit picker itself,
            unchanged below, renders exactly as before. */}
        <div className="mt-8 h-[330px] overflow-hidden sm:h-auto sm:overflow-visible lg:mt-16">
          <div className="relative flex h-[560px] w-full max-w-[880px] origin-top scale-[0.5] transform-gpu items-center justify-center sm:scale-[0.65] md:scale-[0.85] lg:scale-100">
          {/* Orbit rings — purely decorative geometry, matches the flatter, engineered mood over soft blobs. */}
          <div className="absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-border" />
          <div className="absolute left-1/2 top-1/2 h-[680px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-border" />
          <div className="absolute left-1/2 top-1/2 h-[880px] w-[880px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-border" />

          {TESTIMONIALS.map((testimonial, index) => (
            <motion.button
              key={testimonial.id}
              type="button"
              custom={testimonial.coords}
              initial={reducedMotion ? false : 'hidden'}
              whileInView="visible"
              viewport={{ once: true }}
              variants={{
                hidden: { opacity: 0, x: 0, y: 0, scale: 0.3 },
                visible: ({ x, y, delay }: Testimonial['coords']) => ({
                  opacity: 1,
                  x,
                  y,
                  scale: 1,
                  transition: reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 40, damping: 14, delay },
                }),
              }}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show testimonial from ${testimonial.name}`}
              aria-pressed={activeIndex === index}
              className="absolute left-1/2 top-1/2 z-10 -ml-[52px] -mt-[52px] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-4"
            >
              <motion.span
                animate={{ y: reducedMotion ? [0, 0, 0] : [0, -8, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', delay: index * 0.4 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className={`flex h-[104px] w-[104px] items-center justify-center overflow-hidden rounded-full border-4 shadow-sm transition-colors duration-300 ${
                  activeIndex === index ? 'border-brand-accent' : 'border-neutral-0'
                }`}
              >
                <Avatar testimonial={testimonial} className="h-full w-full text-heading-sm" />
              </motion.span>
            </motion.button>
          ))}

          {/* Center quote card */}
          <div className="relative z-20 flex h-auto min-h-[400px] w-[90%] max-w-[500px] flex-col justify-between rounded-lg border border-border bg-surface-card p-8 shadow-md sm:p-10">
            <svg width="36" height="28" viewBox="0 0 32 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M9.6 28H0L6.4 0H16L9.6 28ZM25.6 28H16L22.4 0H32L25.6 28Z"
                fill="currentColor"
                className="text-brand-accent/50"
              />
            </svg>

            <AnimatePresence mode="wait">
              <motion.p
                key={active.id}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="flex-grow font-display text-heading-sm italic leading-relaxed text-neutral-800 sm:text-heading-md"
              >
                "{active.quote}"
              </motion.p>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.div
                key={`profile-${active.id}`}
                initial={reducedMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.3 }}
                className="mt-8 flex items-center gap-4 border-t border-border pt-6"
              >
                <Avatar
                  testimonial={active}
                  className="h-12 w-12 flex-shrink-0 rounded-full border-2 border-border text-body-sm"
                />
                <div className="flex flex-col">
                  <span className="font-display text-heading-sm text-neutral-900">{active.name}</span>
                  <span className="mt-0.5 text-caption font-medium uppercase tracking-wide text-neutral-500">
                    {active.role}
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}
