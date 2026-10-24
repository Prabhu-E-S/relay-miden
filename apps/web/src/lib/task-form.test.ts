import { describe, expect, it } from 'vitest';
import { initialDraft, validateDraft } from './task-form';
describe('task draft validation', () => {
  it('accepts a valid unsaved draft', () => {
    expect(validateDraft(initialDraft)).toEqual({});
  });
  it.each(['', ' ', '0', '-1', '1.5', 'NaN', 'Infinity', '100001'])(
    'rejects invalid quantity %j',
    (quantity) => {
      expect(validateDraft({ ...initialDraft, quantity }).quantity).toBeDefined();
    },
  );
  it('requires a non-whitespace location', () => {
    expect(validateDraft({ ...initialDraft, location: '   ' }).location).toBeDefined();
  });
  it('bounds text fields', () => {
    const errors = validateDraft({
      ...initialDraft,
      location: 'x'.repeat(161),
      notes: 'x'.repeat(501),
    });
    expect(errors.location).toBeDefined();
    expect(errors.notes).toBeDefined();
  });
  it('accepts the boundary values', () => {
    expect(
      validateDraft({
        ...initialDraft,
        quantity: '100000',
        location: 'x'.repeat(160),
        notes: 'x'.repeat(500),
      }),
    ).toEqual({});
  });
});
