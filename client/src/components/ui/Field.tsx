import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Shared label/helper/error chrome for Input, Textarea, Select — kept in one
 * place so field-level error presentation (spec 05.5 §0.3: "Never a toast alone —
 * the offending field is highlighted") stays consistent across all three.
 *
 * Not exported from the ui barrel directly for standalone use — Input/Textarea/Select
 * each wrap it and forward `id`/`aria-describedby` wiring.
 */
export interface FieldChromeProps {
  fieldId: string;
  label?: ReactNode;
  helperText?: ReactNode;
  errorText?: ReactNode;
  required?: boolean | undefined;
  children: ReactNode;
}

export function fieldDescribedBy(fieldId: string, hasHelper: boolean, hasError: boolean): string | undefined {
  const ids = [hasError && `${fieldId}-error`, hasHelper && `${fieldId}-helper`].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export function FieldChrome({ fieldId, label, helperText, errorText, required, children }: FieldChromeProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-body-sm font-medium text-neutral-700">
          {label}
          {required && (
            <span className="ml-0.5 text-status-danger-fg" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {errorText && (
        <p id={`${fieldId}-error`} role="alert" className="text-body-sm text-status-danger-fg">
          {errorText}
        </p>
      )}
      {!errorText && helperText && (
        <p id={`${fieldId}-helper`} className="text-body-sm text-neutral-500">
          {helperText}
        </p>
      )}
    </div>
  );
}

export function useFieldId(providedId: string | undefined, prefix: string): string {
  const generated = useId();
  return providedId ?? `${prefix}-${generated}`;
}

export const fieldControlClasses = (hasError: boolean) =>
  cn(
    'w-full rounded-sm bg-surface-sunken px-3 text-body-md text-neutral-800',
    'border',
    hasError ? 'border-status-danger-fg' : 'border-border-strong',
    'placeholder:text-neutral-400',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2',
    'disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed',
  );
