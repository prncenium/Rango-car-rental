import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from './cn';
import { FieldChrome, fieldControlClasses, fieldDescribedBy, useFieldId } from './Field';

/**
 * Usage:
 *
 *   <Input label="Registration number" placeholder="RJ14AB1234" />
 *   <Input label="Amount" type="number" required errorText="Amount must be greater than 0" />
 *   <Input label="Reference note" helperText="Optional, shown to the owner" />
 *
 * Tokens: surface-sunken background, border-strong default / status-danger-fg on error,
 * focus-ring outline, radius-sm (docs/design/03-design-system.md §2.4, §5).
 */

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id?: string;
  label?: string | undefined;
  helperText?: string | undefined;
  errorText?: string | undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, helperText, errorText, required, className, ...props },
  ref,
) {
  const fieldId = useFieldId(id, 'input');
  const hasError = Boolean(errorText);

  return (
    <FieldChrome fieldId={fieldId} label={label} helperText={helperText} errorText={errorText} required={required}>
      <input
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={hasError || undefined}
        aria-describedby={fieldDescribedBy(fieldId, Boolean(helperText), hasError)}
        className={cn(fieldControlClasses(hasError), 'h-10', className)}
        {...props}
      />
    </FieldChrome>
  );
});
