import type { HTMLAttributes, ReactElement } from 'react';
import { cn } from './cn';
import { AlertTriangleIcon, CheckCircleIcon, CircleIcon, ClockIcon, MinusCircleIcon, XCircleIcon } from './icons';

/**
 * Usage:
 *
 *   <Badge status="pending">Pending approval</Badge>
 *   <Badge status="success">Confirmed</Badge>
 *   <Badge status="warning">Overdue return</Badge>
 *   <Badge status="danger">Rejected</Badge>
 *
 * One variant per status color family from docs/design/03-design-system.md §2.3 — never an
 * ad hoc color. Icon + text always render together: §2.3's own accessibility rule
 * ("`REQUESTED` never means reserved … every surface must say so in words") and the
 * warning/pending shared-hue note both require that color is never the only signal.
 *
 * `status="pending"` and `status="warning"` intentionally share the amber hue (§2.3) but
 * use different icons (clock vs. triangle) precisely because color alone can't tell them apart.
 */

export type BadgeStatus = 'neutral' | 'pending' | 'success' | 'danger' | 'warning' | 'inactive';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: BadgeStatus;
}

const statusClasses: Record<BadgeStatus, string> = {
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
  pending: 'bg-status-pending-bg text-status-pending-fg',
  success: 'bg-status-success-bg text-status-success-fg',
  danger: 'bg-status-danger-bg text-status-danger-fg',
  warning: 'bg-status-warning-bg text-status-warning-fg',
  inactive: 'bg-status-inactive-bg text-status-inactive-fg',
};

const statusIcons: Record<BadgeStatus, (props: { className?: string }) => ReactElement> = {
  neutral: CircleIcon,
  pending: ClockIcon,
  success: CheckCircleIcon,
  danger: XCircleIcon,
  warning: AlertTriangleIcon,
  inactive: MinusCircleIcon,
};

export function Badge({ status, className, children, ...props }: BadgeProps) {
  const Icon = statusIcons[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-2 py-0.5',
        'text-caption font-medium leading-none',
        statusClasses[status],
        className,
      )}
      {...props}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span>{children}</span>
    </span>
  );
}
