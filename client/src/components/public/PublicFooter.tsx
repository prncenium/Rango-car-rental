import { Link } from 'react-router-dom';

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-surface-card">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-display text-heading-sm text-brand-primary">Rango</span>
            <p className="mt-1 text-body-sm text-neutral-500">
              Every listing admin-approved. Every handover, in person.
            </p>
          </div>
          <nav className="flex gap-6 text-body-sm text-neutral-600">
            <Link to="/" className="hover:text-brand-primary">
              Home
            </Link>
            <Link to="/cars" className="hover:text-brand-primary">
              Browse cars
            </Link>
            <Link to="/login" className="hover:text-brand-primary">
              Log in
            </Link>
          </nav>
        </div>
        <p className="mt-8 text-caption text-neutral-400">
          © {new Date().getFullYear()} Rango Car Rental. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
