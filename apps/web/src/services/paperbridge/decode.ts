import { decodePaperBridgeMessage, type PaperBridgeEnvelope } from '@relay-miden/shared';

/**
 * Decodes and validates raw QR content against PaperBridge protocol specification,
 * checking format, protocol identifier, version, schema, and cryptographic SHA-256 checksum.
 */
export async function decodePaperBridgeQR(rawContent: string): Promise<PaperBridgeEnvelope> {
  return decodePaperBridgeMessage(rawContent);
}

export { decodePaperBridgeMessage };
