import { describe, expect, it } from 'vitest';
import { createInitialDraft, validateDraft } from './task-form';
const validDraft = {
  ...createInitialDraft(),
  title: 'Deliver drinking water',
  quantity: '20',
  unit: 'Bottles',
  location: 'Relief Camp',
};
describe('task draft validation', () => {
  it('accepts a valid task draft', () => {
    expect(validateDraft(validDraft)).toEqual({});
  });
  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '100001'])(
    'rejects invalid quantity %j',
    (quantity) => {
      expect(validateDraft({ ...validDraft, quantity }).quantity).toBeDefined();
    },
  );
  it('allows an omitted quantity and unit', () => {
    expect(validateDraft({ ...validDraft, quantity: '', unit: '' })).toEqual({});
  });
  it('requires title and location', () => {
    const errors = validateDraft({ ...validDraft, title: ' ', location: ' ' });
    expect(errors.title).toBeDefined();
    expect(errors.location).toBeDefined();
  });
  it('bounds text fields', () => {
    const errors = validateDraft({
      ...validDraft,
      title: 'x'.repeat(121),
      location: 'x'.repeat(161),
      description: 'x'.repeat(1001),
    });
    expect(errors.title).toBeDefined();
    expect(errors.location).toBeDefined();
    expect(errors.description).toBeDefined();
  });
  it('accepts the boundary values', () => {
    expect(
      validateDraft({
        ...validDraft,
        title: 'x'.repeat(120),
        quantity: '100000',
        location: 'x'.repeat(160),
        description: 'x'.repeat(1000),
      }),
    ).toEqual({});
  });
});
