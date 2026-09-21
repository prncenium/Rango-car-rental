import { useEffect, useState } from 'react';

// Matches Tailwind's `sm` breakpoint (client/tailwind.config.ts, 640px) —
// "mobile" here means the same viewport range every `sm:`-gated layout
// change elsewhere in this app already treats as mobile.
const MOBILE_QUERY = '(max-width: 639px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
