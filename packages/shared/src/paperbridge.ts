import { z } from 'zod';
import {
  TaskActionSchema,
  TaskPrioritySchema,
  TaskSchema,
  TaskStatusSchema,
  type Task,
} from './tasks.js';
import { StructuredTaskInstructionSchema } from './multilingual.js';

export const PaperBridgeProtocolIdentifier = 'RELAY_MIDEN_PAPERBRIDGE' as const;
export const PAPERBRIDGE_PROTOCOL_VERSION = 1 as const;
export const MAX_PAPERBRIDGE_PAYLOAD_BYTES = 2048;

export const PaperBridgeMessageTypeSchema = z.enum(['TASK_CREATE']);
export type PaperBridgeMessageType = z.infer<typeof PaperBridgeMessageTypeSchema>;

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 1_000;
const LOCATION_MAX = 160;
const UNIT_MAX = 40;
const DEVICE_ID_MAX = 128;

export const PaperBridgeTaskPayloadSchema = z
  .object({
    taskId: z.uuid(),
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
    instruction: StructuredTaskInstructionSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.quantity !== undefined && !data.unit) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit'],
        message: 'Add a unit for this quantity.',
      });
    }
  });

export type PaperBridgeTaskPayload = z.infer<typeof PaperBridgeTaskPayloadSchema>;

export const PaperBridgeEnvelopeSchema = z.object({
  protocol: z.literal(PaperBridgeProtocolIdentifier),
  version: z.literal(PAPERBRIDGE_PROTOCOL_VERSION),
  messageId: z.uuid(),
  messageType: PaperBridgeMessageTypeSchema,
  senderId: z.string().trim().min(1).max(DEVICE_ID_MAX),
  createdAt: z.iso.datetime({ offset: true }),
  payload: PaperBridgeTaskPayloadSchema,
  checksum: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'Checksum must be a 64-character lowercase hexadecimal string.'),
});

export type PaperBridgeEnvelope = z.infer<typeof PaperBridgeEnvelopeSchema>;

export type PaperBridgeErrorCode =
  | 'EMPTY_PAYLOAD'
  | 'INVALID_JSON'
  | 'INVALID_ENVELOPE'
  | 'UNSUPPORTED_PROTOCOL'
  | 'UNSUPPORTED_VERSION'
  | 'UNSUPPORTED_MESSAGE_TYPE'
  | 'INVALID_CHECKSUM'
  | 'INVALID_TASK'
  | 'OVERSIZED_PAYLOAD';

export class PaperBridgeError extends Error {
  readonly code: PaperBridgeErrorCode;
  readonly details?: unknown;

  constructor(message: string, code: PaperBridgeErrorCode, details?: unknown) {
    super(message);
    this.name = 'PaperBridgeError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Deterministically stringifies any JSON-compatible value by lexicographically
 * ordering object keys and omitting undefined properties.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];
  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined) {
      pairs.push(`${JSON.stringify(key)}:${canonicalJsonStringify(val)}`);
    }
  }
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes a deterministic SHA-256 checksum over a PaperBridge envelope excluding the checksum field.
 * Uses the Web Crypto subtle API available in both modern browsers and Node 19+.
 */
export async function computeEnvelopeChecksum(envelopeWithoutChecksum: unknown): Promise<string> {
  const canonical = canonicalJsonStringify(envelopeWithoutChecksum);
  const data = new TextEncoder().encode(canonical);
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    throw new PaperBridgeError(
      'Web Crypto API (crypto.subtle) is not available in this environment.',
      'INVALID_CHECKSUM',
    );
  }
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies that the checksum attached to a PaperBridge envelope matches the recalculated
 * SHA-256 digest of its canonicalized content.
 */
export async function verifyEnvelopeChecksum(envelope: { checksum: string }): Promise<boolean> {
  const { checksum, ...withoutChecksum } = envelope;
  const expectedChecksum = await computeEnvelopeChecksum(withoutChecksum);
  return checksum.toLowerCase() === expectedChecksum.toLowerCase();
}

/**
 * Encodes a validated local task into a PaperBridge envelope and verifies that its size
 * fits within the supported QR payload threshold.
 */
export async function createPaperBridgeEnvelope(
  task: Task,
  senderId: string,
  options: { messageId?: string; now?: string } = {},
): Promise<{ envelope: PaperBridgeEnvelope; rawJson: string; byteSize: number }> {
  // Ensure the task conforms to the base Task schema and is not soft-deleted
  let validatedTask: Task;
  try {
    validatedTask = TaskSchema.parse(task);
  } catch (cause) {
    throw new PaperBridgeError(
      'The task contains invalid data and cannot be exported.',
      'INVALID_TASK',
      cause,
    );
  }

  if (validatedTask.deletedAt) {
    throw new PaperBridgeError('Deleted tasks cannot be exported via PaperBridge.', 'INVALID_TASK');
  }

  const payload: PaperBridgeTaskPayload = {
    taskId: validatedTask.id,
    action: validatedTask.action,
    title: validatedTask.title,
    ...(validatedTask.description ? { description: validatedTask.description } : {}),
    ...(validatedTask.quantity !== undefined ? { quantity: validatedTask.quantity } : {}),
    ...(validatedTask.unit ? { unit: validatedTask.unit } : {}),
    location: validatedTask.location,
    priority: validatedTask.priority,
    status: validatedTask.status,
    createdAt: validatedTask.createdAt,
    updatedAt: validatedTask.updatedAt,
    createdBy: validatedTask.createdBy,
    revision: validatedTask.revision,
    ...(validatedTask.instruction ? { instruction: validatedTask.instruction } : {}),
  };

  const parsedPayload = PaperBridgeTaskPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    throw new PaperBridgeError(
      parsedPayload.error.issues[0]?.message ?? 'Task payload validation failed.',
      'INVALID_TASK',
      parsedPayload.error,
    );
  }

  const envelopeWithoutChecksum: Omit<PaperBridgeEnvelope, 'checksum'> = {
    protocol: PaperBridgeProtocolIdentifier,
    version: PAPERBRIDGE_PROTOCOL_VERSION,
    messageId: options.messageId ?? crypto.randomUUID(),
    messageType: 'TASK_CREATE',
    senderId,
    createdAt: options.now ?? new Date().toISOString(),
    payload: parsedPayload.data,
  };

  const checksum = await computeEnvelopeChecksum(envelopeWithoutChecksum);
  const envelope: PaperBridgeEnvelope = {
    ...envelopeWithoutChecksum,
    checksum,
  };

  const rawJson = canonicalJsonStringify(envelope);
  const byteSize = new TextEncoder().encode(rawJson).length;

  if (byteSize > MAX_PAPERBRIDGE_PAYLOAD_BYTES) {
    throw new PaperBridgeError(
      `Task payload size (${byteSize} bytes) exceeds the maximum QR capacity of ${MAX_PAPERBRIDGE_PAYLOAD_BYTES} bytes. Shorten the description or title to fit.`,
      'OVERSIZED_PAYLOAD',
    );
  }

  return { envelope, rawJson, byteSize };
}

/**
 * Decodes and rigorously validates a raw string from a scanned or uploaded QR code.
 */
export async function decodePaperBridgeMessage(rawContent: string): Promise<PaperBridgeEnvelope> {
  if (!rawContent || typeof rawContent !== 'string' || !rawContent.trim()) {
    throw new PaperBridgeError('The QR code payload is empty.', 'EMPTY_PAYLOAD');
  }

  const byteLength = new TextEncoder().encode(rawContent).length;
  if (byteLength > MAX_PAPERBRIDGE_PAYLOAD_BYTES * 2) {
    throw new PaperBridgeError(
      `Payload size (${byteLength} bytes) exceeds maximum allowable QR threshold.`,
      'OVERSIZED_PAYLOAD',
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (cause) {
    throw new PaperBridgeError('The scanned QR code is not valid JSON.', 'INVALID_JSON', cause);
  }

  if (typeof parsedJson !== 'object' || parsedJson === null || Array.isArray(parsedJson)) {
    throw new PaperBridgeError(
      'The scanned payload is not a valid PaperBridge envelope object.',
      'INVALID_ENVELOPE',
    );
  }

  const rawObj = parsedJson as Record<string, unknown>;

  // Explicit protocol check
  if (rawObj['protocol'] !== PaperBridgeProtocolIdentifier) {
    throw new PaperBridgeError(
      `Unsupported protocol "${String(rawObj['protocol'])}". Expected "${PaperBridgeProtocolIdentifier}".`,
      'UNSUPPORTED_PROTOCOL',
    );
  }

  // Explicit version check
  if (rawObj['version'] !== PAPERBRIDGE_PROTOCOL_VERSION) {
    throw new PaperBridgeError(
      `Unsupported PaperBridge version "${String(rawObj['version'])}". Only version ${PAPERBRIDGE_PROTOCOL_VERSION} is supported.`,
      'UNSUPPORTED_VERSION',
    );
  }

  // Explicit message type check
  if (rawObj['messageType'] !== 'TASK_CREATE') {
    throw new PaperBridgeError(
      `Unsupported message type "${String(rawObj['messageType'])}".`,
      'UNSUPPORTED_MESSAGE_TYPE',
    );
  }

  // Schema validation
  const envelopeResult = PaperBridgeEnvelopeSchema.safeParse(rawObj);
  if (!envelopeResult.success) {
    throw new PaperBridgeError(
      envelopeResult.error.issues[0]?.message ?? 'Invalid PaperBridge envelope structure.',
      'INVALID_TASK',
      envelopeResult.error,
    );
  }

  const envelope = envelopeResult.data;

  // Checksum verification
  const isValidChecksum = await verifyEnvelopeChecksum(envelope);
  if (!isValidChecksum) {
    throw new PaperBridgeError(
      'Checksum verification failed. The QR payload may be corrupted or modified.',
      'INVALID_CHECKSUM',
    );
  }

  return envelope;
}
