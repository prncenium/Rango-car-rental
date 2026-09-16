import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Shared shell for the three public auth entry points (Login, Register,
 * Reset password). docs/design/03-design-system.md §1: this is the platform's
 * public-facing front door, so it gets a real brand panel — not a bare
 * centered form — while the form itself stays on the flatter, quieter
 * surface-card side. text-display-md is the page-title size the design
 * system reserves for public page titles (§3.2).
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-primary px-12 py-12 text-neutral-0 lg:flex">
        <Link to="/" className="font-display text-heading-md">
          Rango
        </Link>
        <div className="max-w-md">
          <p className="font-display text-display-md leading-tight">Rental, run properly.</p>
          <p className="mt-4 text-body-lg text-neutral-200">
            Every listing is approved by hand and every handover happens in person. No online
            payment, no surprises — just a car and a key, exchanged with someone who checked.
          </p>
        </div>
        <p className="text-body-sm text-neutral-400">© {new Date().getFullYear()} Rango Car Rental</p>
      </div>

      <div className="flex items-center justify-center bg-surface-page px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Link to="/" className="font-display text-heading-md text-brand-primary lg:hidden">
            Rango
          </Link>
          <h1 className="mt-4 font-display text-display-md text-neutral-900 lg:mt-0">{title}</h1>
          <p className="mt-2 text-body-md text-neutral-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
