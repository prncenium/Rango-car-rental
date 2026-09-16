import { create } from 'zustand';
import type { CurrentUser } from '../api/auth.api';

// Session-identity cache, not a source of truth: the server (via the
// httpOnly rgo_at/rgo_rt cookies) is what actually holds the session. This
// store only lets already-fetched identity (from GET /api/auth/me, or the
// abbreviated shape returned by register/login) render without prop-drilling
// or an extra round-trip on every route change.
type AuthState = {
  user: CurrentUser | null;
  status: 'unknown' | 'authenticated' | 'guest';
  setUser: (user: CurrentUser | null) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'unknown',
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'guest' }),
  clear: () => set({ user: null, status: 'guest' }),
}));
