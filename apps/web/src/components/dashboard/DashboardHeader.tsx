import { useLanguage } from '../../hooks/use-language';
export function DashboardHeader() {
  const { t } = useLanguage();
  return (
    <div className="relative mb-6">
      <p className="mb-1 text-xl font-semibold tracking-tight md:hidden">{t.greeting}</p>
      <h1
        tabIndex={-1}
        className="text-sm font-normal text-muted md:text-[30px] md:font-semibold md:leading-tight md:text-ink"
      >
        {t.headline}
      </h1>
      <p className="mt-2 hidden max-w-3xl text-[13px] leading-relaxed text-muted md:block">
        Create and share tasks even without internet, no shared network, and across languages.
      </p>
      <p className="mt-3 text-[10px] uppercase tracking-[.12em] text-muted">
        Local workspace · Saved on this device
      </p>
    </div>
  );
}
