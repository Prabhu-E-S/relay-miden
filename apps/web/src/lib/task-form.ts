import {
  TASK_ACTION_CODES,
  TASK_ITEM_CODES,
  TASK_UNIT_CODES,
  type CreateTaskInput,
  type StructuredTaskInstruction,
  type SupportedLanguage,
  type Task,
  type TaskAction,
  type TaskActionCode,
  type TaskItemCode,
  type TaskPriority,
  type TaskUnitCode,
  type UpdateTaskInput,
} from '@relay-miden/shared';
import { formatStructuredTask, translateUnitCode } from '../i18n';

export interface TaskDraft {
  mode: 'structured' | 'custom';
  // Structured template fields
  actionCode: TaskActionCode;
  itemCode: TaskItemCode | '';
  unitCode: TaskUnitCode | '';
  notes: string;
  // Free-text & common fields
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

export function mapActionCodeToTaskAction(code: TaskActionCode): TaskAction {
  switch (code) {
    case 'DELIVER':
    case 'DISTRIBUTE':
    case 'TRANSPORT':
    case 'RESTOCK':
      return 'DELIVER_SUPPLIES';
    case 'COLLECT':
      return 'MOVE_TO_LOCATION';
    case 'INSPECT':
    case 'CLEAN':
    case 'REPAIR':
      return 'CUSTOM';
    case 'REPORT':
      return 'REPORT_ISSUE';
    case 'ASSIST':
      return 'REQUEST_ASSISTANCE';
    default:
      return 'CUSTOM';
  }
}

export function createInitialStructuredDraft(quick = false): TaskDraft {
  return {
    mode: 'structured',
    actionCode: 'DELIVER',
    itemCode: 'WATER',
    unitCode: 'BOTTLE',
    notes: '',
    action: 'DELIVER_SUPPLIES',
    title: quick ? 'Deliver 20 bottles of water to Relief Camp, Block A.' : '',
    quantity: quick ? '20' : '',
    unit: quick ? 'Bottles' : '',
    location: quick ? 'Relief Camp, Block A' : '',
    priority: quick ? 'high' : 'medium',
    description: '',
  };
}

export function createInitialDraft(quick = false): TaskDraft {
  return {
    mode: 'custom',
    actionCode: 'DELIVER',
    itemCode: 'WATER',
    unitCode: 'BOTTLE',
    notes: '',
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
  if (task.instruction) {
    return {
      mode: 'structured',
      actionCode: task.instruction.actionCode,
      itemCode: task.instruction.itemCode ?? '',
      unitCode: task.instruction.unitCode ?? '',
      notes: task.instruction.additionalNotes ?? '',
      action: task.action,
      title: task.title,
      quantity:
        task.instruction.quantity !== undefined
          ? String(task.instruction.quantity)
          : (task.quantity?.toString() ?? ''),
      unit: task.unit ?? '',
      location: task.instruction.locationText ?? task.location,
      priority: task.priority,
      description: task.description ?? '',
    };
  }

  return {
    mode: 'custom',
    actionCode: 'DELIVER',
    itemCode: 'WATER',
    unitCode: 'BOTTLE',
    notes: '',
    action: task.action,
    title: task.title,
    quantity: task.quantity?.toString() ?? '',
    unit: task.unit ?? '',
    location: task.location,
    priority: task.priority,
    description: task.description ?? '',
  };
}

export function draftToCreateInput(
  draft: TaskDraft,
  language: SupportedLanguage = 'en',
): CreateTaskInput {
  if (draft.mode === 'structured') {
    const instruction: StructuredTaskInstruction = {
      schemaVersion: 1,
      actionCode: draft.actionCode,
      ...(draft.itemCode ? { itemCode: draft.itemCode as TaskItemCode } : {}),
      ...(draft.quantity.trim() ? { quantity: Number(draft.quantity) } : {}),
      ...(draft.unitCode ? { unitCode: draft.unitCode as TaskUnitCode } : {}),
      ...(draft.location.trim() ? { locationText: draft.location.trim() } : {}),
      ...(draft.notes.trim() ? { additionalNotes: draft.notes.trim() } : {}),
    };

    const formattedTitle = formatStructuredTask(instruction, language);
    const unitLabel = draft.unitCode
      ? translateUnitCode(draft.unitCode as TaskUnitCode, language)
      : draft.unit.trim() || undefined;

    return {
      action: mapActionCodeToTaskAction(draft.actionCode),
      title: draft.title.trim() || formattedTitle,
      description: draft.notes.trim() || draft.description.trim() || undefined,
      quantity: draft.quantity.trim() ? Number(draft.quantity) : undefined,
      unit: draft.quantity.trim() ? unitLabel || 'units' : undefined,
      location: draft.location.trim(),
      priority: draft.priority,
      instruction,
    };
  }

  return {
    action: draft.action,
    title: draft.title.trim(),
    description: draft.description.trim() || undefined,
    quantity: draft.quantity.trim() ? Number(draft.quantity) : undefined,
    unit: draft.unit.trim() || undefined,
    location: draft.location.trim(),
    priority: draft.priority,
  };
}

export function draftToUpdateInput(
  draft: TaskDraft,
  language: SupportedLanguage = 'en',
): UpdateTaskInput {
  if (draft.mode === 'structured') {
    const instruction: StructuredTaskInstruction = {
      schemaVersion: 1,
      actionCode: draft.actionCode,
      ...(draft.itemCode ? { itemCode: draft.itemCode as TaskItemCode } : {}),
      ...(draft.quantity.trim() ? { quantity: Number(draft.quantity) } : {}),
      ...(draft.unitCode ? { unitCode: draft.unitCode as TaskUnitCode } : {}),
      ...(draft.location.trim() ? { locationText: draft.location.trim() } : {}),
      ...(draft.notes.trim() ? { additionalNotes: draft.notes.trim() } : {}),
    };

    const formattedTitle = formatStructuredTask(instruction, language);
    const unitLabel = draft.unitCode
      ? translateUnitCode(draft.unitCode as TaskUnitCode, language)
      : draft.unit.trim() || null;

    return {
      action: mapActionCodeToTaskAction(draft.actionCode),
      title: draft.title.trim() || formattedTitle,
      description: draft.notes.trim() ? draft.notes.trim() : null,
      quantity: draft.quantity.trim() ? Number(draft.quantity) : null,
      unit: draft.quantity.trim() ? unitLabel : null,
      location: draft.location.trim(),
      priority: draft.priority,
      instruction,
    };
  }

  return {
    action: draft.action,
    title: draft.title.trim(),
    description: draft.description.trim() ? draft.description.trim() : null,
    quantity: draft.quantity.trim() ? Number(draft.quantity) : null,
    unit: draft.unit.trim() ? draft.unit.trim() : null,
    location: draft.location.trim(),
    priority: draft.priority,
    instruction: null,
  };
}

export function validateDraft(draft: TaskDraft): DraftErrors {
  const errors: DraftErrors = {};

  if (!draft.title || !draft.title.trim()) {
    errors.title = 'Enter a task title.';
  } else if (draft.title.trim().length > 120) {
    errors.title = 'Task title must not exceed 120 characters.';
  }

  if (!draft.location || !draft.location.trim()) {
    errors.location = 'Add a location.';
  } else if (draft.location.trim().length > 160) {
    errors.location = 'Location must not exceed 160 characters.';
  }

  if (draft.quantity.trim()) {
    const qNum = Number(draft.quantity);
    if (
      isNaN(qNum) ||
      !Number.isInteger(qNum) ||
      qNum <= 0 ||
      qNum > 100_000 ||
      draft.quantity.includes('.')
    ) {
      errors.quantity = 'Quantity must be a positive integer up to 100,000.';
    } else if (!draft.unitCode && !draft.unit.trim()) {
      errors.unit = 'Add a unit for this quantity.';
    }
  }

  if (draft.notes && draft.notes.length > 1_000) {
    errors.notes = 'Notes must not exceed 1,000 characters.';
  }
  if (draft.description && draft.description.length > 1_000) {
    errors.description = 'Description must not exceed 1,000 characters.';
  }

  return errors;
}

export { TASK_ACTION_CODES, TASK_ITEM_CODES, TASK_UNIT_CODES };
