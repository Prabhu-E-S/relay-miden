import { z } from 'zod';
import {
  PaperBridgeError,
  PaperBridgeProtocolIdentifier,
  MAX_PAPERBRIDGE_PAYLOAD_BYTES,
  canonicalJsonStringify,
  computeEnvelopeChecksum,
  decodePaperBridgeMessage,
} from './paperbridge.js';
import { TaskAckPayloadSchema, TaskUpdatePayloadSchema } from './sync.js';
import { generateUuid } from './uuid.js';

const header = z.object({
  protocol: z.literal(PaperBridgeProtocolIdentifier),
  version: z.literal(2),
  messageId: z.uuid(),
  senderId: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
});

export const PaperBridgeV2EnvelopeSchema = z.discriminatedUnion('messageType', [
  header
    .extend({ messageType: z.literal('TASK_UPDATE'), payload: TaskUpdatePayloadSchema })
    .strict(),
  header.extend({ messageType: z.literal('TASK_ACK'), payload: TaskAckPayloadSchema }).strict(),
]);
export type PaperBridgeV2Envelope = z.infer<typeof PaperBridgeV2EnvelopeSchema>;
export type AnyPaperBridgeEnvelope =
  Awaited<ReturnType<typeof decodePaperBridgeMessage>> | PaperBridgeV2Envelope;

export async function createPaperBridgeV2Envelope(
  input:
    | { messageType: 'TASK_UPDATE'; payload: z.input<typeof TaskUpdatePayloadSchema> }
    | { messageType: 'TASK_ACK'; payload: z.input<typeof TaskAckPayloadSchema> },
  senderId: string,
  options: { messageId?: string; now?: string } = {},
): Promise<{ envelope: PaperBridgeV2Envelope; rawJson: string; byteSize: number }> {
  const withoutChecksum = {
    protocol: PaperBridgeProtocolIdentifier,
    version: 2 as const,
    messageId: options.messageId ?? generateUuid(),
    senderId,
    createdAt: options.now ?? new Date().toISOString(),
    messageType: input.messageType,
    payload:
      input.messageType === 'TASK_UPDATE'
        ? TaskUpdatePayloadSchema.parse(input.payload)
        : TaskAckPayloadSchema.parse(input.payload),
  };
  const envelope = PaperBridgeV2EnvelopeSchema.parse({
    ...withoutChecksum,
    checksum: await computeEnvelopeChecksum(withoutChecksum),
  });
  const rawJson = canonicalJsonStringify(envelope);
  const byteSize = new TextEncoder().encode(rawJson).length;
  if (byteSize > MAX_PAPERBRIDGE_PAYLOAD_BYTES) {
    throw new PaperBridgeError(
      `QR payload is ${byteSize} bytes; the ${MAX_PAPERBRIDGE_PAYLOAD_BYTES}-byte limit was exceeded. Shorten task text before exporting.`,
      'OVERSIZED_PAYLOAD',
    );
  }
  return { envelope, rawJson, byteSize };
}

export async function decodeAnyPaperBridgeMessage(raw: string): Promise<AnyPaperBridgeEnvelope> {
  if (!raw?.trim()) throw new PaperBridgeError('The QR code payload is empty.', 'EMPTY_PAYLOAD');
  if (new TextEncoder().encode(raw).length > MAX_PAPERBRIDGE_PAYLOAD_BYTES) {
    throw new PaperBridgeError('The QR payload exceeds the supported size.', 'OVERSIZED_PAYLOAD');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PaperBridgeError('The QR code is not valid JSON.', 'INVALID_JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PaperBridgeError('Invalid PaperBridge envelope.', 'INVALID_ENVELOPE');
  }
  const record = value as Record<string, unknown>;
  if (record.protocol !== PaperBridgeProtocolIdentifier) {
    throw new PaperBridgeError('Unsupported PaperBridge protocol.', 'UNSUPPORTED_PROTOCOL');
  }
  if (record.version === 1) return decodePaperBridgeMessage(raw);
  if (record.version !== 2)
    throw new PaperBridgeError('Unsupported PaperBridge version.', 'UNSUPPORTED_VERSION');
  if (record.messageType !== 'TASK_UPDATE' && record.messageType !== 'TASK_ACK') {
    throw new PaperBridgeError('Unsupported PaperBridge message type.', 'UNSUPPORTED_MESSAGE_TYPE');
  }
  const parsed = PaperBridgeV2EnvelopeSchema.safeParse(record);
  if (!parsed.success)
    throw new PaperBridgeError(
      parsed.error.issues[0]?.message ?? 'Invalid message.',
      'INVALID_ENVELOPE',
      parsed.error,
    );
  const { checksum, ...data } = parsed.data;
  if (checksum !== (await computeEnvelopeChecksum(data))) {
    throw new PaperBridgeError('QR checksum verification failed.', 'INVALID_CHECKSUM');
  }
  return parsed.data;
}
