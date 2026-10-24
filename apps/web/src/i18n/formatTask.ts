import type {
  StructuredTaskInstruction,
  SupportedLanguage,
  Task,
  TaskActionCode,
  TaskItemCode,
  TaskUnitCode,
} from '@relay-miden/shared';
import { enDictionary } from './en';
import { mlDictionary } from './ml';
import { taDictionary } from './ta';
import { sentenceFormatters, type FormattedParts } from './templates';
import type { TranslationDictionary } from './types';

export const dictionaries: Record<SupportedLanguage, TranslationDictionary> = {
  en: enDictionary,
  ml: mlDictionary,
  ta: taDictionary,
};

/**
 * Returns the dictionary for the requested language, with fallback to English.
 */
export function getDictionary(language: SupportedLanguage = 'en'): TranslationDictionary {
  return dictionaries[language] ?? enDictionary;
}

/**
 * Translates an action code with safe fallback.
 */
export function translateActionCode(
  actionCode: TaskActionCode,
  language: SupportedLanguage = 'en',
): string {
  const dict = getDictionary(language);
  return dict.actions[actionCode] ?? actionCode;
}

/**
 * Translates an item code with safe fallback.
 */
export function translateItemCode(
  itemCode: TaskItemCode,
  language: SupportedLanguage = 'en',
): string {
  const dict = getDictionary(language);
  return dict.items[itemCode] ?? itemCode;
}

/**
 * Translates a unit code with safe fallback.
 */
export function translateUnitCode(
  unitCode: TaskUnitCode,
  language: SupportedLanguage = 'en',
): string {
  const dict = getDictionary(language);
  return dict.units[unitCode] ?? unitCode;
}

/**
 * Formats a canonical structured task instruction into natural language for the specified language.
 * Uses language-specific grammatical rules (SVO for English, SOV for Malayalam/Tamil).
 */
export function formatStructuredTask(
  instruction: StructuredTaskInstruction,
  language: SupportedLanguage = 'en',
): string {
  const dict = getDictionary(language);
  const formatter = sentenceFormatters[language] ?? sentenceFormatters.en;

  const actionText = dict.actions[instruction.actionCode] ?? instruction.actionCode;
  const itemText = instruction.itemCode
    ? (dict.items[instruction.itemCode] ?? instruction.itemCode)
    : undefined;
  const unitText = instruction.unitCode
    ? (dict.units[instruction.unitCode] ?? instruction.unitCode)
    : undefined;

  const parts: FormattedParts = {
    actionCode: instruction.actionCode,
    actionText,
    itemCode: instruction.itemCode,
    itemText,
    quantity: instruction.quantity,
    unitCode: instruction.unitCode,
    unitText,
    location: instruction.locationText?.trim() || undefined,
  };

  return formatter(parts);
}

/**
 * Displays the title/instruction for any task.
 * If the task contains a structured instruction, it is formatted dynamically in the chosen language.
 * Legacy tasks return the original user-entered title without modification.
 */
export function formatTaskDisplayTitle(task: Task, language: SupportedLanguage = 'en'): string {
  if (task.instruction) {
    return formatStructuredTask(task.instruction, language);
  }
  return task.title;
}
