import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Usage:
 *
 *   <Table>
 *     <TableHead>
 *       <TableRow>
 *         <TableHeaderCell>Car</TableHeaderCell>
 *         <TableHeaderCell>Status</TableHeaderCell>
 *       </TableRow>
 *     </TableHead>
 *     <TableBody>
 *       <TableRow>
 *         <TableCell>Honda City 2021</TableCell>
 *         <TableCell><Badge status="pending">Pending</Badge></TableCell>
 *       </TableRow>
 *     </TableBody>
 *   </Table>
 *
 * radius-none per docs/design/03-design-system.md §5 ("admin data-dense chrome"), dense row
 * styling using text-body-sm per §3.2 ("dense admin tables"). Plain semantic <table> — no
 * custom listbox/grid re-implementation, so screen readers get native table navigation for free.
 */

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-none border border-border">
      <table className={cn('w-full border-collapse text-body-sm', className)} {...props} />
    </div>
  );
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-surface-sunken', className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('hover:bg-surface-sunken', className)} {...props} />;
}

export function TableHeaderCell({ className, scope = 'col', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={cn(
        'px-3 py-2 text-left text-caption font-semibold uppercase tracking-wide text-neutral-600',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2 text-neutral-800', className)} {...props} />;
}

export function TableCaption({ className, ...props }: HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={cn('sr-only', className)} {...props} />;
}
