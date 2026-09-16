import { useEffect, useRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { XIcon } from './icons';

/**
 * Usage:
 *
 *   <Modal
 *     open={isOpen}
 *     onClose={() => setIsOpen(false)}
 *     title="Reject this listing?"
 *   >
 *     <ModalBody>
 *       <Textarea label="Reason" required />
 *     </ModalBody>
 *     <ModalFooter>
 *       <Button variant="secondary" onClick={close}>Cancel</Button>
 *       <Button variant="danger" onClick={confirm}>Reject listing</Button>
 *     </ModalFooter>
 *   </Modal>
 *
 * This is the confirmation-modal primitive every state-changing admin action uses
 * (spec 05.5 §0.4 RULE ADM-1). surface-overlay backdrop, shadow-md elevation, radius-md
 * (docs/design/03-design-system.md §2.4, §5, §6). Closes on Escape and backdrop click,
 * traps focus while open, and restores focus to the trigger element on close.
 */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** id for aria-describedby if the caller wants to point at a specific description node */
  descriptionId?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, descriptionId }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2)}`).current;
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const dialogEl = dialogRef.current;
    const firstFocusable = dialogEl?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? dialogEl)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogEl) return;

      const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-surface-overlay" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative z-10 w-full max-w-md rounded-md bg-surface-card shadow-md focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id={titleId} className="font-display text-heading-md text-neutral-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-sm p-1 text-neutral-500 hover:bg-surface-sunken hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-4', className)} {...props} />;
}

export function ModalFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-end gap-2 border-t border-border px-6 py-4', className)} {...props} />
  );
}
