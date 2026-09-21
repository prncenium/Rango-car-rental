import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTermsAndConditions } from '../../api/legal';
import { Modal, ModalBody } from '../ui/Modal';

/**
 * Renders docs/legal/terms-and-conditions.md as a readable page inside a
 * modal, rather than linking a raw .md/.txt file. Deliberately a tiny
 * hand-rolled line-by-line renderer (heading markers + list dashes) instead
 * of pulling in a markdown-parser dependency — the source file's own
 * structure is simple enough (headings, plain paragraphs, a "- " list) that
 * a full markdown engine would be a dependency for three regexes.
 */
function renderMarkdownBlocks(markdown: string) {
  const lines = markdown.split('\n');
  const blocks: ReactNode[] = [];
  let bulletBuffer: string[] = [];

  function flushBullets(key: string) {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul key={key} className="mt-2 space-y-1">
        {bulletBuffer.map((text, i) => (
          <li key={i} className="ml-4 list-disc text-body-sm text-neutral-700">
            {text}
          </li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  }

  lines.forEach((line, i) => {
    const bullet = line.match(/^-\s+(.*)/);
    if (bullet) {
      bulletBuffer.push(bullet[1]!);
      return;
    }
    flushBullets(`ul-${i}`);

    const h1 = line.match(/^#\s+(.*)/);
    if (h1) {
      blocks.push(
        <h2 key={i} className="mt-5 font-display text-heading-md text-neutral-900 first:mt-0">
          {h1[1]}
        </h2>,
      );
      return;
    }
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      blocks.push(
        <h3 key={i} className="mt-4 font-display text-heading-sm text-neutral-900">
          {h2[1]}
        </h3>,
      );
      return;
    }
    const h3 = line.match(/^###\s+(.*)/);
    if (h3) {
      blocks.push(
        <h4 key={i} className="mt-4 text-body-md font-semibold text-neutral-800">
          {h3[1]}
        </h4>,
      );
      return;
    }
    if (line.trim() === '') return;
    blocks.push(
      <p key={i} className="mt-2 text-body-sm text-neutral-700">
        {line}
      </p>,
    );
  });
  flushBullets('ul-end');

  return blocks;
}

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
          {query.data && renderMarkdownBlocks(query.data.markdown)}
        </div>
      </ModalBody>
    </Modal>
  );
}
