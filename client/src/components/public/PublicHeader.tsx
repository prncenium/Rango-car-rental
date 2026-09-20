import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { MenuIcon, XIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { getCurrentUser } from '../../api/auth.api';
import { useAuthStore } from '../../store/auth.store';

/**
 * Shared nav chrome for public pages (Home, Search). Racing-green header per
 * docs/design/03-design-system.md §2.1 — the "act here" brass accent stays
 * reserved for the primary CTA, never the nav itself. Mobile menu collapses
 * below `md` (§7).
 */
export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const clear = useAuthStore((state) => state.clear);

  useEffect(() => {
    if (status !== 'unknown') return;
    getCurrentUser()
      .then(setUser)
      .catch(() => clear());
  }, [status, setUser, clear]);

  const isAuthenticated = status === 'authenticated' && user;

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'text-body-md transition-colors',
      isActive ? 'text-brand-accent' : 'text-neutral-0/85 hover:text-neutral-0',
    );

  return (
    <header className="sticky top-0 z-30 bg-brand-primary text-neutral-0">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" onClick={() => setOpen(false)}>
          <img src="/logo.png" alt="Rango Car Rental" className="h-9 w-auto" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/cars" className={navLinkClass}>
            Browse cars
          </NavLink>
          <div className="group relative">
            <button
              type="button"
              className="flex items-center gap-1 py-2 text-body-md text-neutral-0/85 transition-colors hover:text-neutral-0"
            >
              Service
            </button>
            <div className="invisible absolute left-1/2 top-full z-40 w-48 -translate-x-1/2 pt-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <div className="overflow-hidden rounded-md border border-border bg-surface-card py-1 shadow-lg">
                <Link
                  to="/account/bookings"
                  className="block px-4 py-2.5 text-body-sm text-neutral-800 hover:bg-neutral-100"
                >
                  My requests
                </Link>
                <Link
                  to="/account/listings"
                  className="block px-4 py-2.5 text-body-sm text-neutral-800 hover:bg-neutral-100"
                >
                  My listings
                </Link>
              </div>
            </div>
          </div>
          <NavLink to="/about" className={navLinkClass}>
            About us
          </NavLink>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated ? (
            <Link to="/account/bookings" aria-label="Your account">
              <Avatar name={user.name} size="sm" />
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-body-md text-neutral-0/85 hover:text-neutral-0">
                Log in
              </Link>
              <Link to="/register">
                <Button variant="primary" size="sm">
                  Sign up
                </Button>
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="p-2 text-neutral-0 md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <XIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-neutral-0/10 px-4 pb-4 md:hidden">
          <nav className="flex flex-col gap-1 pt-2">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="rounded-sm px-2 py-2.5 text-body-md text-neutral-0/85 hover:bg-neutral-0/10"
            >
              Home
            </Link>
            <Link
              to="/cars"
              onClick={() => setOpen(false)}
              className="rounded-sm px-2 py-2.5 text-body-md text-neutral-0/85 hover:bg-neutral-0/10"
            >
              Browse cars
            </Link>
            <div className="px-2 py-2.5">
              <span className="text-body-md text-neutral-0/85">Service</span>
              <div className="mt-1 flex flex-col gap-1 pl-3">
                <Link
                  to="/account/bookings"
                  onClick={() => setOpen(false)}
                  className="rounded-sm py-1.5 text-body-sm text-neutral-0/70 hover:text-neutral-0"
                >
                  My requests
                </Link>
                <Link
                  to="/account/listings"
                  onClick={() => setOpen(false)}
                  className="rounded-sm py-1.5 text-body-sm text-neutral-0/70 hover:text-neutral-0"
                >
                  My listings
                </Link>
              </div>
            </div>
            <Link
              to="/about"
              onClick={() => setOpen(false)}
              className="rounded-sm px-2 py-2.5 text-body-md text-neutral-0/85 hover:bg-neutral-0/10"
            >
              About us
            </Link>
            <div className="mt-2 flex items-center gap-3 border-t border-neutral-0/10 pt-3">
              {isAuthenticated ? (
                <Link
                  to="/account/bookings"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 text-body-md text-neutral-0/85"
                >
                  <Avatar name={user.name} size="sm" />
                  {user.name}
                </Link>
              ) : (
                <>
                  <Link to="/login" onClick={() => setOpen(false)} className="text-body-md text-neutral-0/85">
                    Log in
                  </Link>
                  <Link to="/register" onClick={() => setOpen(false)} className="flex-1">
                    <Button variant="primary" size="sm" className="w-full">
                      Sign up
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
