import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Usage:
 *
 *   <Card>
 *     <CardHeader>
 *       <CardTitle>Honda City 2021</CardTitle>
 *     </CardHeader>
 *     <CardBody>…</CardBody>
 *     <CardFooter>
 *       <Button>Approve</Button>
 *     </CardFooter>
 *   </Card>
 *
 * border-default hairline, no shadow by default — flat cards use a border to do the
 * separation work; shadow signals genuine elevation elsewhere (docs/design/03-design-system.md §6).
 * radius-md per §5.
 */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-md border border-border bg-surface-card shadow-none', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-border px-6 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-display text-heading-md text-neutral-900', className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-end gap-2 border-t border-border px-6 py-4', className)} {...props} />
  );
}
