import { z } from 'zod';
import {
  TaskActionSchema,
  TaskPrioritySchema,
  TaskSchema,
  TaskStatusSchema,
  isValidStatusTransition,
  type Task,
} from './tasks.js';
import { StructuredTaskInstructionSchema } from './multilingual.js';
import { canonicalJsonStringify } from './paperbridge.js';

export const StateHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

// Null explicitly removes an optional field. Resolution messages carry all mutable fields.
export const TaskChangesSchema = z
  .object({
    action: TaskActionSchema.optional(),
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    quantity: z.number().int().positive().max(100_000).nullable().optional(),
    unit: z.string().trim().max(40).nullable().optional(),
    location: z.string().trim().min(1).max(160).optional(),
    priority: TaskPrioritySchema.optional(),
    status: TaskStatusSchema.optional(),
    instruction: StructuredTaskInstructionSchema.nullable().optional(),
    deletedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'An update must change at least one field.');
export type TaskChanges = z.infer<typeof TaskChangesSchema>;

export const TaskUpdatePayloadSchema = z
  .object({
    taskId: z.uuid(),
    operationId: z.uuid(),
    originDeviceId: z.uuid(),
    baseRevision: z.number().int().positive(),
    nextRevision: z.number().int().positive(),
    parentOperationId: z.uuid().nullable(),
    baseStateHash: StateHashSchema,
    resultStateHash: StateHashSchema,
    changes: TaskChangesSchema,
    updatedAt: z.iso.datetime({ offset: true }),
    resolution: z
      .object({
        mergedOperationId: z.uuid(),
        mergedStateHash: StateHashSchema,
      })
      .strict()
      .optional(),
    reopen: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.resolution
        ? value.nextRevision > value.baseRevision
        : value.nextRevision === value.baseRevision + 1,
    {
      message: 'A task update must advance the revision.',
    },
  );
export type TaskUpdatePayload = z.infer<typeof TaskUpdatePayloadSchema>;

export const TaskAckPayloadSchema = z
  .object({
    acknowledgedMessageId: z.uuid(),
    acknowledgedOperationId: z.uuid(),
    taskId: z.uuid(),
    receiverDeviceId: z.uuid(),
    appliedRevision: z.number().int().positive(),
    result: z.enum(['APPLIED', 'ALREADY_APPLIED']),
    acknowledgedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type TaskAckPayload = z.infer<typeof TaskAckPayloadSchema>;

export async function taskStateHash(task: Task): Promise<string> {
  const { deletedAt, ...rest } = TaskSchema.parse(task);
  // Normalize the optional deletion marker because v1 imported snapshots omit it.
  const bytes = new TextEncoder().encode(
    canonicalJsonStringify({ ...rest, deletedAt: deletedAt ?? null }),
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function taskChanges(previous: Task, next: Task): TaskChanges {
  const fields = [
    'action',
    'title',
    'description',
    'quantity',
    'unit',
    'location',
    'priority',
    'status',
    'instruction',
    'deletedAt',
  ] as const;
  const changes: Record<string, unknown> = {};
  for (const field of fields) {
    if (
      canonicalJsonStringify(previous[field] ?? null) !==
      canonicalJsonStringify(next[field] ?? null)
    ) {
      changes[field] = next[field] ?? null;
    }
  }
  return TaskChangesSchema.parse(changes);
}

export function completeTaskChanges(task: Task): TaskChanges {
  return TaskChangesSchema.parse({
    action: task.action,
    title: task.title,
    description: task.description ?? null,
    quantity: task.quantity ?? null,
    unit: task.unit ?? null,
    location: task.location,
    priority: task.priority,
    status: task.status,
    instruction: task.instruction ?? null,
    deletedAt: task.deletedAt ?? null,
  });
}

export function applyTaskChanges(base: Task, update: TaskUpdatePayload): Task {
  const changes = TaskChangesSchema.parse(update.changes);
  if (base.deletedAt && !update.resolution)
    throw new Error('A deleted task cannot be updated automatically.');
  if (
    changes.status &&
    changes.status !== base.status &&
    !update.resolution &&
    !isValidStatusTransition(base.status, changes.status, update.reopen === true)
  ) {
    throw new Error('Invalid task status transition.');
  }
  const candidate: Record<string, unknown> = {
    ...base,
    ...changes,
    revision: update.nextRevision,
    updatedAt: update.updatedAt,
  };
  for (const field of ['description', 'quantity', 'unit', 'instruction'] as const) {
    if (candidate[field] === null) delete candidate[field];
  }
  if (candidate.quantity === undefined) delete candidate.unit;
  return TaskSchema.parse(candidate);
}

export type SyncClassification =
  'APPLICABLE' | 'ALREADY_APPLIED' | 'STALE' | 'CONFLICT' | 'MISSING_PARENT' | 'INVALID';
export interface LocalSyncState {
  revision: number;
  stateHash: string;
  knownOperationIds: readonly string[];
  ancestorStateHashes: readonly string[];
}

export function classifyIncomingOperation(
  local: LocalSyncState | null,
  incoming: TaskUpdatePayload,
): SyncClassification {
  const parsed = TaskUpdatePayloadSchema.safeParse(incoming);
  if (!parsed.success) return 'INVALID';
  if (!local) return 'MISSING_PARENT';
  if (local.knownOperationIds.includes(incoming.operationId)) return 'ALREADY_APPLIED';
  if (
    incoming.resolution &&
    incoming.resolution.mergedStateHash === local.stateHash &&
    local.knownOperationIds.includes(incoming.resolution.mergedOperationId) &&
    incoming.nextRevision > local.revision
  )
    return 'APPLICABLE';
  if (incoming.baseRevision > local.revision) return 'MISSING_PARENT';
  if (incoming.baseRevision === local.revision) {
    return incoming.baseStateHash === local.stateHash ? 'APPLICABLE' : 'CONFLICT';
  }
  if (local.ancestorStateHashes.includes(incoming.resultStateHash)) return 'STALE';
  if (local.ancestorStateHashes.includes(incoming.baseStateHash)) return 'CONFLICT';
  return 'MISSING_PARENT';
}
