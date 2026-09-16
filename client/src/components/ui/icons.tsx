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
