import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { LanguageSelector } from '../ui/LanguageSelector';

export function AppShell() {
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);
  useEffect(() => {
    const heading = document.querySelector('h1');
    document.title = `${heading?.textContent ?? 'Coordinate. Share. Help.'} · Relay Miden`;
    if (previousPath.current !== pathname) {
      window.scrollTo(0, 0);
      heading?.focus({ preventScroll: true });
      previousPath.current = pathname;
    }
  }, [pathname]);
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="fixed -top-20 left-4 z-50 rounded bg-action px-4 py-3 focus:top-4"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="lg:ml-56">
        <MobileHeader />
        <div className="mx-auto max-w-[1600px] px-4 pb-28 pt-5 md:px-7 lg:px-8 lg:pb-8 lg:pt-6 xl:px-9">
          <div className="mb-5 hidden min-h-11 items-center justify-between gap-3 lg:flex">
            <span className="text-xs font-medium text-muted">
              Works Anyway <span className="mx-2 text-[var(--color-border-strong)]">/</span>{' '}
              Community coordination
            </span>
            <div className="flex items-center gap-4">
              <LanguageSelector />
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xs font-semibold text-[var(--color-on-primary)]"
                aria-label="Demo user avatar"
              >
                AK
              </span>
            </div>
          </div>
          <main id="main-content">
            <Outlet />
          </main>
          <footer className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-[10px] text-muted">
            <span>Relay Miden · When networks fail, communication shouldn’t.</span>
            <span>Phase 2 — local task engine</span>
          </footer>
        </div>
        <MobileBottomNav />
      </div>
    </div>
  );
}
