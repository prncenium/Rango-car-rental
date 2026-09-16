import type { SVGProps } from 'react';

/**
 * Minimal inline icon set for status communication (docs/design/03-design-system.md §2.3:
 * "distinguished by an icon, never color alone"). No icon library is installed — these are
 * deliberately tiny (stroke-based, currentColor) so status meaning survives grayscale/colorblind
 * viewing without adding a dependency for a handful of glyphs.
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 20 20',
  fill: 'none',
  'aria-hidden': true,
  focusable: false,
} as const;

export function CircleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.5V10l2.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.2 10.2l1.9 1.9 3.7-4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function XCircleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.8 7.8l4.4 4.4M12.2 7.8l-4.4 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path
        d="M10 3.5l7.5 13H2.5l7.5-13z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 8.25v3.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="14.25" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MinusCircleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 10h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function InfoCircleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 9v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="6.75" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Public-site icon set (search/browse, hero, filter drawer). Same
 * stroke-based, currentColor, no-dependency approach as the status set above.
 */

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13.2 13.2L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h8M15 6h1M4 14h1M8 14h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="11" cy="6" r="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <circle cx="5" cy="14" r="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path
        d="M10 17.5s6-5.3 6-9.7a6 6 0 10-12 0c0 4.4 6 9.7 6 9.7z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="7.8" r="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function SeatIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path
        d="M6.5 3.5v8a2 2 0 002 2h3a2 2 0 002-2V9M6.5 3.5H9M14.5 9V6.5a2 2 0 00-2-2H10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5.5 13.5v2.2M14.5 13.5v2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function FuelIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="8" height="13" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 6.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M11.5 7.5h1.2l2 2v4.3a1.3 1.3 0 002.6 0V9.2a1.5 1.5 0 00-.44-1.06L15.5 6.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 3.5v2M10 14.5v2M16.5 10h-2M5.5 10h-2M14.7 5.3l-1.4 1.4M6.7 13.3l-1.4 1.4M14.7 14.7l-1.4-1.4M6.7 6.7L5.3 5.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12.5 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CarSilhouetteIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path
        d="M3 12.5l1.3-4.2a2 2 0 011.9-1.4h7.6a2 2 0 011.9 1.4l1.3 4.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="2.2" y="12.5" width="15.6" height="3.3" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="15.8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="15.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path
        d="M10 2.8l6 2.2v4.4c0 4-2.6 6.9-6 7.8-3.4-.9-6-3.8-6-7.8V5l6-2.2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M7.3 10.1l1.9 1.9 3.7-4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HandshakeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path
        d="M2.5 9.5l3-2.3a1.6 1.6 0 012 .1l1.2 1 1.2-1a1.6 1.6 0 012-.1l3 2.3M6 8l3 3M14 8l-3 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.3 11.3l.7.7a1.4 1.4 0 002 0 1.4 1.4 0 002 0l.7-.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4.5" width="14" height="12" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 8h14M6.5 2.8v3M13.5 2.8v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function BadgePercentIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.2 12.8l5.6-5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="7.6" cy="7.6" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.4" cy="12.4" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
