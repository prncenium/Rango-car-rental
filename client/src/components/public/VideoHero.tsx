import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// spec 05-ui-ux-public.md §3.1's video-hero amendment (this session) — a
// looping, muted, autoplaying background video that shrinks continuously
// from full-bleed to an inset, rounded band as the visitor scrolls through
// the first ~70vh past the top of the page, then stays pinned at that
// minimum size. Sourced from an operator-supplied Cloudinary URL — this is a
// one-off marketing asset, not `Car.images`/design/02-image-storage.md's
// owner-upload transport.
const HERO_VIDEO_URL =
  'https://res.cloudinary.com/gitn9iob/video/upload/v1789563548/The_next_chapter_of_Spyker.mp4';

// Extra scroll room (on top of the pinned viewport height) over which the
// shrink completes. Past this, the hero holds at its minimum size until the
// wrapper itself scrolls out of view.
const SCROLL_RANGE_VH = 70;

// Geometry ceilings traced back to docs/design/03-design-system.md so the
// shrunk state never exceeds a token value: `radius-lg` (10px, §5 — "no
// radius above radius-lg is used anywhere") and `space-8` (32px, §4) for the
// inset margin. These are runtime-interpolated numbers, not new ad hoc
// tokens — the ceiling is the token, the animation is the only reason this
// can't be a static Tailwind class.
const MAX_RADIUS_PX = 10;
const MAX_INSET_PX = 32;
const MIN_HEIGHT_VH = 58;

// Mobile (<640px, the `sm` token per docs/design/03-design-system.md §7) skips the
// scroll-driven shrink entirely and holds at the shrunk resting size, same as
// prefers-reduced-motion — tablet/desktop scroll behavior is untouched.
const MOBILE_QUERY = '(max-width: 639px)';

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

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

export function VideoHero({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useIsMobile();

  useEffect(() => {
    // Reduced motion: hold at the shrunk resting size, no scroll-driven
    // interpolation and no autoplay (spec 05 §3.1 amendment).
    if (reducedMotion) {
      setProgress(1);
      return;
    }
    // Mobile: hold full-bleed (no inset/radius/height shrink) instead — only
    // the scroll-driven shrink is removed there, per this session's
    // mobile-UI pass; autoplay is untouched.
    if (isMobile) {
      setProgress(0);
      return;
    }
    let raf = 0;
    function measure() {
      raf = 0;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const scrollRangePx = (SCROLL_RANGE_VH / 100) * window.innerHeight;
      const scrolled = Math.min(Math.max(-rect.top, 0), scrollRangePx);
      setProgress(scrollRangePx > 0 ? scrolled / scrollRangePx : 0);
    }
    function onScrollOrResize() {
      if (raf) return;
      raf = requestAnimationFrame(measure);
    }
    measure();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reducedMotion, isMobile]);

  const inset = progress * MAX_INSET_PX;
  const radius = progress * MAX_RADIUS_PX;
  const heightVh = 100 - progress * (100 - MIN_HEIGHT_VH);
  const contentScale = 1 - progress * 0.06;

  return (
    <div ref={wrapperRef} style={{ height: `calc(100vh + ${SCROLL_RANGE_VH}vh)` }} className="relative">
      <div
        className={`sticky top-0 overflow-hidden bg-brand-primary text-neutral-0 ${progress > 0.05 ? 'shadow-lg' : ''}`}
        style={{
          height: `${heightVh}vh`,
          marginLeft: `${inset}px`,
          marginRight: `${inset}px`,
          borderRadius: `${radius}px`,
        }}
      >
        {!videoFailed && (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={HERO_VIDEO_URL}
            autoPlay={!reducedMotion}
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
            onError={() => setVideoFailed(true)}
          />
        )}
        {/* Legibility scrim over the video — same brand-primary token, not a new color. */}
        <div className="absolute inset-0 bg-brand-primary/45" aria-hidden="true" />
        <div className="relative flex h-full items-end">
          <div
            className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8"
            style={{ transform: `scale(${contentScale})`, transformOrigin: 'bottom left' }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
