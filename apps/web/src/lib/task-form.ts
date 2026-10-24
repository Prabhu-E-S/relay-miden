import type { Priority } from '@relay-miden/shared';
export interface TaskDraft {
  type: string;
  quantity: string;
  unit: string;
  location: string;
  priority: Priority;
  notes: string;
}
export type DraftErrors = Partial<Record<'quantity' | 'location' | 'notes', string>>;
export const initialDraft: TaskDraft = {
  type: 'Deliver supplies',
  quantity: '20',
  unit: 'Bottles',
  location: 'Relief Camp, Block A',
  priority: 'high',
  notes: '',
};
export function validateDraft(draft: TaskDraft): DraftErrors {
  const errors: DraftErrors = {};
  const quantity = Number(draft.quantity);
  if (
    !draft.quantity.trim() ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 100000
  )
    errors.quantity = 'Enter a whole number between 1 and 100,000.';
  if (!draft.location.trim()) errors.location = 'Add a location so people know where to help.';
  else if (draft.location.trim().length > 160)
    errors.location = 'Keep the location to 160 characters or fewer.';
  if (draft.notes.length > 500) errors.notes = 'Keep notes to 500 characters or fewer.';
  return errors;
}
