import { NavLink } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { Brand } from '../ui/Brand';
import { navigation } from './navigation';
import { useLanguage } from '../../hooks/use-language';

export function Sidebar() {
  const { t } = useLanguage();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col bg-brand px-4 py-8 text-[var(--color-on-primary)] lg:flex">
      <NavLink to="/" aria-label="Relay Miden home" className="mb-10 px-3">
        <Brand />
      </NavLink>
      <nav aria-label="Main navigation" className="relative z-10 space-y-1">
        {navigation.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="nav-item">
            <Icon size={19} aria-hidden="true" />
            {t[key]}
          </NavLink>
        ))}
      </nav>
      <svg className="sidebar-contours" viewBox="0 0 224 300" fill="none" aria-hidden="true">
        {[0, 22, 44, 66, 88].map((offset) => (
          <path
            key={offset}
            d={`M-30 ${280 - offset} C50 ${130 - offset} 170 ${230 - offset} 250 ${30 - offset}`}
            stroke="currentColor"
          />
        ))}
      </svg>
      <div className="relative mt-auto flex gap-3 border-t border-[var(--color-sidebar-active)] px-3 pt-6">
        <ShieldCheck size={20} className="text-[var(--color-sidebar-muted)]" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Built for offline</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-sidebar-muted)]">
            Tasks are saved locally in IndexedDB.
          </p>
          <p className="mt-3 text-[10px] uppercase tracking-[.13em] text-[var(--color-sidebar-muted)]">
            Phase 02 · Offline tasks
          </p>
        </div>
      </div>
    </aside>
  );
}
