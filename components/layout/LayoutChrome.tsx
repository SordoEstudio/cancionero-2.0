'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { UserMenu } from '@/components/auth/UserMenu';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/** True si no hay barra superior fija (vista canción o scroll hacia abajo en el resto). */
const TopNavHiddenContext = createContext(false);

export function useTopNavHidden() {
  return useContext(TopNavHiddenContext);
}

export function LayoutChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSongView = pathname.startsWith('/song/');

  const [topNavHidden, setTopNavHidden] = useState(false);
  const lastYRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (isSongView) return;

    lastYRef.current = window.scrollY;

    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const y = window.scrollY;
        const prev = lastYRef.current;
        const delta = y - prev;
        lastYRef.current = y;

        if (y < 8) {
          setTopNavHidden(false);
          return;
        }
        if (Math.abs(delta) < 6) return;

        if (delta > 0 && y > 72) setTopNavHidden(true);
        else if (delta < 0) setTopNavHidden(false);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [isSongView]);

  const layoutNavVisible = !isSongView;
  const stickyOffsetHidden = isSongView || topNavHidden;

  return (
    <TopNavHiddenContext.Provider value={stickyOffsetHidden}>
      {layoutNavVisible ? (
        <nav
          className={[
            'fixed left-0 right-0 top-0 z-50 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-base)] px-4 py-2 transition-transform duration-200 ease-out',
            topNavHidden ? '-translate-y-full' : 'translate-y-0',
          ].join(' ')}
          aria-label="Navegación principal"
        >
          <a
            href="/"
            className="min-w-0 truncate font-bold text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]"
          >
            🎸 Cancionero Pro
          </a>
          <div className="flex shrink-0 items-center gap-1">
            <UserMenu />
            <ThemeToggle />
          </div>
        </nav>
      ) : null}
      <div className={layoutNavVisible ? 'h-[52px] shrink-0' : 'h-0 shrink-0'} aria-hidden />
      {children}
    </TopNavHiddenContext.Provider>
  );
}
