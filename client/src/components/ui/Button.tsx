import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Usage:
 *
 *   <Button>Save</Button>
 *   <Button variant="secondary">Cancel</Button>
 *   <Button variant="ghost" size="sm">Dismiss</Button>
 *   <Button variant="danger">Reject listing</Button>
 *   <Button isLoading>Confirm booking</Button>
 *
 * Tokens only — see docs/design/03-design-system.md §2, §5, §6.
 * - primary: brand-accent (the one color reserved for "act here" — §2.1, §2.3's
 *   "never used for status" rule)
 * - danger: status-danger family, reused for destructive actions (reject/cancel/terminate)
 * - radius-sm (buttons per §5), shadow-xs only as hover/press micro-feedback (§6)
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-accent text-neutral-0 hover:bg-brand-accent-hover active:bg-brand-accent-active disabled:bg-neutral-300',
  secondary:
    'bg-surface-card text-neutral-800 border border-border-strong hover:bg-surface-sunken active:bg-neutral-200 disabled:text-neutral-400 disabled:border-border',
  ghost:
    'bg-transparent text-brand-primary hover:bg-surface-sunken active:bg-neutral-200 disabled:text-neutral-400',
  danger:
    'bg-status-danger-fg text-neutral-0 hover:shadow-xs active:shadow-none disabled:bg-neutral-300',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-body-sm gap-1.5',
  md: 'h-10 px-4 text-body-md gap-2',
  lg: 'h-12 px-6 text-body-md gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', isLoading = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-sm font-body font-medium',
        'transition-colors duration-100',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {isLoading && (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="10"
            cy="10"
            r="7.5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeOpacity="0.3"
          />
          <path
            d="M17.5 10a7.5 7.5 0 00-7.5-7.5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
});
