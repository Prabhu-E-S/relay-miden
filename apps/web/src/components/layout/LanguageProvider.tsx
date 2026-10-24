import { useState, type ReactNode } from 'react';
import type { Language } from '@relay-miden/shared';
import { LanguageContext } from '../../hooks/use-language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');
  return <LanguageContext value={{ language, setLanguage }}>{children}</LanguageContext>;
}
