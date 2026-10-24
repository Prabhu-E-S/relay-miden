import { describe, expect, it } from 'vitest';
import {
  TASK_ACTION_CODES,
  TASK_ITEM_CODES,
  TASK_UNIT_CODES,
  type StructuredTaskInstruction,
  type Task,
} from '@relay-miden/shared';
import { enDictionary } from './en';
import { mlDictionary } from './ml';
import { taDictionary } from './ta';
import {
  formatStructuredTask,
  formatTaskDisplayTitle,
  getDictionary,
  translateActionCode,
  translateItemCode,
  translateUnitCode,
} from './formatTask';

describe('Phase 4: Multilingual Translation Dictionaries', () => {
  const dictionaries = [
    { lang: 'en', dict: enDictionary },
    { lang: 'ml', dict: mlDictionary },
    { lang: 'ta', dict: taDictionary },
  ] as const;

  it('all supported languages have complete dictionaries with identical key structures', () => {
    const enKeys = Object.keys(enDictionary).sort();
    const mlKeys = Object.keys(mlDictionary).sort();
    const taKeys = Object.keys(taDictionary).sort();

    expect(mlKeys).toEqual(enKeys);
    expect(taKeys).toEqual(enKeys);
  });

  it('all action codes have translations in every supported language', () => {
    for (const { lang, dict } of dictionaries) {
      for (const code of TASK_ACTION_CODES) {
        expect(dict.actions[code], `Missing action ${code} in ${lang}`).toBeDefined();
        expect(dict.actions[code].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('all item codes have translations in every supported language', () => {
    for (const { lang, dict } of dictionaries) {
      for (const code of TASK_ITEM_CODES) {
        expect(dict.items[code], `Missing item ${code} in ${lang}`).toBeDefined();
        expect(dict.items[code].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('all unit codes have translations in every supported language', () => {
    for (const { lang, dict } of dictionaries) {
      for (const code of TASK_UNIT_CODES) {
        expect(dict.units[code], `Missing unit ${code} in ${lang}`).toBeDefined();
        expect(dict.units[code].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('all priorities have translations in every supported language', () => {
    const priorities = ['low', 'medium', 'high', 'urgent'] as const;
    for (const { lang, dict } of dictionaries) {
      for (const p of priorities) {
        expect(dict.priorities[p], `Missing priority ${p} in ${lang}`).toBeDefined();
        expect(dict.priorities[p].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('all task statuses have translations in every supported language', () => {
    const statuses = ['pending', 'acknowledged', 'in_progress', 'completed'] as const;
    for (const { lang, dict } of dictionaries) {
      for (const s of statuses) {
        expect(dict.statuses[s], `Missing status ${s} in ${lang}`).toBeDefined();
        expect(dict.statuses[s].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('falls back safely for unknown codes without crashing', () => {
    // @ts-expect-error test unknown code
    expect(translateActionCode('UNKNOWN_ACTION', 'en')).toBe('UNKNOWN_ACTION');
    // @ts-expect-error test unknown code
    expect(translateItemCode('UNKNOWN_ITEM', 'ml')).toBe('UNKNOWN_ITEM');
    // @ts-expect-error test unknown code
    expect(translateUnitCode('UNKNOWN_UNIT', 'ta')).toBe('UNKNOWN_UNIT');
    // @ts-expect-error test unsupported language
    expect(getDictionary('fr')).toEqual(enDictionary);
  });
});

describe('Phase 4: Task Template Engine & Grammatical Formatting', () => {
  const canonicalInstruction: StructuredTaskInstruction = {
    schemaVersion: 1,
    actionCode: 'DELIVER',
    itemCode: 'WATER',
    quantity: 20,
    unitCode: 'BOTTLE',
    locationText: 'Gate B',
    additionalNotes: 'Urgent medical camp supply',
  };

  it('formats English structured instruction in SVO word order', () => {
    const formatted = formatStructuredTask(canonicalInstruction, 'en');
    expect(formatted).toBe('Deliver 20 bottles of water to Gate B.');
  });

  it('formats Malayalam structured instruction in SOV order with postposition', () => {
    const formatted = formatStructuredTask(canonicalInstruction, 'ml');
    // Gate B-ലേക്ക് 20 കുപ്പി വെള്ളം എത്തിക്കുക.
    expect(formatted).toContain('Gate B-ലേക്ക്');
    expect(formatted).toContain('20');
    expect(formatted).toContain('കുപ്പി');
    expect(formatted).toContain('വെള്ളം');
    expect(formatted).toContain('എത്തിക്കുക');
    // Verb must be at the end in Malayalam SOV
    expect(formatted.endsWith('എത്തിക്കുക.')).toBe(true);
  });

  it('formats Tamil structured instruction in SOV order with postposition', () => {
    const formatted = formatStructuredTask(canonicalInstruction, 'ta');
    // Gate B-க்கு 20 பாட்டில் தண்ணீர் வழங்கவும்.
    expect(formatted).toContain('Gate B-க்கு');
    expect(formatted).toContain('20');
    expect(formatted).toContain('பாட்டில்');
    expect(formatted).toContain('தண்ணீர்');
    expect(formatted).toContain('வழங்கவும்');
    // Verb must be at the end in Tamil SOV
    expect(formatted.endsWith('வழங்கவும்.')).toBe(true);
  });

  it('preserves user location exactly as entered without modification', () => {
    const customLocation = 'Block-C, Room #104 (Behind Cafeteria)';
    const instruction: StructuredTaskInstruction = {
      schemaVersion: 1,
      actionCode: 'DELIVER',
      locationText: customLocation,
    };

    expect(formatStructuredTask(instruction, 'en')).toContain(customLocation);
    expect(formatStructuredTask(instruction, 'ml')).toContain(customLocation);
    expect(formatStructuredTask(instruction, 'ta')).toContain(customLocation);
  });

  it('handles optional fields: missing quantity and unit', () => {
    const instruction: StructuredTaskInstruction = {
      schemaVersion: 1,
      actionCode: 'INSPECT',
      itemCode: 'EQUIPMENT',
      locationText: 'Shelter 2',
    };

    const en = formatStructuredTask(instruction, 'en');
    const ml = formatStructuredTask(instruction, 'ml');
    const ta = formatStructuredTask(instruction, 'ta');

    expect(en).toBe('Inspect equipment at Shelter 2.');
    expect(ml).toBe('Shelter 2-ൽ ഉപകരണങ്ങൾ പരിശോധിക്കുക.');
    expect(ta).toBe('Shelter 2-ல் உபகரணங்கள் ஆய்வு செய்யவும்.');
  });

  it('handles optional fields: missing location', () => {
    const instruction: StructuredTaskInstruction = {
      schemaVersion: 1,
      actionCode: 'DISTRIBUTE',
      itemCode: 'FOOD',
      quantity: 50,
      unitCode: 'PACKET',
    };

    expect(formatStructuredTask(instruction, 'en')).toBe('Distribute 50 packets of food.');
    expect(formatStructuredTask(instruction, 'ml')).toBe('50 പാക്കറ്റ് ഭക്ഷണം വിതരണം ചെയ്യുക.');
    expect(formatStructuredTask(instruction, 'ta')).toBe('50 பாக்கெட் உணவு விநியோகிக்கவும்.');
  });

  it('handles optional fields: action only', () => {
    const instruction: StructuredTaskInstruction = {
      schemaVersion: 1,
      actionCode: 'CLEAN',
    };

    expect(formatStructuredTask(instruction, 'en')).toBe('Clean.');
    expect(formatStructuredTask(instruction, 'ml')).toBe('വൃത്തിയാക്കുക.');
    expect(formatStructuredTask(instruction, 'ta')).toBe('சுத்தம் செய்யவும்.');
  });

  it('handles source prepositions for COLLECT action correctly across languages', () => {
    const instruction: StructuredTaskInstruction = {
      schemaVersion: 1,
      actionCode: 'COLLECT',
      itemCode: 'MEDICINE',
      locationText: 'Pharmacy',
    };

    expect(formatStructuredTask(instruction, 'en')).toBe('Collect medicine from Pharmacy.');
    expect(formatStructuredTask(instruction, 'ml')).toBe('Pharmacy-ൽ നിന്ന് മരുന്ന് ശേഖരിക്കുക.');
    expect(formatStructuredTask(instruction, 'ta')).toBe('Pharmacy-லிருந்து மருந்து சேகரிக்கவும்.');
  });

  it('language switching does not mutate canonical task instruction', () => {
    const original = JSON.parse(JSON.stringify(canonicalInstruction));

    formatStructuredTask(canonicalInstruction, 'en');
    formatStructuredTask(canonicalInstruction, 'ml');
    formatStructuredTask(canonicalInstruction, 'ta');

    expect(canonicalInstruction).toEqual(original);
  });

  it('formatTaskDisplayTitle falls back to original title for legacy tasks without instruction', () => {
    const legacyTask: Task = {
      id: 'd9b9c9f2-2345-4a67-8c89-0123456789ab',
      action: 'CUSTOM',
      title: 'Legacy Emergency Task Title',
      description: 'Legacy text',
      location: 'Camp 1',
      priority: 'high',
      status: 'pending',
      createdAt: '2026-10-24T12:00:00.000Z',
      updatedAt: '2026-10-24T12:00:00.000Z',
      createdBy: 'device-123',
      revision: 1,
      deletedAt: null,
    };

    expect(formatTaskDisplayTitle(legacyTask, 'en')).toBe('Legacy Emergency Task Title');
    expect(formatTaskDisplayTitle(legacyTask, 'ml')).toBe('Legacy Emergency Task Title');
    expect(formatTaskDisplayTitle(legacyTask, 'ta')).toBe('Legacy Emergency Task Title');
  });

  it('formatTaskDisplayTitle dynamically translates structured tasks', () => {
    const structuredTask: Task = {
      id: 'd9b9c9f2-2345-4a67-8c89-0123456789ab',
      action: 'DELIVER_SUPPLIES',
      title: 'Deliver 20 bottles of water to Gate B.',
      location: 'Gate B',
      priority: 'medium',
      status: 'pending',
      createdAt: '2026-10-24T12:00:00.000Z',
      updatedAt: '2026-10-24T12:00:00.000Z',
      createdBy: 'device-123',
      revision: 1,
      deletedAt: null,
      instruction: canonicalInstruction,
    };

    expect(formatTaskDisplayTitle(structuredTask, 'en')).toBe(
      'Deliver 20 bottles of water to Gate B.',
    );
    expect(formatTaskDisplayTitle(structuredTask, 'ml')).toBe(
      'Gate B-ലേക്ക് 20 കുപ്പി വെള്ളം എത്തിക്കുക.',
    );
    expect(formatTaskDisplayTitle(structuredTask, 'ta')).toBe(
      'Gate B-க்கு 20 பாட்டில் தண்ணீர் வழங்கவும்.',
    );
  });
});
