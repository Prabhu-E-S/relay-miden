import { createContext, useContext } from 'react';
import type { Language } from '@relay-miden/shared';
import { labels } from '../lib/languages';
export const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
} | null>(null);
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('Language controls require LanguageProvider.');
  return { ...context, t: labels[context.language] };
}
