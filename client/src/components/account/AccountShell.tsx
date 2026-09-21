import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../../api/auth.api';
import { useAuthStore } from '../../store/auth.store';
import { cn } from '../ui/cn';
import { PublicHeader } from '../public/PublicHeader';
import { PublicFooter } from '../public/PublicFooter';

const NAV_ITEMS = [
  { to: '/account/bookings', label: 'My requests' },
  { to: '/account/listings', label: 'My listings' },
  { to: '/account/profile', label: 'Profile' },
];

// Shared shell for every /account/* route (spec 05 §3's "account shell":
// header + nav, collapsing to a top tab bar below `md`). Resolves the
// 'unknown' session state the same way client/src/pages/public/BookingRequest.tsx
// does, so a page refresh doesn't bounce an authenticated user to /login
// before their session has had a chance to resolve — the server re-checks
// regardless (spec 05 §1: this redirect is a client convenience, not the gate).
//
// Reuses PublicHeader for the top site nav rather than a second, hand-rolled
// copy of it — the previous copy had drifted from PublicHeader (no mobile
// hamburger/menu at all below `md`, a different max-width causing visible
// misalignment against every other page, and no admin-dashboard link) simply
// because there were two headers to keep in sync and only one was. This is
// only the account-specific tab row (My requests/My listings/Profile) below it.
export function AccountShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const setUser = useAuthStore((state) => state.setUser);
  const clear = useAuthStore((state) => state.clear);

  useEffect(() => {
    if (status !== 'unknown') return;
    getCurrentUser()
      .then(setUser)
      .catch(() => clear());
  }, [status, setUser, clear]);

  useEffect(() => {
    if (status === 'guest') {
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
    }
  }, [status, location.pathname, navigate]);

  if (status !== 'authenticated') {
    return null;
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'whitespace-nowrap px-3 py-2.5 text-body-sm font-medium transition-colors',
      isActive
        ? 'border-b-2 border-brand-accent text-brand-primary'
        : 'border-b-2 border-transparent text-neutral-500 hover:text-neutral-800',
    );

  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <PublicHeader />

      <nav className="sticky top-0 z-10 border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </main>

      <PublicFooter />
    </div>
  );
}
