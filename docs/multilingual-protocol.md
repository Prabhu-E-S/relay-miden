# Relay Miden multilingual task protocol

## Purpose

Relay Miden communicates structured intent instead of translating arbitrary sentences. A device stores canonical codes and renders them with locally bundled templates in English (`en`), Malayalam (`ml`), or Tamil (`ta`). No translation API or network request is used.

## Canonical instruction

`StructuredTaskInstruction` is an optional, backward-compatible part of a task:

```ts
{
  schemaVersion: 1,
  actionCode: 'DELIVER',
  itemCode: 'WATER',
  quantity: 20,
  unitCode: 'BOTTLE',
  locationText: 'Gate B',
  additionalNotes: 'Leave at the north entrance'
}
```

Supported action, item, and unit values are Zod-validated in `@relay-miden/shared`. The task keeps its ordinary title, location, quantity, unit, description, ID, revision, timestamps, and creator identity. Existing free-text tasks simply omit `instruction`.

## Rendering

`apps/web/src/i18n/formatTask.ts` selects a local dictionary and language-specific sentence formatter. English uses its own SVO template; Malayalam and Tamil use their own location-first templates and postpositions. Missing translation entries fall back safely to canonical codes. User-entered locations and notes are preserved unchanged, because fixed dictionaries cannot reliably translate arbitrary prose.

## Local language preference

`LanguageProvider` defaults to English and stores the selected language in local browser storage under `relay-miden-language`. The preference controls UI labels and structured-task rendering immediately. It does not modify canonical task records, task ownership, IDs, revisions, or PaperBridge data.

## PaperBridge compatibility

PaperBridge v1 continues to use the same protocol identifier, checksum algorithm, message IDs, task IDs, revision checks, import ledger, and duplicate detection. Its task payload carries the optional instruction unchanged. A receiver can import a Malayalam-created structured task and render it in Tamil or English. Legacy v1 envelopes with no instruction remain valid and show their original free-text title.

## Limitations

- The three bundled languages cover structured codes and selected task workflow UI; arbitrary locations and notes stay in their original language.
- This phase does not add acknowledgment QR messages, LAN transport, synchronization, service-worker caching, or automatic translation of free-form text.
- Browser storage and locally saved language preferences may be cleared by the user or browser.
