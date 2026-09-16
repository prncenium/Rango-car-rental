import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser, logout } from '../../api/auth.api';
import { useAuthStore } from '../../store/auth.store';
import { cn } from '../ui/cn';

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
export function AccountShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
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

  useEffect(() => {
    if (status === 'guest') {
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
    }
  }, [status, location.pathname, navigate]);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      clear();
      navigate('/login', { replace: true });
    }
  }

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
      <header className="bg-brand-primary text-neutral-0">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <NavLink to="/" className="font-display text-heading-md">
            Rango
          </NavLink>
          <div className="flex items-center gap-4">
            {user && <span className="hidden text-body-sm text-neutral-0/85 sm:inline">{user.name}</span>}
            <button
              type="button"
              onClick={handleLogout}
              className="text-body-sm text-neutral-0/85 hover:text-neutral-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-10 border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
