import { z } from 'zod';

export const SupportedLanguageSchema = z.enum(['en', 'ml', 'ta']);
export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

export const TaskActionCodeSchema = z.enum([
  'DELIVER',
  'COLLECT',
  'DISTRIBUTE',
  'INSPECT',
  'CLEAN',
  'REPAIR',
  'REPORT',
  'ASSIST',
  'TRANSPORT',
  'RESTOCK',
]);
export type TaskActionCode = z.infer<typeof TaskActionCodeSchema>;

export const TaskItemCodeSchema = z.enum([
  'WATER',
  'FOOD',
  'MEDICINE',
  'CLOTHES',
  'SUPPLIES',
  'EQUIPMENT',
  'OTHER',
]);
export type TaskItemCode = z.infer<typeof TaskItemCodeSchema>;

export const TaskUnitCodeSchema = z.enum([
  'PIECE',
  'BOTTLE',
  'PACKET',
  'BOX',
  'BAG',
  'LITER',
  'KILOGRAM',
  'PERSON',
]);
export type TaskUnitCode = z.infer<typeof TaskUnitCodeSchema>;

export const StructuredTaskInstructionSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  actionCode: TaskActionCodeSchema,
  itemCode: TaskItemCodeSchema.optional(),
  quantity: z.number().int().positive().max(100_000).optional(),
  unitCode: TaskUnitCodeSchema.optional(),
  locationText: z.string().trim().max(160).optional(),
  additionalNotes: z.string().trim().max(1_000).optional(),
});

export type StructuredTaskInstruction = z.infer<typeof StructuredTaskInstructionSchema>;

export const TASK_ACTION_CODES: readonly TaskActionCode[] = TaskActionCodeSchema.options;
export const TASK_ITEM_CODES: readonly TaskItemCode[] = TaskItemCodeSchema.options;
export const TASK_UNIT_CODES: readonly TaskUnitCode[] = TaskUnitCodeSchema.options;
