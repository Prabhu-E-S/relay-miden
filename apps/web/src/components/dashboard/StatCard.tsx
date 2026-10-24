import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
export function StatCard({
  label,
  shortLabel,
  value,
  icon: Icon,
  warning = false,
  filter,
}: {
  label: string;
  shortLabel: string;
  value: number;
  icon: LucideIcon;
  warning?: boolean;
  filter: string;
}) {
  return (
    <Link
      to={`/tasks?status=${filter}`}
      className="panel group flex min-w-0 items-center gap-4 px-2 py-4 hover:border-[var(--color-border-strong)] md:px-5 md:py-5"
    >
      <Icon
        size={32}
        aria-hidden="true"
        className={`metric-icon hidden md:block ${warning ? 'text-warning' : 'text-brand'}`}
      />
      <div className="min-w-0 flex-1 text-center md:text-left">
        <span
          className={`block text-[26px] font-semibold leading-none tabular-nums md:text-[30px] ${warning ? 'text-warning' : 'text-brand'}`}
        >
          {value}
        </span>
        <span className="mt-2 block text-[10px] md:text-xs">
          <span className="md:hidden">{shortLabel}</span>
          <span className="hidden md:inline">{label}</span>
        </span>
      </div>
      <ChevronRight
        size={15}
        className="hidden self-start text-brand md:block"
        aria-hidden="true"
      />
    </Link>
  );
}
