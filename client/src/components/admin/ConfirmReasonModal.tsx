import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, ModalBody, ModalFooter } from '../ui/Modal';
import { Button, Textarea } from '../ui';

/**
 * The one confirmation-modal primitive every state-changing admin action in
 * this file uses (spec 05.5 §0.4 RULE ADM-1: "every state-changing action
 * shows a confirmation modal … the admin UI still requires non-empty free
 * text before the confirm button enables"). Whether that text is actually
 * sent to the server depends on the caller — `reasonRequired` controls both
 * whether the field is labeled "Reason" (server-required, e.g. reject/delist)
 * or "Note" (server-optional-or-absent, UI-required-anyway per RULE ADM-1).
 */
export interface ConfirmReasonModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reasonText: string) => void;
  title: ReactNode;
  description?: ReactNode;
  checklist?: string[];
  reasonLabel?: string;
  reasonRequired?: boolean;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
  isSubmitting?: boolean;
  errorText?: string;
}

export function ConfirmReasonModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  checklist,
  reasonLabel = 'Reason',
  reasonRequired = true,
  confirmLabel,
  confirmVariant = 'primary',
  isSubmitting = false,
  errorText,
}: ConfirmReasonModalProps) {
  const [reasonText, setReasonText] = useState('');

  function handleClose() {
    setReasonText('');
    onClose();
  }

  function handleConfirm() {
    if (!reasonText.trim()) return;
    onConfirm(reasonText.trim());
  }

  const canConfirm = reasonText.trim().length > 0 && !isSubmitting;

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <ModalBody>
        {description && <p className="text-body-sm text-neutral-700">{description}</p>}
        {checklist && checklist.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-body-sm text-neutral-600">
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <Textarea
            label={reasonLabel}
            required={reasonRequired}
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            errorText={errorText}
            rows={4}
            autoFocus
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant={confirmVariant} onClick={handleConfirm} disabled={!canConfirm} isLoading={isSubmitting}>
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
