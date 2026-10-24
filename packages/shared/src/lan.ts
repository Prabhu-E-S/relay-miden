import { z } from 'zod';
import { TaskSchema } from './tasks.js';
import { StateHashSchema, TaskUpdatePayloadSchema } from './sync.js';

export const LAN_PROTOCOL_VERSION = 1;

export const LanDeviceRegistrationSchema = z
  .object({
    protocolVersion: z.literal(LAN_PROTOCOL_VERSION),
    deviceId: z.string().uuid(),
    displayName: z.string().trim().max(80).optional(),
    appVersion: z.string().trim().max(40).optional(),
    sessionToken: z.string().trim().optional(),
  })
  .strict();
export type LanDeviceRegistration = z.infer<typeof LanDeviceRegistrationSchema>;

export const LanRegistrationResultSchema = z
  .object({
    success: z.boolean(),
    serverDeviceId: z.string().uuid(),
    protocolVersion: z.literal(LAN_PROTOCOL_VERSION),
    currentSequence: z.number().int().nonnegative(),
    message: z.string().optional(),
  })
  .strict();
export type LanRegistrationResult = z.infer<typeof LanRegistrationResultSchema>;

export const LanSyncRequestSchema = z
  .object({
    protocolVersion: z.literal(LAN_PROTOCOL_VERSION),
    deviceId: z.string().uuid(),
    cursor: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().max(500).optional(),
  })
  .strict();
export type LanSyncRequest = z.infer<typeof LanSyncRequestSchema>;

export const LanTaskCreatePayloadSchema = z
  .object({
    type: z.literal('TASK_CREATE'),
    operationId: z.string().uuid(),
    taskId: z.string().uuid(),
    actorId: z.string().uuid(),
    task: TaskSchema,
    resultStateHash: StateHashSchema,
    timestamp: z.string().datetime({ offset: true }),
  })
  .strict();
export type LanTaskCreatePayload = z.infer<typeof LanTaskCreatePayloadSchema>;

export const LanTaskUpdatePayloadSchema = z
  .object({
    type: z.literal('TASK_UPDATE'),
    update: TaskUpdatePayloadSchema,
  })
  .strict();
export type LanTaskUpdatePayload = z.infer<typeof LanTaskUpdatePayloadSchema>;

export const LanOperationPayloadSchema = z.discriminatedUnion('type', [
  LanTaskCreatePayloadSchema,
  LanTaskUpdatePayloadSchema,
]);
export type LanOperationPayload = z.infer<typeof LanOperationPayloadSchema>;

export const LanOperationSubmitSchema = z
  .object({
    protocolVersion: z.literal(LAN_PROTOCOL_VERSION),
    requestId: z.string().uuid(),
    deviceId: z.string().uuid(),
    operation: LanOperationPayloadSchema,
  })
  .strict();
export type LanOperationSubmit = z.infer<typeof LanOperationSubmitSchema>;

export const LanOperationAcceptedSchema = z
  .object({
    requestId: z.string().uuid(),
    operationId: z.string().uuid(),
    taskId: z.string().uuid(),
    sequence: z.number().int().positive(),
    revision: z.number().int().positive(),
    resultStateHash: StateHashSchema,
    status: z.enum(['APPLIED', 'ALREADY_APPLIED']),
  })
  .strict();
export type LanOperationAccepted = z.infer<typeof LanOperationAcceptedSchema>;

export const LanOperationRejectedSchema = z
  .object({
    requestId: z.string().uuid(),
    operationId: z.string().uuid(),
    taskId: z.string().uuid().optional(),
    classification: z.enum([
      'STALE',
      'MISSING_PARENT',
      'CONFLICT',
      'INVALID',
      'UNAUTHORIZED',
      'DUPLICATE_MISMATCH',
    ]),
    reason: z.string(),
  })
  .strict();
export type LanOperationRejected = z.infer<typeof LanOperationRejectedSchema>;

export const LanOperationBroadcastSchema = z
  .object({
    sequence: z.number().int().positive(),
    operation: LanOperationPayloadSchema,
  })
  .strict();
export type LanOperationBroadcast = z.infer<typeof LanOperationBroadcastSchema>;

export const LanSyncBatchSchema = z
  .object({
    operations: z.array(LanOperationBroadcastSchema),
    cursor: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    totalServerOperations: z.number().int().nonnegative(),
  })
  .strict();
export type LanSyncBatch = z.infer<typeof LanSyncBatchSchema>;

export const LanServerErrorSchema = z
  .object({
    message: z.string(),
    code: z.string().optional(),
  })
  .strict();
export type LanServerError = z.infer<typeof LanServerErrorSchema>;

export const OutboxStatusSchema = z.enum([
  'PENDING',
  'IN_FLIGHT',
  'ACKNOWLEDGED',
  'BLOCKED',
  'FAILED',
]);
export type OutboxStatus = z.infer<typeof OutboxStatusSchema>;

export const OutboxEntrySchema = z
  .object({
    operationId: z.string().uuid(),
    taskId: z.string().uuid(),
    originDeviceId: z.string().uuid(),
    status: OutboxStatusSchema,
    attemptCount: z.number().int().nonnegative(),
    lastAttemptAt: z.string().datetime({ offset: true }).optional(),
    nextRetryAt: z.string().datetime({ offset: true }).optional(),
    lastError: z.string().optional(),
    createdAt: z.string().datetime({ offset: true }),
    acknowledgedAt: z.string().datetime({ offset: true }).optional(),
    serverSequence: z.number().int().positive().optional(),
  })
  .strict();
export type OutboxEntry = z.infer<typeof OutboxEntrySchema>;

export type LanConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'CONNECTING'
  | 'REGISTERING'
  | 'CONNECTED'
  | 'SYNCING'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'ERROR';
