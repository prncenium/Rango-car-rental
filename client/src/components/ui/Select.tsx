import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { cn } from './cn';
import { FieldChrome, fieldControlClasses, fieldDescribedBy, useFieldId } from './Field';

/**
 * Usage:
 *
 *   <Select label="Status" defaultValue="PENDING_APPROVAL">
 *     <option value="PENDING_APPROVAL">Pending approval</option>
 *     <option value="APPROVED">Approved</option>
 *   </Select>
 *
 * A native <select> — full keyboard support (type-ahead, arrow keys) and screen-reader
 * behavior for free, styled to the token set rather than rebuilt as a custom listbox.
 *
 * Tokens: surface-sunken background, border-strong default / status-danger-fg on error,
 * focus-ring outline, radius-sm (docs/design/03-design-system.md §2.4, §5).
 */

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  id?: string;
  label?: string | undefined;
  helperText?: string | undefined;
  errorText?: string | undefined;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { id, label, helperText, errorText, required, className, children, ...props },
  ref,
) {
  const fieldId = useFieldId(id, 'select');
  const hasError = Boolean(errorText);

  return (
    <FieldChrome fieldId={fieldId} label={label} helperText={helperText} errorText={errorText} required={required}>
      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={fieldDescribedBy(fieldId, Boolean(helperText), hasError)}
          className={cn(fieldControlClasses(hasError), 'h-10 appearance-none pr-9', className)}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path d="M5.5 8l4.5 4.5L14.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </FieldChrome>
  );
});
