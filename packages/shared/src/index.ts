import { z } from 'zod';

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 1_000;
const LOCATION_MAX = 160;
const UNIT_MAX = 40;
const DEVICE_ID_MAX = 128;

const optionalTrimmedText = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(maximum).optional(),
  );

export const TaskStatusSchema = z.enum(['pending', 'acknowledged', 'in_progress', 'completed']);
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const TaskActionSchema = z.enum([
  'REQUEST_VOLUNTEERS',
  'DELIVER_SUPPLIES',
  'REPORT_ISSUE',
  'REQUEST_ASSISTANCE',
  'MOVE_TO_LOCATION',
  'CUSTOM',
]);

export const CreateTaskInputSchema = z
  .object({
    action: TaskActionSchema.default('CUSTOM'),
    title: z.string().trim().min(1, 'Enter a task title.').max(TITLE_MAX),
    description: optionalTrimmedText(DESCRIPTION_MAX),
    quantity: z.number().int().positive().max(100_000).optional(),
    unit: optionalTrimmedText(UNIT_MAX),
    location: z.string().trim().min(1, 'Add a location.').max(LOCATION_MAX),
    priority: TaskPrioritySchema.default('medium'),
  })
  .superRefine((input, context) => {
    if (input.quantity !== undefined && !input.unit) {
      context.addIssue({
        code: 'custom',
        path: ['unit'],
        message: 'Add a unit for this quantity.',
      });
    }
  });

export const UpdateTaskInputSchema = z
  .object({
    action: TaskActionSchema.optional(),
    title: z.string().trim().min(1, 'Enter a task title.').max(TITLE_MAX).optional(),
    description: z.union([z.string().trim().max(DESCRIPTION_MAX), z.null()]).optional(),
    quantity: z.union([z.number().int().positive().max(100_000), z.null()]).optional(),
    unit: z.union([z.string().trim().max(UNIT_MAX), z.null()]).optional(),
    location: z.string().trim().min(1, 'Add a location.').max(LOCATION_MAX).optional(),
    priority: TaskPrioritySchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, 'Provide at least one task change.');

export const TaskSchema = z.object({
  id: z.uuid(),
  action: TaskActionSchema,
  title: z.string().trim().min(1).max(TITLE_MAX),
  description: z.string().trim().max(DESCRIPTION_MAX).optional(),
  quantity: z.number().int().positive().max(100_000).optional(),
  unit: z.string().trim().max(UNIT_MAX).optional(),
  location: z.string().trim().min(1).max(LOCATION_MAX),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  createdBy: z.string().trim().min(1).max(DEVICE_ID_MAX),
  revision: z.number().int().positive(),
  deletedAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const TaskOperationTypeSchema = z.enum(['TASK_CREATE', 'TASK_UPDATE', 'TASK_DELETE']);
export const TaskOperationSchema = z.object({
  operationId: z.uuid(),
  taskId: z.uuid(),
  actorId: z.string().trim().min(1).max(DEVICE_ID_MAX),
  operationType: TaskOperationTypeSchema,
  timestamp: z.iso.datetime({ offset: true }),
  revision: z.number().int().positive(),
  parentRevision: z.number().int().nonnegative().nullable(),
  payload: TaskSchema,
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type TaskAction = z.infer<typeof TaskActionSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type CreateTaskInput = z.input<typeof CreateTaskInputSchema>;
export type ParsedCreateTaskInput = z.output<typeof CreateTaskInputSchema>;
export type UpdateTaskInput = z.input<typeof UpdateTaskInputSchema>;
export type TaskOperationType = z.infer<typeof TaskOperationTypeSchema>;
export type TaskOperation = z.infer<typeof TaskOperationSchema>;
export type Language = 'en' | 'ml' | 'ta';

export const TASK_STATUS_SEQUENCE: readonly TaskStatus[] = [
  'pending',
  'acknowledged',
  'in_progress',
  'completed',
];

export function isValidStatusTransition(
  current: TaskStatus,
  next: TaskStatus,
  allowReopen = false,
): boolean {
  if (current === next) return false;
  if (allowReopen && current === 'completed' && next === 'pending') return true;
  return TASK_STATUS_SEQUENCE.indexOf(next) === TASK_STATUS_SEQUENCE.indexOf(current) + 1;
}

export interface HealthResponse {
  status: 'ok';
  service: 'relay-miden-server';
  phase: 2;
}
