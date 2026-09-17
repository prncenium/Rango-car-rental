import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCurrentUser, logout } from '../../api/auth.api';
import { getDashboardCounts } from '../../api/admin';
import { useAuthStore } from '../../store/auth.store';
import { cn } from '../ui/cn';

// Admin layout per spec 05.5 §0.7's sidebar wireframe and §7 (docs/design
// §7) — desktop-first: persistent sidebar from `lg` (1024px) up, collapsible
// overlay below `md` per the design system's admin breakpoint note.
// Sidebar badge counts poll GET /api/admin/dashboard/counts every 30s
// (spec 05.5 §0.7 OPEN QUESTION ADM-OQ-2 assumes 30s, unspecified upstream).
const POLL_INTERVAL_MS = 30_000;

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: 'Dashboard', countKey: null as null },
  { to: '/admin/listings', label: 'Listings', countKey: 'listingsPending' as const },
  { to: '/admin/bookings', label: 'Bookings', countKey: 'bookingsRequested' as const },
  { to: '/admin/calendar', label: 'Calendar', countKey: null as null },
  { to: '/admin/users', label: 'Users', countKey: null as null },
  { to: '/admin/audit', label: 'Audit Log', countKey: null as null },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
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

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (status === 'authenticated' && !isAdmin) {
      navigate('/', { replace: true });
    }
  }, [status, isAdmin, navigate]);

  const countsQuery = useQuery({
    queryKey: ['admin-dashboard-counts'],
    queryFn: getDashboardCounts,
    enabled: status === 'authenticated' && isAdmin,
    refetchInterval: POLL_INTERVAL_MS,
  });

  if (status !== 'authenticated' || !isAdmin) {
    return null;
  }

  const counts = countsQuery.data;

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center justify-between rounded-sm px-3 py-2 text-body-sm font-medium transition-colors',
      isActive ? 'bg-brand-primary-hover text-neutral-0' : 'text-neutral-0/80 hover:bg-brand-primary-hover hover:text-neutral-0',
    );

  async function handleLogout() {
    try {
      await logout();
    } finally {
      clear();
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen bg-surface-page">
      <aside className="hidden w-64 shrink-0 flex-col bg-brand-primary px-3 py-4 text-neutral-0 lg:flex">
        <div className="flex items-center gap-2 px-2 pb-4">
          <img src="/logo.png" alt="Rango Car Rental" className="h-7 w-auto" />
          <span className="text-caption font-medium uppercase tracking-wide text-neutral-0/70">Admin</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const count = item.countKey ? counts?.queues[item.countKey] : undefined;
            return (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                <span>{item.label}</span>
                {typeof count === 'number' && count > 0 && (
                  <span className="rounded-full bg-brand-accent px-2 py-0.5 text-caption font-semibold text-neutral-0">
                    {count}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-4 border-t border-neutral-0/15 px-2 pt-4">
          <p className="truncate text-body-sm text-neutral-0/85">{user?.name}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 text-body-sm text-neutral-0/70 hover:text-neutral-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Below `lg`: a top bar with the same nav, collapsing per docs/design/03-design-system.md §7 */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-brand-primary px-4 text-neutral-0 lg:hidden">
        <div className="flex items-center gap-1.5">
          <img src="/logo.png" alt="Rango Car Rental" className="h-6 w-auto" />
          <span className="text-caption font-medium uppercase tracking-wide text-neutral-0/70">Admin</span>
        </div>
        <nav className="flex items-center gap-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn('text-body-sm', isActive ? 'text-brand-accent' : 'text-neutral-0/80')}
            >
              {item.label}
            </NavLink>
          ))}
          <button type="button" onClick={handleLogout} className="text-body-sm text-neutral-0/70">
            Log out
          </button>
        </nav>
      </header>

      <main className="min-w-0 flex-1 pt-14 lg:pt-0">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
