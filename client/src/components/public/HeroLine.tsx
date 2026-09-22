import type { ReactNode } from 'react';

// Shared building blocks for every hero's staggered entrance (homepage
// VideoHero, PageHero). Desktop only, via the `hero-slide-up` keyframe
// (tailwind.config.ts); `delayMs` staggers each line/element in turn.

// For a single line of plain text (eyebrow, a heading line, subcopy) — masks
// it in an `overflow-hidden` span so it rises up out of a clipped line
// rather than sliding over whatever sits above it. Children must be inline
// (text), never block-level: a <span> can't validly contain a <div>.
export function HeroLine({ delayMs, children }: { delayMs: number; children: ReactNode }) {
  return (
    <span className="block overflow-hidden">
      <span
        className="inline-block motion-safe:sm:animate-hero-slide-up"
        style={{ animationDelay: `${delayMs}ms` }}
      >
        {children}
      </span>
    </span>
  );
}

// For a block of arbitrary content — buttons, form fields, freeform cards.
// No overflow-hidden mask: that wrapper would persist after the animation
// ends and permanently clip focus rings/hover shadows on interactive
// children, so this is a plain fade+slide instead of the masked reveal above.
export function HeroReveal({ delayMs, children }: { delayMs: number; children: ReactNode }) {
  return (
    <div className="motion-safe:sm:animate-hero-slide-up" style={{ animationDelay: `${delayMs}ms` }}>
      {children}
    </div>
  );
}
