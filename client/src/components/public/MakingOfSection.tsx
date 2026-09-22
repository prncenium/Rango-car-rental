import { useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../../lib/useIsMobile';

// Editorial "making of" gallery — sits between the video hero and "Recently
// listed" on the homepage, styled after a magazine-style two-column layout
// (eyebrow + heading + copy in one column, images stacked independently in
// the other — each column's items keep their own natural flow, so the two
// columns drift out of vertical sync with each other, the way a masonry
// layout does, rather than forcing every image onto the same grid row).
// Three behaviors, all driven by plain scroll/mouse listeners + raw inline
// styles to match VideoHero's approach (no animation library here):
//   1. First-view reveal: each image expands in (scale + clip-path) the
//      first time the section crosses into the viewport, staggered.
//   2. Cursor wave: while the cursor moves anywhere over the viewport (not
//      just within this tall section), every element in the section —
//      images *and* the heading/copy block — drifts a few px up/down at its
//      own depth. Normalizing against window height (not the section's own,
//      much taller, bounding-box height) is what makes the drift actually
//      perceptible — against the section's own height a viewport-sized mouse
//      movement barely nudges the ratio. A single `waveY` ratio drives every
//      element's transform, each scaled by its own factor, so the whole
//      section reads as one continuous wave rather than independent,
//      disconnected wiggles.
//   3. Ambient float: each image bobs up/down on its own continuous cycle,
//      independent of scroll position or cursor movement — a standalone
//      requestAnimationFrame timer (`ambientT`, elapsed ms since mount)
//      feeds a sine wave per image, staggered by period and phase so the
//      three drift out of sync rather than bobbing in lockstep. Summed into
//      the same `offsetY` the wave/scroll-lift already produce, so it's one
//      unified transform rather than a competing CSS animation. Desktop-only
//      (see `isMobile` gate below), like the other two motion behaviors.
//   4. Scroll lift, same mechanism as VideoHero's shrink (§ its own file):
//      `scrollProgress` tracks how far this section has traveled through the
//      viewport (0 when its top just enters at the bottom, 1 once its bottom
//      has cleared the top), recomputed on every scroll/resize via
//      requestAnimationFrame off `getBoundingClientRect()` — no
//      IntersectionObserver, since that only fires at threshold crossings,
//      not continuously. That ratio lifts the text and every image upward
//      and stretches each image taller from the bottom edge, so the whole
//      section reads as scrolling past faster than the page itself, the way
//      the hero's shrink reads as scroll-linked rather than merely
//      scroll-triggered. Deliberately no CSS transition on these transforms
//      (unlike the reveal's clip-path/opacity) — rAF already updates every
//      frame, and easing on top of a per-frame value makes it visibly lag
//      behind the scroll instead of tracking it.
const TEXT_PARALLAX_FACTOR = 8;
const SCROLL_LIFT_PX = 60;
const IMAGE_STRETCH_MAX = 0.08;
// The wave/scroll-lift transform below is applied to the *image*, not its
// frame, so the frame's overflow-hidden always has something to clip against
// — without this, drifting the transformed box itself left its trailing edge
// uncovered, showing the card's bg-surface-card as a blank strip. This must
// comfortably exceed the largest possible drift (parallaxFactor * 0.5 for
// the wave, plus SCROLL_LIFT_PX, plus the reveal's own 8% shrink).
const IMAGE_OVERSHOOT_PX = 120;
const AMBIENT_FLOAT_AMPLITUDE_PX = 10;
// Each image's own cycle length (ms) — deliberately uneven so the three
// drift out of phase with each other instead of bobbing in lockstep.
const AMBIENT_FLOAT_PERIOD_MS = [3800, 4400, 5000];
const GALLERY_IMAGES: {
  url: string;
  alt: string;
  caption: string;
  aspect: string;
  maxWidth: string;
  parallaxFactor: number;
}[] = [
  {
    url: 'https://res.cloudinary.com/gitn9iob/image/upload/v1789568769/Gemini_Generated_Image_8k07l58k07l58k07.png',
    alt: 'An admin inspecting a car with a clipboard before approving the listing',
    caption: 'Every car is inspected in person before a listing goes live.',
    // Exact art-directed size: 242 × 387.59.
    aspect: 'aspect-[342/487.59]',
    maxWidth: 'max-w-[342px]',
    parallaxFactor: 10,
  },
  {
    url: 'https://res.cloudinary.com/gitn9iob/image/upload/v1789568769/Gemini_Generated_Image_u3f620u3f620u3f6.png',
    alt: 'Close-up detail of a car headlight and grille during inspection',
    caption: 'Admin review, not a stock photo — what you see is the actual car.',
    // Exact art-directed size: 329 × 480.
    aspect: 'aspect-[429/580]',
    maxWidth: 'max-w-[429px]',
    parallaxFactor: -14,
  },
  {
    url: 'https://res.cloudinary.com/gitn9iob/image/upload/v1789568769/Gemini_Generated_Image_9ln6zs9ln6zs9ln6.png',
    alt: 'An admin checking the dashboard and odometer from inside the car',
    caption: 'From listing to handover, nothing goes public without a human check.',
    // Exact art-directed size: 415 × 664.78 — the largest of the three.
    aspect: 'aspect-[515/664.78]',
    maxWidth: 'max-w-[515px]',
    parallaxFactor: 12,
  },
];

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

// Sine-wave offset for one image's continuous idle bob, in px.
function ambientFloatOffset(index: number, elapsedMs: number): number {
  const period = AMBIENT_FLOAT_PERIOD_MS[index] ?? AMBIENT_FLOAT_PERIOD_MS[0]!;
  const phase = index * (Math.PI / 2);
  return Math.sin((elapsedMs / period) * Math.PI * 2 + phase) * AMBIENT_FLOAT_AMPLITUDE_PX;
}

function GalleryImage({
  image,
  index,
  revealed,
  offsetY,
  stretch,
}: {
  image: (typeof GALLERY_IMAGES)[number];
  index: number;
  revealed: boolean;
  offsetY: number;
  stretch: number;
}) {
  return (
    <figure className={`w-full ${image.maxWidth}`}>
      {/* Reveal wrapper — one-time expand-in on first scroll into view. */}
      <div
        className="overflow-hidden rounded-lg bg-surface-card transition-[clip-path,opacity] duration-[900ms] ease-out"
        style={{
          transitionDelay: `${index * 120}ms`,
          clipPath: revealed ? 'inset(0% 0% 0% 0%)' : 'inset(8% 8% 8% 8%)',
          opacity: revealed ? 1 : 0,
        }}
      >
        {/* Static frame — sized only by the aspect ratio, never transformed,
            so it always fully clips the (larger, drifting) image inside it. */}
        <div className={`relative overflow-hidden ${image.aspect}`}>
          {image.url ? (
            <img
              src={image.url}
              alt={image.alt}
              className="absolute left-0 w-full object-cover"
              style={{
                top: `-${IMAGE_OVERSHOOT_PX}px`,
                height: `calc(100% + ${IMAGE_OVERSHOOT_PX * 2}px)`,
                // No transition here (see file header): cursor wave and
                // scroll lift both update every frame already.
                transform: `scale(${revealed ? 1 : 0.92}) translateY(${offsetY}px) scaleY(${1 + stretch})`,
                transformOrigin: 'bottom',
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center border border-dashed border-border text-caption text-neutral-400">
              Image placeholder
            </div>
          )}
        </div>
      </div>
      <figcaption className="mt-3 max-w-[22rem] text-body-sm text-neutral-600">{image.caption}</figcaption>
    </figure>
  );
}

export function MakingOfSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [waveY, setWaveY] = useState(0); // -0.5 .. 0.5, shared by every element's drift
  const [scrollProgress, setScrollProgress] = useState(0); // 0 .. 1 across the section's own scroll traverse
  const reducedMotion = usePrefersReducedMotion();
  // Wave + scroll-lift + ambient float ("floaty") is desktop-only per this
  // session's mobile-UI pass — first-view reveal still runs everywhere.
  const isMobile = useIsMobile();
  const [ambientT, setAmbientT] = useState(0); // ms elapsed since this ran, drives the idle bob

  // Ambient float — its own free-running timer, not tied to scroll/mouse
  // events, so the images keep bobbing even at rest.
  useEffect(() => {
    if (reducedMotion || isMobile) {
      setAmbientT(0);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    function tick(now: number) {
      if (start === null) start = now;
      setAmbientT(now - start);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion, isMobile]);

  // First-view reveal, once.
  useEffect(() => {
    if (reducedMotion) {
      setRevealed(true);
      return;
    }
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reducedMotion]);

  // Scroll lift — same technique as VideoHero's shrink: recompute a 0..1
  // progress from this section's own bounding rect on every scroll/resize,
  // via requestAnimationFrame rather than a transition, so it tracks the
  // scroll position itself instead of merely reacting to it.
  useEffect(() => {
    if (reducedMotion || isMobile) {
      setScrollProgress(0);
      return;
    }
    let raf = 0;
    function measure() {
      raf = 0;
      const node = sectionRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const totalTravel = viewportHeight + rect.height;
      const traveled = viewportHeight - rect.top;
      setScrollProgress(Math.min(Math.max(traveled / totalTravel, 0), 1));
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

  const scrollLift = scrollProgress * SCROLL_LIFT_PX;
  const imageStretch = scrollProgress * IMAGE_STRETCH_MAX;

  // Cursor wave — normalized against the viewport, not this section's own
  // (much taller) height, so the drift responds to ordinary mouse movement.
  function handleMouseMove(event: React.MouseEvent<HTMLElement>) {
    if (reducedMotion || isMobile) return;
    setWaveY(event.clientY / window.innerHeight - 0.5); // -0.5 .. 0.5
  }

  function handleMouseLeave() {
    setWaveY(0);
  }

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      // Deliberate section-level tint + border, not the flat bg-surface-page
      // this shared with the rest of the page — without it, the section had
      // no visual edge and read as an empty gap between VideoHero and
      // ScrollZoomHero rather than a deliberate slab (design fix, not an
      // image: the three art-directed photos already do the visual work
      // here, so more photography would compete rather than help).
      className="relative overflow-hidden border-y border-border bg-surface-sunken"
    >
      {/* Oversized low-opacity numeral, the editorial-margin-note technique —
          fills the large negative space in the copy column without adding
          another photo. Purely decorative, aria-hidden. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-6 top-12 select-none font-display text-[16rem] font-semibold leading-none text-brand-accent/[0.06] sm:text-[22rem]"
      >
        01
      </span>

      <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-16 lg:gap-24">
        {/* Row 1 — copy on the left, image 1 on the right. */}
        <div className="grid grid-cols-1 items-start gap-x-20 gap-y-10 sm:grid-cols-2 lg:gap-x-32">
          <div style={{ transform: `translateY(${waveY * TEXT_PARALLAX_FACTOR - scrollLift}px)` }}>
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-brand-accent" aria-hidden="true" />
              <p className="text-caption font-medium uppercase tracking-wide text-brand-accent">
                Behind every listing
              </p>
            </div>
            <h2 className="mt-4 max-w-md font-display text-display-md text-neutral-900">
              Reviewed by a person, not a form
            </h2>
            <p className="mt-6 max-w-sm text-body-lg leading-relaxed text-neutral-600">
              Before a car appears on Rango, an admin looks at it in person — the photos, the
              mileage, the condition, the paperwork. Not a checkbox on a form, an actual look at
              the actual car.
            </p>
            <p className="mt-5 max-w-sm text-body-md leading-relaxed text-neutral-600">
              It's the same person, not a rotating queue — so the same eye catches the same
              things, listing after listing.
            </p>
          </div>
          <div className="flex justify-start sm:pt-[9.5rem] sm:justify-end">
            <GalleryImage
              image={GALLERY_IMAGES[0]!}
              index={0}
              revealed={revealed}
              offsetY={waveY * GALLERY_IMAGES[0]!.parallaxFactor - scrollLift + ambientFloatOffset(0, ambientT)}
              stretch={imageStretch}
            />
          </div>
        </div>

        {/* Row 2 — image 2 on the left. */}
        <div className="grid grid-cols-1 gap-x-20 sm:grid-cols-2 lg:gap-x-32">
          <div className="flex justify-start sm:-mt-[8.5rem]">
            <GalleryImage
              image={GALLERY_IMAGES[1]!}
              index={1}
              revealed={revealed}
              offsetY={waveY * GALLERY_IMAGES[1]!.parallaxFactor - scrollLift + ambientFloatOffset(1, ambientT)}
              stretch={imageStretch}
            />
          </div>
        </div>

        {/* Row 3 — image 3 back on the right. */}
        <div className="grid grid-cols-1 gap-x-20 sm:grid-cols-2 lg:gap-x-32">
          <div className="flex justify-start sm:-mt-[18.35rem] sm:col-start-2 sm:justify-end">
            <GalleryImage
              image={GALLERY_IMAGES[2]!}
              index={2}
              revealed={revealed}
              offsetY={waveY * GALLERY_IMAGES[2]!.parallaxFactor - scrollLift + ambientFloatOffset(2, ambientT)}
              stretch={imageStretch}
            />
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
