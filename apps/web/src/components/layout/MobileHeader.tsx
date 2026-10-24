import { ArrowLeft, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Brand } from '../ui/Brand';
import { navigation } from './navigation';
import { useLanguage } from '../../hooks/use-language';

export function MobileHeader() {
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const current = navigation.find((item) => item.to === pathname);
  return (
    <header className="flex min-h-20 items-center justify-between gap-3 bg-brand px-5 text-[var(--color-on-primary)] lg:hidden">
      {pathname === '/' ? (
        <Link to="/" aria-label="Relay Miden home">
          <Brand compact />
        </Link>
      ) : (
        <>
          <Link
            to={pathname.startsWith('/tasks/') ? '/tasks' : '/'}
            className="flex min-h-11 min-w-11 items-center"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </Link>
          <span className="text-center text-sm font-medium">
            {current
              ? t[current.key]
              : pathname.startsWith('/tasks/')
                ? 'Task Details'
                : 'Relay Miden'}
          </span>
        </>
      )}
      <Link
        to="/settings"
        aria-label="Open settings"
        className="flex min-h-11 min-w-11 items-center justify-end"
      >
        <Settings size={20} />
      </Link>
    </header>
  );
}
