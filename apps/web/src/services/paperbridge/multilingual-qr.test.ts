import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  createPaperBridgeEnvelope,
  decodePaperBridgeMessage,
  PAPERBRIDGE_PROTOCOL_VERSION,
  PaperBridgeProtocolIdentifier,
  type StructuredTaskInstruction,
  type Task,
} from '@relay-miden/shared';
import { formatStructuredTask, formatTaskDisplayTitle } from '../../i18n';
import { RelayMidenDatabase } from '../../db/database';
import { TaskRepository } from '../../db/task-repository';

function createIsolatedRepository() {
  const dbName = `relay-miden-ml-qr-${crypto.randomUUID()}`;
  const isolatedDb = new RelayMidenDatabase(dbName);
  const repository = new TaskRepository(isolatedDb);
  return { repository, isolatedDb };
}

describe('Phase 4: Multilingual PaperBridge QR Protocol & Transfer', () => {
  const structuredInstruction: StructuredTaskInstruction = {
    schemaVersion: 1,
    actionCode: 'DELIVER',
    itemCode: 'WATER',
    quantity: 20,
    unitCode: 'BOTTLE',
    locationText: 'Gate B',
    additionalNotes: 'Keep chilled if possible',
  };

  const sampleStructuredTask: Task = {
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab',
    action: 'DELIVER_SUPPLIES',
    title: 'Deliver 20 bottles of water to Gate B.',
    description: 'Keep chilled if possible',
    quantity: 20,
    unit: 'Bottles',
    location: 'Gate B',
    priority: 'high',
    status: 'pending',
    createdAt: '2026-10-24T14:00:00.000Z',
    updatedAt: '2026-10-24T14:00:00.000Z',
    createdBy: 'device-sender-malayalam-001',
    revision: 1,
    deletedAt: null,
    instruction: structuredInstruction,
  };

  it('encodes a structured task into a PaperBridge envelope carrying canonical instruction', async () => {
    const { envelope, rawJson, byteSize } = await createPaperBridgeEnvelope(
      sampleStructuredTask,
      sampleStructuredTask.createdBy,
    );

    expect(envelope.protocol).toBe(PaperBridgeProtocolIdentifier);
    expect(envelope.version).toBe(PAPERBRIDGE_PROTOCOL_VERSION);
    expect(envelope.payload.taskId).toBe(sampleStructuredTask.id);
    expect(envelope.payload.instruction).toBeDefined();
    expect(envelope.payload.instruction).toEqual(structuredInstruction);
    expect(envelope.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(rawJson.length).toBeGreaterThan(0);
    expect(byteSize).toBeLessThan(2048);
  });

  it('decodes a raw PaperBridge string and reconstructs the exact canonical instruction', async () => {
    const { rawJson } = await createPaperBridgeEnvelope(
      sampleStructuredTask,
      sampleStructuredTask.createdBy,
    );

    const decoded = await decodePaperBridgeMessage(rawJson);
    expect(decoded.payload.taskId).toBe(sampleStructuredTask.id);
    expect(decoded.payload.instruction).toEqual(structuredInstruction);
    expect(decoded.payload.instruction?.actionCode).toBe('DELIVER');
    expect(decoded.payload.instruction?.itemCode).toBe('WATER');
    expect(decoded.payload.instruction?.quantity).toBe(20);
    expect(decoded.payload.instruction?.unitCode).toBe('BOTTLE');
    expect(decoded.payload.instruction?.locationText).toBe('Gate B');
  });

  it('detects tampering in the structured instruction payload', async () => {
    const { rawJson } = await createPaperBridgeEnvelope(
      sampleStructuredTask,
      sampleStructuredTask.createdBy,
    );

    const parsed = JSON.parse(rawJson);
    // Tamper with quantity inside instruction
    parsed.payload.instruction.quantity = 999;
    const tamperedJson = JSON.stringify(parsed);

    await expect(decodePaperBridgeMessage(tamperedJson)).rejects.toThrow(
      /Checksum verification failed/,
    );
  });

  it('full cross-language round trip: created in Malayalam, transferred via QR, viewed in Tamil and English', async () => {
    const { repository: receiverRepo, isolatedDb } = createIsolatedRepository();

    try {
      // Step 1: Device A (Malayalam user) creates the task
      // In Malayalam, preview renders: "Gate B-ലേക്ക് 20 കുപ്പി വെള്ളം എത്തിക്കുക."
      const mlDisplay = formatStructuredTask(sampleStructuredTask.instruction!, 'ml');
      expect(mlDisplay).toContain('Gate B-ലേക്ക്');
      expect(mlDisplay).toContain('20 കുപ്പി വെള്ളം എത്തിക്കുക');

      // Step 2: Device A generates PaperBridge QR
      const { rawJson } = await createPaperBridgeEnvelope(
        sampleStructuredTask,
        sampleStructuredTask.createdBy,
      );

      // Step 3: Device B (Tamil user) scans and decodes the QR code
      const decodedEnvelope = await decodePaperBridgeMessage(rawJson);
      expect(decodedEnvelope.payload.taskId).toBe(sampleStructuredTask.id);

      // Step 4: Device B imports the task into its local database
      const importResult = await receiverRepo.importPaperBridgeTask(decodedEnvelope);
      expect(importResult.status).toBe('imported');
      if (importResult.status !== 'imported') return;

      const importedTask = importResult.task;
      expect(importedTask.instruction).toBeDefined();
      expect(importedTask.instruction?.actionCode).toBe('DELIVER');

      // Step 5: Device B views the imported task in Tamil
      const taDisplay = formatTaskDisplayTitle(importedTask, 'ta');
      expect(taDisplay).toBe('Gate B-க்கு 20 பாட்டில் தண்ணீர் வழங்கவும்.');

      // Step 6: User switches display language to English
      const enDisplay = formatTaskDisplayTitle(importedTask, 'en');
      expect(enDisplay).toBe('Deliver 20 bottles of water to Gate B.');

      // Step 7: Verify task metadata, revision, ID, and author are completely preserved
      expect(importedTask.id).toBe(sampleStructuredTask.id);
      expect(importedTask.revision).toBe(sampleStructuredTask.revision);
      expect(importedTask.createdBy).toBe(sampleStructuredTask.createdBy);
      expect(importedTask.createdAt).toBe(sampleStructuredTask.createdAt);

      // Step 8: Verify duplicate import prevention works on structured tasks
      const duplicateResult = await receiverRepo.importPaperBridgeTask(decodedEnvelope);
      expect(duplicateResult.status).toBe('duplicate');
    } finally {
      await isolatedDb.delete();
    }
  });

  it('backward compatibility: decodes and imports Phase 3 envelopes without instruction', async () => {
    const { repository: receiverRepo, isolatedDb } = createIsolatedRepository();

    try {
      const legacyTask: Task = {
        id: 'b2c3d4e5-f6a7-4b8c-9d0e-123456789abc',
        action: 'CUSTOM',
        title: 'Legacy Phase 3 Task Title',
        description: 'Original legacy description',
        location: 'Sector 5',
        priority: 'urgent',
        status: 'pending',
        createdAt: '2026-10-24T10:00:00.000Z',
        updatedAt: '2026-10-24T10:00:00.000Z',
        createdBy: 'device-legacy-001',
        revision: 1,
        deletedAt: null,
      };

      const { rawJson } = await createPaperBridgeEnvelope(legacyTask, legacyTask.createdBy);
      const decoded = await decodePaperBridgeMessage(rawJson);

      expect(decoded.payload.instruction).toBeUndefined();
      expect(decoded.payload.title).toBe('Legacy Phase 3 Task Title');

      const importResult = await receiverRepo.importPaperBridgeTask(decoded);
      expect(importResult.status).toBe('imported');
      if (importResult.status !== 'imported') return;

      // Legacy task displays original title in all languages without crashing
      expect(formatTaskDisplayTitle(importResult.task, 'en')).toBe('Legacy Phase 3 Task Title');
      expect(formatTaskDisplayTitle(importResult.task, 'ml')).toBe('Legacy Phase 3 Task Title');
      expect(formatTaskDisplayTitle(importResult.task, 'ta')).toBe('Legacy Phase 3 Task Title');
    } finally {
      await isolatedDb.delete();
    }
  });
});
