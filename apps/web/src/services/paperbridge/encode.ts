import {
  createPaperBridgeEnvelope,
  type PaperBridgeEnvelope,
  type Task,
} from '@relay-miden/shared';

export interface EncodeTaskResult {
  envelope: PaperBridgeEnvelope;
  rawJson: string;
  byteSize: number;
}

/**
 * Encodes a local task into a validated PaperBridge envelope with SHA-256 checksum,
 * ensuring payload stays within single-QR capacity limits.
 */
export async function encodeTaskForQR(
  task: Task,
  senderId: string,
  options: { messageId?: string; now?: string } = {},
): Promise<EncodeTaskResult> {
  return createPaperBridgeEnvelope(task, senderId, options);
}
