import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cn } from './cn';
import { FieldChrome, fieldControlClasses, fieldDescribedBy, useFieldId } from './Field';

/**
 * Usage:
 *
 *   <Textarea label="Reason" required errorText="Reason is required" rows={4} />
 *
 * This is the control behind every mandatory-reason confirmation modal
 * (spec 05.5 §0.4 RULE ADM-1 — every state-changing action requires non-empty
 * free text before the confirm button enables).
 *
 * Tokens: surface-sunken background, border-strong default / status-danger-fg on error,
 * focus-ring outline, radius-sm (docs/design/03-design-system.md §2.4, §5).
 */

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  id?: string;
  label?: string | undefined;
  helperText?: string | undefined;
  errorText?: string | undefined;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { id, label, helperText, errorText, required, className, rows = 3, ...props },
  ref,
) {
  const fieldId = useFieldId(id, 'textarea');
  const hasError = Boolean(errorText);

  return (
    <FieldChrome fieldId={fieldId} label={label} helperText={helperText} errorText={errorText} required={required}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={hasError || undefined}
        aria-describedby={fieldDescribedBy(fieldId, Boolean(helperText), hasError)}
        className={cn(fieldControlClasses(hasError), 'resize-y py-2', className)}
        {...props}
      />
    </FieldChrome>
  );
});
