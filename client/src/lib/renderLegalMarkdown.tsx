import type { ReactNode } from 'react';

/**
 * Renders docs/legal/terms-and-conditions.md as readable blocks — a tiny
 * hand-rolled line-by-line renderer (heading markers + list dashes) instead
 * of a markdown-parser dependency, since the source file's own structure is
 * simple enough (headings, plain paragraphs, a "- " list). Shared by
 * TermsModal (banner popup) and the full Legal pages so there is one
 * renderer for the one source document.
 */
export function renderLegalMarkdown(markdown: string): ReactNode[] {
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
