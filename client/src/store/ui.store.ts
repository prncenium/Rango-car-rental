import { create } from 'zustand';

// Client-only UI state (e.g. sidebar collapse). Never a home for server-derived
// entity state — that always lives in TanStack Query, per docs/design/01-technical-design.md.
type UiState = {
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  isSidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
}));
