import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PublicHeader } from '../src/components/public/PublicHeader';
import { useAuthStore } from '../src/store/auth.store';
import type { CurrentUser } from '../src/api/auth.api';
import * as authApi from '../src/api/auth.api';

function baseUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'u1',
    name: 'Test User',
    email: 'test@example.com',
    phone: '+911234567890',
    role: 'USER',
    isActive: true,
    drivingLicence: { numberMasked: '****1234' },
    createdAt: new Date().toISOString(),
    flags: { isOwner: false, isSuperAdmin: false },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Reset the store between tests — it's a module-level singleton.
  useAuthStore.getState().clear();
});

// Regression: AccountShell used to have its own "Log out" button. When it
// was refactored to reuse PublicHeader instead of a second hand-rolled
// header (see AccountShell.tsx's comment), PublicHeader became the only
// place logout is reachable from — this locks that in.
describe('PublicHeader — log out', () => {
  it('logs out and clears the auth store when "Log out" is clicked', async () => {
    const logoutSpy = vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);
    useAuthStore.getState().setUser(baseUser());
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PublicHeader />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(logoutSpy).toHaveBeenCalled();
    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('guest'));
  });
});

// Not in the task plan — added alongside the admin-panel bootstrap work so
// admins have a visible entry point into /admin from the public site.
describe('PublicHeader — admin nav link', () => {
  it('shows "Admin Dashboard" linking to /admin/dashboard for an ADMIN user', () => {
    useAuthStore.getState().setUser(baseUser({ role: 'ADMIN' }));
    render(
      <MemoryRouter>
        <PublicHeader />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link', { name: 'Admin Dashboard' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/admin/dashboard');
    }
  });

  it('shows the link for a SUPER_ADMIN user too (role check is ADMIN|SUPER_ADMIN, not ===ADMIN)', () => {
    useAuthStore.getState().setUser(baseUser({ role: 'SUPER_ADMIN' }));
    render(
      <MemoryRouter>
        <PublicHeader />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link', { name: 'Admin Dashboard' }).length).toBeGreaterThan(0);
  });

  it('does not show the link for a regular USER', () => {
    useAuthStore.getState().setUser(baseUser({ role: 'USER' }));
    render(
      <MemoryRouter>
        <PublicHeader />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'Admin Dashboard' })).not.toBeInTheDocument();
  });

  it('does not show the link for a guest (unauthenticated)', () => {
    useAuthStore.getState().clear();
    render(
      <MemoryRouter>
        <PublicHeader />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'Admin Dashboard' })).not.toBeInTheDocument();
  });
});
