import { Link } from 'react-router-dom';

const linkClass = 'text-body-sm text-neutral-0/70 transition-colors hover:text-neutral-0';

export function PublicFooter() {
  return (
    <footer className="border-t border-neutral-0/10 bg-brand-primary text-neutral-0">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link to="/" className="inline-flex items-center">
              <img src="/logo.png" alt="Rango Car Rental" className="h-9 w-auto" />
            </Link>
            <p className="mt-4 max-w-sm text-body-md text-neutral-0/70">
              Every listing admin-approved. Every handover, in person. No online payment, no
              middleman apps — just a real car and a real person.
            </p>
          </div>

          {/* Explore */}
          <div>
            <h3 className="text-caption font-medium uppercase tracking-wide text-neutral-0/50">
              Explore
            </h3>
            <nav className="mt-4 flex flex-col gap-3">
              <Link to="/" className={linkClass}>
                Home
              </Link>
              <Link to="/cars" className={linkClass}>
                Browse cars
              </Link>
              <Link to="/about" className={linkClass}>
                About us
              </Link>
            </nav>
          </div>

          {/* Account */}
          <div>
            <h3 className="text-caption font-medium uppercase tracking-wide text-neutral-0/50">
              Account
            </h3>
            <nav className="mt-4 flex flex-col gap-3">
              <Link to="/login" className={linkClass}>
                Log in
              </Link>
              <Link to="/register" className={linkClass}>
                Sign up
              </Link>
              <Link to="/account/listings/new" className={linkClass}>
                List your car
              </Link>
            </nav>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-neutral-0/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-neutral-0/50">
            © {new Date().getFullYear()} Rango Car Rental. All rights reserved.
          </p>
          <p className="text-caption text-neutral-0/50">Built by @prncenium</p>
        </div>
      </div>
    </footer>
  );
}
