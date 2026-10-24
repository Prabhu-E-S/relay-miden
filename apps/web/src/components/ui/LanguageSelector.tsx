import { Globe2 } from 'lucide-react';
import type { Language } from '@relay-miden/shared';
import { languages } from '../../lib/languages';
import { useLanguage } from '../../hooks/use-language';
export function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  return (
    <label className="flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs font-medium">
      <Globe2 size={16} aria-hidden="true" />
      <span className="sr-only">Interface language</span>
      <select
        className="min-h-10 max-w-28 bg-transparent pr-1"
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        {languages.map((item) => (
          <option key={item.code} value={item.code}>
            {item.native}
          </option>
        ))}
      </select>
    </label>
  );
}
