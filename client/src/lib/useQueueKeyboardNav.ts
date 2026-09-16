import { useEffect } from 'react';

// spec 05.5 §0.6 — the queue-processing key set (j/k/Enter/a/r/Esc), scoped
// per-page rather than globally. The `g d`/`g l`/... two-key jump chords are
// deliberately not implemented here: they need a chord-sequence detector
// with its own timeout/escape handling, which is more machinery than a
// single-page polish pass warrants — flagged as a gap, not silently dropped.
export interface QueueKeyboardNavOptions {
  rowCount: number;
  focusedIndex: number;
  setFocusedIndex: (updater: (prev: number) => number) => void;
  onOpen?: (index: number) => void;
  onApprove?: (index: number) => void;
  onReject?: (index: number) => void;
  onEscape?: () => void;
  onFocusSearch?: () => void;
  enabled?: boolean;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useQueueKeyboardNav({
  rowCount,
  focusedIndex,
  setFocusedIndex,
  onOpen,
  onApprove,
  onReject,
  onEscape,
  onFocusSearch,
  enabled = true,
}: QueueKeyboardNavOptions) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) {
        if (e.key === 'Escape') onEscape?.();
        return;
      }

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          if (rowCount > 0) {
            e.preventDefault();
            setFocusedIndex((prev) => Math.min(rowCount - 1, prev + 1));
          }
          break;
        case 'k':
        case 'ArrowUp':
          if (rowCount > 0) {
            e.preventDefault();
            setFocusedIndex((prev) => Math.max(0, prev - 1));
          }
          break;
        case 'Enter':
          if (focusedIndex >= 0 && focusedIndex < rowCount) onOpen?.(focusedIndex);
          break;
        case 'a':
          if (focusedIndex >= 0 && focusedIndex < rowCount) onApprove?.(focusedIndex);
          break;
        case 'r':
          if (focusedIndex >= 0 && focusedIndex < rowCount) onReject?.(focusedIndex);
          break;
        case '/':
          if (onFocusSearch) {
            e.preventDefault();
            onFocusSearch();
          }
          break;
        case 'Escape':
          onEscape?.();
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, rowCount, focusedIndex, setFocusedIndex, onOpen, onApprove, onReject, onEscape, onFocusSearch]);
}
