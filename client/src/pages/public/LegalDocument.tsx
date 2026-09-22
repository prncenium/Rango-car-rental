import { useQuery } from '@tanstack/react-query';
import { PublicLayout } from './PublicLayout';
import { Card, CardBody } from '../../components/ui';
import { getTermsAndConditions } from '../../api/legal';
import { renderLegalMarkdown } from '../../lib/renderLegalMarkdown';

/**
 * Shared shell for the two full-page views of docs/legal/terms-and-conditions.md
 * (Terms & Conditions, Safety rules & guidelines) — same single source
 * document as TermsModal's popup, just read top-to-bottom as its own page
 * instead of a modal. No PageHero/pre-footer per spec: these are reference
 * pages, not marketing pages.
 */
function LegalDocumentPage({ eyebrow, title }: { eyebrow: string; title: string }) {
  const query = useQuery({
    queryKey: ['terms-and-conditions'],
    queryFn: getTermsAndConditions,
    staleTime: Infinity,
  });

  return (
    <PublicLayout>
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-caption font-medium uppercase tracking-wide text-brand-accent">{eyebrow}</p>
        <h1 className="mt-2 font-display text-display-md text-neutral-900">{title}</h1>
        <p className="mt-3 text-body-md text-neutral-600">
          Please read carefully — these terms and safety rules apply to every Rango Car Rental
          booking.
        </p>

        <Card className="mt-8">
          <CardBody>
            {query.isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-4 animate-pulse rounded-sm bg-surface-sunken" />
                ))}
              </div>
            )}
            {query.isError && (
              <p className="text-body-sm text-status-danger-fg">
                Couldn't load this document. Please try again shortly.
              </p>
            )}
            {query.data && renderLegalMarkdown(query.data.markdown)}
          </CardBody>
        </Card>
      </section>
    </PublicLayout>
  );
}

export function TermsPage() {
  return <LegalDocumentPage eyebrow="Legal" title="Terms & Conditions" />;
}

export function SafetyRulesPage() {
  return <LegalDocumentPage eyebrow="Legal" title="Safety rules & guidelines" />;
}
