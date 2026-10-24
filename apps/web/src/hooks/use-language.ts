import { createContext, useContext } from 'react';
import type { Language, StructuredTaskInstruction, Task } from '@relay-miden/shared';
import { labels } from '../lib/languages';
import {
  getDictionary,
  formatStructuredTask,
  formatTaskDisplayTitle,
  type TranslationDictionary,
} from '../i18n';

export interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  dict: TranslationDictionary;
  formatTask: (instruction: StructuredTaskInstruction) => string;
  formatTaskTitle: (task: Task) => string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    // Safe fallback if used outside provider in isolated tests
    const defaultDict = getDictionary('en');
    return {
      language: 'en' as Language,
      setLanguage: () => {},
      dict: defaultDict,
      formatTask: (instruction: StructuredTaskInstruction) =>
        formatStructuredTask(instruction, 'en'),
      formatTaskTitle: (task: Task) => formatTaskDisplayTitle(task, 'en'),
      t: labels.en,
    };
  }
  return {
    ...context,
    t: labels[context.language],
  };
}
