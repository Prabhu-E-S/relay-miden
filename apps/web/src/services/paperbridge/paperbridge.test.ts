import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import type { Task } from '@relay-miden/shared';
import {
  computeEnvelopeChecksum,
  decodePaperBridgeMessage,
  encodeTaskForQR,
  generateQRCodeDataUrl,
  MAX_PAPERBRIDGE_PAYLOAD_BYTES,
  PaperBridgeError,
  PaperBridgeProtocolIdentifier,
  PAPERBRIDGE_PROTOCOL_VERSION,
  verifyEnvelopeChecksum,
} from './index.js';

const sampleTask: Task = {
  id: 'a1111111-2222-4333-8444-555555555555',
  action: 'DELIVER_SUPPLIES',
  title: 'Deliver 20 water bottles',
  description: 'Deliver sealed cartons to Relief Camp Gate B.',
  quantity: 20,
  unit: 'Cartons',
  location: 'Gate B, North Sector',
  priority: 'high',
  status: 'pending',
  createdAt: '2026-10-24T12:00:00.000Z',
  updatedAt: '2026-10-24T12:00:00.000Z',
  createdBy: 'd1111111-2222-4333-8444-555555555555',
  revision: 1,
  deletedAt: null,
};

const senderDeviceId = 'd2222222-3333-4444-8555-666666666666';

describe('PaperBridge Encoding', () => {
  it('1. valid task produces a PaperBridge envelope', async () => {
    const { envelope } = await encodeTaskForQR(sampleTask, senderDeviceId);
    expect(envelope).toBeDefined();
    expect(envelope.messageId).toBeDefined();
  });

  it('2. envelope has the correct protocol identifier', async () => {
    const { envelope } = await encodeTaskForQR(sampleTask, senderDeviceId);
    expect(envelope.protocol).toBe(PaperBridgeProtocolIdentifier);
    expect(envelope.protocol).toBe('RELAY_MIDEN_PAPERBRIDGE');
  });

  it('3. envelope has version 1', async () => {
    const { envelope } = await encodeTaskForQR(sampleTask, senderDeviceId);
    expect(envelope.version).toBe(1);
    expect(envelope.version).toBe(PAPERBRIDGE_PROTOCOL_VERSION);
  });

  it('4. message ID is unique across encodings', async () => {
    const resultA = await encodeTaskForQR(sampleTask, senderDeviceId);
    const resultB = await encodeTaskForQR(sampleTask, senderDeviceId);
    expect(resultA.envelope.messageId).not.toBe(resultB.envelope.messageId);
    expect(resultA.envelope.messageId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(resultB.envelope.messageId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('5. task ID is preserved in payload', async () => {
    const { envelope } = await encodeTaskForQR(sampleTask, senderDeviceId);
    expect(envelope.payload.taskId).toBe(sampleTask.id);
  });

  it('6. task metadata is preserved faithfully', async () => {
    const { envelope } = await encodeTaskForQR(sampleTask, senderDeviceId);
    expect(envelope.payload).toMatchObject({
      taskId: sampleTask.id,
      action: sampleTask.action,
      title: sampleTask.title,
      description: sampleTask.description,
      quantity: sampleTask.quantity,
      unit: sampleTask.unit,
      location: sampleTask.location,
      priority: sampleTask.priority,
      status: sampleTask.status,
      createdAt: sampleTask.createdAt,
      updatedAt: sampleTask.updatedAt,
      createdBy: sampleTask.createdBy,
      revision: sampleTask.revision,
    });
  });

  it('7. checksum is deterministic for identical canonical contents', async () => {
    const messageId = 'c1111111-2222-4333-8444-555555555555';
    const now = '2026-10-24T12:30:00.000Z';
    const enc1 = await encodeTaskForQR(sampleTask, senderDeviceId, { messageId, now });
    const enc2 = await encodeTaskForQR(sampleTask, senderDeviceId, { messageId, now });
    expect(enc1.envelope.checksum).toBe(enc2.envelope.checksum);
    expect(enc1.envelope.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyEnvelopeChecksum(enc1.envelope)).toBe(true);
  });
});

describe('PaperBridge Decoding & Validation', () => {
  it('8. valid payload decodes successfully', async () => {
    const { rawJson, envelope } = await encodeTaskForQR(sampleTask, senderDeviceId);
    const decoded = await decodePaperBridgeMessage(rawJson);
    expect(decoded).toEqual(envelope);
  });

  it('9. invalid JSON is rejected with INVALID_JSON error', async () => {
    await expect(decodePaperBridgeMessage('{not-valid-json')).rejects.toThrowError(
      PaperBridgeError,
    );
    try {
      await decodePaperBridgeMessage('{not-valid-json');
    } catch (err) {
      expect((err as PaperBridgeError).code).toBe('INVALID_JSON');
    }
  });

  it('10. unsupported protocol is rejected', async () => {
    const { envelope } = await encodeTaskForQR(sampleTask, senderDeviceId);
    const modified = { ...envelope, protocol: 'UNKNOWN_PROTOCOL' };
    await expect(decodePaperBridgeMessage(JSON.stringify(modified))).rejects.toMatchObject({
      code: 'UNSUPPORTED_PROTOCOL',
    });
  });

  it('11. unsupported version is rejected with explicit version details', async () => {
    const { envelope } = await encodeTaskForQR(sampleTask, senderDeviceId);
    const modified = { ...envelope, version: 2 };
    await expect(decodePaperBridgeMessage(JSON.stringify(modified))).rejects.toMatchObject({
      code: 'UNSUPPORTED_VERSION',
    });
  });

  it('12. missing required fields are rejected', async () => {
    const { envelope } = await encodeTaskForQR(sampleTask, senderDeviceId);
    const withoutPayload = { ...envelope, payload: undefined };
    await expect(decodePaperBridgeMessage(JSON.stringify(withoutPayload))).rejects.toMatchObject({
      code: 'INVALID_TASK',
    });
  });

  it('13. modified payload fails checksum verification', async () => {
    const { envelope } = await encodeTaskForQR(sampleTask, senderDeviceId);
    // Tamper with the title without updating the checksum
    const tampered = {
      ...envelope,
      payload: {
        ...envelope.payload,
        title: 'Tampered title that does not match checksum',
      },
    };
    await expect(decodePaperBridgeMessage(JSON.stringify(tampered))).rejects.toMatchObject({
      code: 'INVALID_CHECKSUM',
    });
  });

  it('14. invalid task data is rejected (e.g. quantity without unit)', async () => {
    const { envelope } = await encodeTaskForQR(sampleTask, senderDeviceId);
    const invalidTask = {
      ...envelope,
      payload: {
        ...envelope.payload,
        unit: undefined, // quantity is 20, so missing unit violates schema
      },
    };
    const withoutUnit = { ...invalidTask, checksum: await computeEnvelopeChecksum(invalidTask) };
    await expect(decodePaperBridgeMessage(JSON.stringify(withoutUnit))).rejects.toMatchObject({
      code: 'INVALID_TASK',
    });
  });

  it('15. oversized payload is rejected during encoding and decoding', async () => {
    const longDescription = 'A'.repeat(MAX_PAPERBRIDGE_PAYLOAD_BYTES + 500);
    const hugeTask: Task = {
      ...sampleTask,
      description: longDescription,
    };
    // Exceeds max schema and max byte threshold
    await expect(encodeTaskForQR(hugeTask, senderDeviceId)).rejects.toMatchObject({
      code: 'INVALID_TASK',
    });

    const hugeRawPayload = 'X'.repeat(MAX_PAPERBRIDGE_PAYLOAD_BYTES * 3);
    await expect(decodePaperBridgeMessage(hugeRawPayload)).rejects.toMatchObject({
      code: 'OVERSIZED_PAYLOAD',
    });
  });

  it('rejects empty payloads', async () => {
    await expect(decodePaperBridgeMessage('')).rejects.toMatchObject({
      code: 'EMPTY_PAYLOAD',
    });
    await expect(decodePaperBridgeMessage('   ')).rejects.toMatchObject({
      code: 'EMPTY_PAYLOAD',
    });
  });
});

describe('PaperBridge QR Generation and Roundtrip Verification', () => {
  it('25. QR image generation produces a valid data URL', async () => {
    const { rawJson } = await encodeTaskForQR(sampleTask, senderDeviceId);
    const dataUrl = await generateQRCodeDataUrl(rawJson);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(dataUrl.length).toBeGreaterThan(100);
  });

  it('26. generated QR can be decoded back to the original payload using jsQR', async () => {
    const { rawJson, envelope } = await encodeTaskForQR(sampleTask, senderDeviceId);

    // Create QR matrix with quiet zone margin using qrcode
    const qrMatrix = await QRCode.create(rawJson, { errorCorrectionLevel: 'M' });
    const margin = 4;
    const innerSize = qrMatrix.modules.size;
    const size = innerSize + margin * 2;
    const rgba = new Uint8ClampedArray(size * size * 4);
    rgba.fill(255); // White background

    for (let row = 0; row < innerSize; row++) {
      for (let col = 0; col < innerSize; col++) {
        const isDark = qrMatrix.modules.get(row, col);
        const idx = ((row + margin) * size + (col + margin)) * 4;
        const color = isDark ? 0 : 255;
        rgba[idx] = color;
        rgba[idx + 1] = color;
        rgba[idx + 2] = color;
        rgba[idx + 3] = 255;
      }
    }

    const decoded = jsQR(rgba, size, size);
    expect(decoded).toBeDefined();
    expect(decoded?.data).toBe(rawJson);

    // Parse and verify decoded string
    const decodedEnvelope = await decodePaperBridgeMessage(decoded!.data);
    expect(decodedEnvelope).toEqual(envelope);
  });

  it('27. typical task payloads remain safely within the configured QR capacity', async () => {
    const typicalTask: Task = {
      ...sampleTask,
      title: 'Distribute medical relief kits to Camp 4',
      description:
        'First aid kits with bandages, sterile gauze, antiseptic solution, and oral rehydration salts.',
      quantity: 50,
      unit: 'Kits',
      location: 'Camp 4 Primary Health Post',
    };
    const { byteSize } = await encodeTaskForQR(typicalTask, senderDeviceId);
    // Typical task is well within 2048 bytes (usually ~450 to 650 bytes)
    expect(byteSize).toBeLessThan(MAX_PAPERBRIDGE_PAYLOAD_BYTES);
    expect(byteSize).toBeGreaterThan(300);
    expect(byteSize).toBeLessThan(800);
  });
});
