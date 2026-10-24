import { House, Plus, ScanLine, ClipboardList, Settings } from 'lucide-react';
import { NavLink } from 'react-router';
import { useLanguage } from '../../hooks/use-language';
const items = [
  { to: '/', key: 'home', icon: House },
  { to: '/create', key: 'create', icon: Plus },
  { to: '/receive', key: 'scan', icon: ScanLine },
  { to: '/tasks', key: 'tasks', icon: ClipboardList },
  { to: '/settings', key: 'settings', icon: Settings },
] as const;
export function MobileBottomNav() {
  const { t } = useLanguage();
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map(({ to, key, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className="mobile-nav-link">
          {key === 'scan' ? (
            <span className="-mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand text-[var(--color-on-primary)]">
              <Icon size={21} aria-hidden="true" />
            </span>
          ) : (
            <Icon size={20} aria-hidden="true" />
          )}
          <span className="max-w-full break-words px-0.5 text-center">{t[key]}</span>
        </NavLink>
      ))}
    </nav>
  );
}
