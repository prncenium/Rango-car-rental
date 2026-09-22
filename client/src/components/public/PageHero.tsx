import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { HeroLine, HeroReveal } from './HeroLine';

const SLIDE_INTERVAL_MS = 2500;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

// docs/design/04-hero-sections.md — shared static hero band for public pages
// other than Home (which keeps its own scroll-linked VideoHero). No
// background image is wired in yet for any caller; `backgroundImage` stays
// optional and falls back to the flat brand-primary surface until real
// photography is chosen per page.
export function PageHero({
  breadcrumb,
  eyebrow,
  title,
  subcopy,
  backgroundImage,
  backgroundImages,
  actions,
  content,
  overlayClassName,
}: {
  /** Rendered above eyebrow/title, e.g. a "Cars / Model name" trail. */
  breadcrumb?: ReactNode;
  eyebrow?: string;
  title: ReactNode;
  subcopy?: string;
  backgroundImage?: string;
  /** 2+ images to crossfade through every 3s. Takes precedence over `backgroundImage`. Frozen on the first image when the visitor prefers reduced motion. */
  backgroundImages?: string[];
  actions?: ReactNode;
  /** Freeform block rendered below actions (e.g. a quick-search card) — its own layout, no wrapper styling. */
  content?: ReactNode;
  /** Overrides the default `bg-neutral-900/55` legibility scrim — for a background photo dark enough on its own that the default scrim would hide it entirely. */
  overlayClassName?: string;
}) {
  const slides = backgroundImages && backgroundImages.length > 0 ? backgroundImages : backgroundImage ? [backgroundImage] : [];
  const reducedMotion = usePrefersReducedMotion();
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (slides.length < 2 || reducedMotion) return;
    const id = setInterval(() => {
      setActiveSlide((i) => (i + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [slides.length, reducedMotion]);

  return (
    <div className="relative flex min-h-[340px] items-center bg-brand-primary sm:min-h-[440px] lg:min-h-[800px]">
      {slides.map((src, i) => (
        <div
          key={src}
          aria-hidden={i !== activeSlide}
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${
            i === activeSlide ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ backgroundImage: `url(${src})` }}
        />
      ))}
      {/* Legibility scrim — same surface-overlay token regardless of whether
          a background image is present, so contrast never regresses once one is added. */}
      <div className={`absolute inset-0 ${overlayClassName ?? 'bg-neutral-900/55'}`} aria-hidden="true" />
      {/* Staggered slide-up entrance, desktop only — each field its own
          HeroLine (masked, for plain text) or HeroReveal (unmasked, for
          breadcrumb/actions/content, which can hold interactive children a
          permanent overflow-hidden mask would clip). */}
      <div className="relative mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {breadcrumb && (
          <HeroReveal delayMs={0}>
            <div className="mb-3">{breadcrumb}</div>
          </HeroReveal>
        )}
        {eyebrow && (
          <p className="text-caption uppercase tracking-wide text-brand-accent lg:text-body-sm">
            <HeroLine delayMs={100}>{eyebrow}</HeroLine>
          </p>
        )}
        <h1 className="mt-2 font-display text-display-md text-neutral-0 lg:mt-4 lg:text-display-lg">
          <HeroLine delayMs={250}>{title}</HeroLine>
        </h1>
        {subcopy && (
          <p className="mt-3 max-w-2xl text-body-lg text-neutral-100 lg:mt-5 lg:max-w-3xl lg:text-heading-sm lg:font-normal">
            <HeroLine delayMs={400}>{subcopy}</HeroLine>
          </p>
        )}
        {actions && (
          <HeroReveal delayMs={550}>
            <div className="mt-6 flex flex-wrap gap-3 lg:mt-8">{actions}</div>
          </HeroReveal>
        )}
        {content && (
          <HeroReveal delayMs={700}>
            <div className="mt-8 lg:mt-10">{content}</div>
          </HeroReveal>
        )}
      </div>
    </div>
  );
}
