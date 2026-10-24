import {
  CreateTaskInputSchema,
  type CreateTaskInput,
  type Task,
  type TaskAction,
  type TaskPriority,
  type UpdateTaskInput,
} from '@relay-miden/shared';

export interface TaskDraft {
  action: TaskAction;
  title: string;
  quantity: string;
  unit: string;
  location: string;
  priority: TaskPriority;
  description: string;
}

export type DraftField = keyof TaskDraft;
export type DraftErrors = Partial<Record<DraftField, string>>;

export const actionOptions: readonly { value: TaskAction; label: string }[] = [
  { value: 'DELIVER_SUPPLIES', label: 'Deliver supplies' },
  { value: 'REQUEST_VOLUNTEERS', label: 'Request volunteers' },
  { value: 'REQUEST_ASSISTANCE', label: 'Request assistance' },
  { value: 'REPORT_ISSUE', label: 'Report an issue' },
  { value: 'MOVE_TO_LOCATION', label: 'Move to location' },
  { value: 'CUSTOM', label: 'Custom task' },
];

export function createInitialDraft(quick = false): TaskDraft {
  return {
    action: 'DELIVER_SUPPLIES',
    title: quick ? 'Deliver supplies' : '',
    quantity: quick ? '20' : '',
    unit: quick ? 'Bottles' : '',
    location: quick ? 'Relief Camp, Block A' : '',
    priority: quick ? 'high' : 'medium',
    description: '',
  };
}

export function taskToDraft(task: Task): TaskDraft {
  return {
    action: task.action,
    title: task.title,
    quantity: task.quantity?.toString() ?? '',
    unit: task.unit ?? '',
    location: task.location,
    priority: task.priority,
    description: task.description ?? '',
  };
}

export function draftToCreateInput(draft: TaskDraft): CreateTaskInput {
  return {
    action: draft.action,
    title: draft.title,
    description: draft.description,
    quantity: draft.quantity.trim() ? Number(draft.quantity) : undefined,
    unit: draft.unit,
    location: draft.location,
    priority: draft.priority,
  };
}

export function draftToUpdateInput(draft: TaskDraft): UpdateTaskInput {
  return {
    action: draft.action,
    title: draft.title,
    description: draft.description.trim() ? draft.description : null,
    quantity: draft.quantity.trim() ? Number(draft.quantity) : null,
    unit: draft.unit.trim() ? draft.unit : null,
    location: draft.location,
    priority: draft.priority,
  };
}

export function validateDraft(draft: TaskDraft): DraftErrors {
  const parsed = CreateTaskInputSchema.safeParse(draftToCreateInput(draft));
  if (parsed.success) return {};

  const errors: DraftErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && field in draft && !errors[field as DraftField]) {
      errors[field as DraftField] = issue.message;
    }
  }
  return errors;
}
