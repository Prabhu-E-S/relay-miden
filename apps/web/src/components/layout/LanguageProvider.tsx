import { useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Language, StructuredTaskInstruction, Task } from '@relay-miden/shared';
import { LanguageContext } from '../../hooks/use-language';
import { getDictionary, formatStructuredTask, formatTaskDisplayTitle } from '../../i18n';

export const LANGUAGE_STORAGE_KEY = 'relay-miden-language';

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'en' || saved === 'ml' || saved === 'ta') {
      return saved;
    }
  } catch {
    // Local storage unavailable or restricted
  }
  return 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const setLanguage = useCallback((newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang);
    } catch {
      // Local storage unavailable or restricted
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const dict = getDictionary(language);
  const formatTask = useCallback(
    (instruction: StructuredTaskInstruction) => formatStructuredTask(instruction, language),
    [language],
  );
  const formatTaskTitle = useCallback(
    (task: Task) => formatTaskDisplayTitle(task, language),
    [language],
  );

  return (
    <LanguageContext
      value={{
        language,
        setLanguage,
        dict,
        formatTask,
        formatTaskTitle,
      }}
    >
      {children}
    </LanguageContext>
  );
}
