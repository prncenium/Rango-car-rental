import { useQuery } from '@tanstack/react-query';
import { getTermsAndConditions } from '../../api/legal';
import { renderLegalMarkdown } from '../../lib/renderLegalMarkdown';
import { Modal, ModalBody } from '../ui/Modal';

export function TermsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['terms-and-conditions'],
    queryFn: getTermsAndConditions,
    enabled: open,
    staleTime: Infinity, // static legal text — no reason to refetch within a session
  });

  return (
    <Modal open={open} onClose={onClose} title="Terms & Conditions">
      <ModalBody>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {query.isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-4 animate-pulse rounded-sm bg-surface-sunken" />
              ))}
            </div>
          )}
          {query.isError && (
            <p className="text-body-sm text-status-danger-fg">
              Couldn't load the Terms & Conditions. Please try again shortly.
            </p>
          )}
          {query.data && renderLegalMarkdown(query.data.markdown)}
        </div>
      </ModalBody>
    </Modal>
  );
}
