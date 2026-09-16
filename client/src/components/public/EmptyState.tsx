import type { ReactNode } from 'react';
import { CarSilhouetteIcon } from '../ui/icons';
import { Button } from '../ui/Button';

// spec 05's empty state ("no cars match your filters") for the search grid;
// also reused for the homepage's "no listings yet" case with different copy.
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void } | undefined;
}): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface-card px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken text-neutral-400">
        <CarSilhouetteIcon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 font-display text-heading-sm text-neutral-900">{title}</h3>
      <p className="mt-1.5 max-w-sm text-body-sm text-neutral-500">{description}</p>
      {action && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
