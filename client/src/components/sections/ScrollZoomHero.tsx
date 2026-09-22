import { useRef } from 'react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

// Reusable scroll-driven zoom hero: a tall (200vh) wrapper holds a `sticky`
// panel pinned to the viewport once it reaches the top. The zoom itself is
// driven by the panel's *entry* into the viewport, not by scroll after it's
// already pinned — `offset: ['start end', 'start start']` maps progress 0 to
// the moment the wrapper's top touches the viewport's bottom (panel just
// starting to scroll into view, fully inset) and progress 1 to the moment
// the wrapper's top reaches the viewport's top (panel now fills the screen,
// which is also the instant `sticky` engages). So scrolling slowly down
// through that one viewport-height of travel smoothly fills in the side
// margins and zooms the image to full-bleed in step with the scroll, rather
// than sitting static and snapping once "arrived". `useTransform` clamps by
// default, so progress — and thus the visual state — simply holds at 1
// (full-bleed) for the rest of the pinned traverse, then at 0 once the panel
// has fully scrolled back below the viewport. Being a pure function of
// scroll position (no trigger/one-shot state), it's bidirectional for free:
// scrolling back up through that same viewport-height eases it back to inset.
const INSET_SCALE = 0.85;
const INSET_RADIUS_PX = 10; // radius-lg, docs/design/03-design-system.md §5
const INSET_MARGIN_PX = 32; // space-8, docs/design/03-design-system.md §4

export interface ScrollZoomHeroStat {
  value: string;
  label: string;
}

export interface ScrollZoomHeroProps {
  imageUrl: string;
  imageAlt: string;
  eyebrow?: string;
  heading?: string;
  body?: string;
  /** Buttons/links rendered below the body copy — the section reads as empty without a next step. */
  actions?: ReactNode;
  /** Small trust/stat row rendered below actions, e.g. "Admin-approved · Godown pickup · No online payment". */
  stats?: ScrollZoomHeroStat[];
}

export function ScrollZoomHero({ imageUrl, imageAlt, eyebrow, heading, body, actions, stats }: ScrollZoomHeroProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ['start end', 'start start'],
  });

  const scale = useTransform(scrollYProgress, [0, 1], [INSET_SCALE, 1]);
  const radius = useTransform(scrollYProgress, [0, 1], [INSET_RADIUS_PX, 0]);
  const inset = useTransform(scrollYProgress, [0, 1], [INSET_MARGIN_PX, 0]);

  const copy = (eyebrow || heading || body) && (
    <div className="absolute inset-0 flex items-center">
      {/* Slide-up entrance, desktop only. */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 motion-safe:sm:animate-hero-slide-up">
        {eyebrow && (
          <p className="text-body-md font-medium uppercase tracking-[0.2em] text-brand-accent">{eyebrow}</p>
        )}
        {heading && (
          <h2 className="mt-4 max-w-2xl font-display text-display-lg text-neutral-0 sm:text-display-xl">
            {heading}
          </h2>
        )}
        {body && <p className="mt-5 max-w-lg text-heading-sm font-normal text-neutral-200">{body}</p>}
        {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
        {stats && stats.length > 0 && (
          <dl className="mt-10 flex max-w-lg flex-wrap gap-x-10 gap-y-4 border-t border-neutral-0/15 pt-6">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className="font-display text-heading-md text-neutral-0">{stat.value}</dt>
                <dd className="mt-1 text-body-sm text-neutral-300">{stat.label}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );

  if (reducedMotion) {
    return (
      <section className="relative h-screen w-full overflow-hidden">
        <img src={imageUrl} alt={imageAlt} className="h-full w-full object-cover" />
        {copy}
      </section>
    );
  }

  return (
    <div ref={wrapperRef} className="relative h-[200vh] bg-surface-page">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <motion.div
          className="relative h-full w-full overflow-hidden"
          style={{ scale, borderRadius: radius, marginLeft: inset, marginRight: inset }}
        >
          <img src={imageUrl} alt={imageAlt} className="h-full w-full object-cover" />
          {copy}
        </motion.div>
      </div>
    </div>
  );
}
