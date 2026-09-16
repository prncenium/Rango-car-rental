import type { HTMLAttributes, ReactElement } from 'react';
import { cn } from './cn';
import { CheckCircleIcon, InfoCircleIcon, XCircleIcon, XIcon } from './icons';

/**
 * Usage:
 *
 *   <ToastViewport>
 *     <Toast variant="success" onDismiss={() => remove(id)}>
 *       Booking confirmed. Both parties can now see each other's contact details.
 *     </Toast>
 *     <Toast variant="danger" onDismiss={() => remove(id)}>
 *       This record has already changed. It has been refreshed to its current state.
 *     </Toast>
 *   </ToastViewport>
 *
 * Tokens: status-success/-danger (§2.3) and info-fg/-bg (§2.4, "deliberately blue-grey, not
 * brand blue"), shadow-lg for toast stacks (§6), radius-md (§5). Every variant pairs an icon
 * with text — same "never color alone" rule §2.3 states for badges, applied here too since a
 * toast is transient and easy to miss without a distinct glyph.
 */

export type ToastVariant = 'info' | 'success' | 'danger';

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  variant: ToastVariant;
  onDismiss?: () => void;
}

const variantClasses: Record<ToastVariant, string> = {
  info: 'bg-info-bg text-info-fg',
  success: 'bg-status-success-bg text-status-success-fg',
  danger: 'bg-status-danger-bg text-status-danger-fg',
};

const variantIcons: Record<ToastVariant, (props: { className?: string }) => ReactElement> = {
  info: InfoCircleIcon,
  success: CheckCircleIcon,
  danger: XCircleIcon,
};

export function Toast({ variant, onDismiss, className, children, ...props }: ToastProps) {
  const Icon = variantIcons[variant];

  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      aria-live={variant === 'danger' ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-2 rounded-md px-4 py-3 shadow-lg',
        'text-body-sm',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="shrink-0 rounded-sm p-0.5 hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function ToastViewport({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="region"
      aria-label="Notifications"
      className={cn('fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2', className)}
      {...props}
    />
  );
}
