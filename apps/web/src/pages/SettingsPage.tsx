import { useEffect, useState } from 'react';
import { Check, Globe2, ArrowUpRight, Network } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '../components/ui/PageHeader';
import { useLanguage } from '../hooks/use-language';
import { languages } from '../lib/languages';
import { taskRepository } from '../db/task-repository';
export function SettingsPage() {
  const { t, language, setLanguage } = useLanguage();
  const [deviceId, setDeviceId] = useState<string>();

  useEffect(() => {
    let active = true;
    taskRepository.getDeviceId().then(
      (value) => active && setDeviceId(value),
      () => active && setDeviceId(undefined),
    );
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <PageHeader
        title={t.settings}
        description="Make coordination feel familiar. Start with the language you use every day."
      />
      <div className="max-w-xl">
        <section className="panel p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <Globe2 size={18} />
            Interface language
          </h2>
          <fieldset>
            <legend className="sr-only">Choose interface language</legend>
            {languages.map((item) => (
              <label
                key={item.code}
                className="flex min-h-20 cursor-pointer items-center gap-4 border-b border-line px-2 last:border-0 hover:bg-[var(--color-surface-hover)]"
              >
                <input
                  type="radio"
                  name="language"
                  value={item.code}
                  checked={language === item.code}
                  onChange={() => setLanguage(item.code)}
                  className="h-4 w-4 accent-brand"
                />
                <span className="flex-1">
                  <span lang={item.code} className="block text-sm font-medium">
                    {item.native}
                  </span>
                  {item.code !== 'en' && (
                    <span className="mt-1 block text-xs text-muted">{item.name}</span>
                  )}
                </span>
                {language === item.code && (
                  <Check size={18} className="text-brand" aria-hidden="true" />
                )}
              </label>
            ))}
          </fieldset>
          <p role="status" className="mt-4 text-xs leading-relaxed text-muted">
            {languages.find((item) => item.code === language)?.name} navigation selected for this
            session. Only navigation and selected headings are translated. Task templates and
            complete localization arrive in Phase 4.
          </p>
        </section>
        <section className="panel mt-4 p-5">
          <h2 className="text-base font-semibold">Anonymous device identity</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Created once in IndexedDB and used as the author of local tasks. It is not an account
            and is never sent anywhere in Phase 2.
          </p>
          <p
            className="mt-3 break-all font-mono text-[10px] text-brand"
            aria-label="Device identifier"
          >
            {deviceId ?? 'Loading…'}
          </p>
        </section>
        <Link
          to="/connections"
          className="panel mt-4 flex min-h-16 items-center gap-3 p-4 text-sm font-medium"
        >
          <Network size={19} />
          Connection preview
          <ArrowUpRight size={17} className="ml-auto" />
        </Link>
        <div className="mt-6 text-xs leading-relaxed text-muted">
          <p className="font-medium text-brand">Relay Miden · Phase 2</p>
          <p className="mt-2">Works Anyway · Devin Hacks Kochi</p>
          <p>No sign-in. No paid services. Task data stays in this browser.</p>
        </div>
      </div>
    </>
  );
}
