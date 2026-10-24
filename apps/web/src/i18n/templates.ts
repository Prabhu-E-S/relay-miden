import type {
  SupportedLanguage,
  TaskActionCode,
  TaskItemCode,
  TaskUnitCode,
} from '@relay-miden/shared';

export interface FormattedParts {
  actionCode: TaskActionCode;
  actionText: string;
  itemCode?: TaskItemCode | undefined;
  itemText?: string | undefined;
  quantity?: number | undefined;
  unitCode?: TaskUnitCode | undefined;
  unitText?: string | undefined;
  location?: string | undefined;
}

export type SentenceTemplateFn = (parts: FormattedParts) => string;

/**
 * English SVO Sentence Template Formatter
 */
export function formatEnglishSentence(parts: FormattedParts): string {
  const { actionCode, actionText, itemText, quantity, unitText, location } = parts;

  // Build the object phrase (e.g., "20 bottles of water")
  let objectPhrase = '';
  if (quantity !== undefined && unitText && itemText) {
    objectPhrase = `${quantity} ${unitText.toLowerCase()} of ${itemText.toLowerCase()}`;
  } else if (quantity !== undefined && unitText) {
    objectPhrase = `${quantity} ${unitText.toLowerCase()}`;
  } else if (quantity !== undefined && itemText) {
    objectPhrase = `${quantity} ${itemText.toLowerCase()}`;
  } else if (itemText) {
    objectPhrase = itemText.toLowerCase();
  }

  // Preposition depending on action
  let preposition = 'at';
  if (actionCode === 'DELIVER' || actionCode === 'TRANSPORT') {
    preposition = 'to';
  } else if (actionCode === 'COLLECT') {
    preposition = 'from';
  }

  const locationPhrase = location ? `${preposition} ${location}` : '';

  if (objectPhrase && locationPhrase) {
    return `${actionText} ${objectPhrase} ${locationPhrase}.`;
  }
  if (objectPhrase) {
    return `${actionText} ${objectPhrase}.`;
  }
  if (locationPhrase) {
    return `${actionText} ${locationPhrase}.`;
  }
  return `${actionText}.`;
}

/**
 * Malayalam SOV Sentence Template Formatter
 * SOV order: [Location] [Quantity] [Unit] [Item] [Action Verb].
 */
export function formatMalayalamSentence(parts: FormattedParts): string {
  const { actionCode, actionText, itemText, quantity, unitText, location } = parts;

  // Build location with appropriate Malayalam postposition
  let locationPhrase = '';
  if (location) {
    if (actionCode === 'DELIVER' || actionCode === 'TRANSPORT') {
      locationPhrase = `${location}-ലേക്ക്`;
    } else if (actionCode === 'COLLECT') {
      locationPhrase = `${location}-ൽ നിന്ന്`;
    } else {
      locationPhrase = `${location}-ൽ`;
    }
  }

  // Build the object phrase (e.g., "20 കുപ്പി വെള്ളം")
  const objectParts: string[] = [];
  if (quantity !== undefined) {
    objectParts.push(String(quantity));
  }
  if (unitText) {
    objectParts.push(unitText);
  }
  if (itemText) {
    objectParts.push(itemText);
  }
  const objectPhrase = objectParts.join(' ');

  const sentenceParts: string[] = [];
  if (locationPhrase) {
    sentenceParts.push(locationPhrase);
  }
  if (objectPhrase) {
    sentenceParts.push(objectPhrase);
  }
  sentenceParts.push(actionText);

  return `${sentenceParts.join(' ')}.`;
}

/**
 * Tamil SOV Sentence Template Formatter
 * SOV order: [Location] [Quantity] [Unit] [Item] [Action Verb].
 */
export function formatTamilSentence(parts: FormattedParts): string {
  const { actionCode, actionText, itemText, quantity, unitText, location } = parts;

  // Build location with appropriate Tamil postposition
  let locationPhrase = '';
  if (location) {
    if (actionCode === 'DELIVER' || actionCode === 'TRANSPORT') {
      locationPhrase = `${location}-க்கு`;
    } else if (actionCode === 'COLLECT') {
      locationPhrase = `${location}-லிருந்து`;
    } else {
      locationPhrase = `${location}-ல்`;
    }
  }

  // Build the object phrase (e.g., "20 பாட்டில் தண்ணீர்")
  const objectParts: string[] = [];
  if (quantity !== undefined) {
    objectParts.push(String(quantity));
  }
  if (unitText) {
    objectParts.push(unitText);
  }
  if (itemText) {
    objectParts.push(itemText);
  }
  const objectPhrase = objectParts.join(' ');

  const sentenceParts: string[] = [];
  if (locationPhrase) {
    sentenceParts.push(locationPhrase);
  }
  if (objectPhrase) {
    sentenceParts.push(objectPhrase);
  }
  sentenceParts.push(actionText);

  return `${sentenceParts.join(' ')}.`;
}

export const sentenceFormatters: Record<SupportedLanguage, SentenceTemplateFn> = {
  en: formatEnglishSentence,
  ml: formatMalayalamSentence,
  ta: formatTamilSentence,
};
