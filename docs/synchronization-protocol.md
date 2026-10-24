# Relay Miden synchronization protocol — Phase 5

## Scope

PaperBridge is a manually carried, asynchronous QR transport. Phase 5 adds version 2 `TASK_UPDATE` and `TASK_ACK` messages while retaining version 1 `TASK_CREATE` decoding and import unchanged. Nothing is broadcast automatically. A device converges only after the required QR messages are physically exchanged. The shared domain rules in `packages/shared/src/sync.ts` have no React, Dexie, QR-rendering, or LAN dependency.

## Canonical task state and ancestry

The task state hash is SHA-256 of the canonical JSON for the complete validated task snapshot, with `deletedAt` normalized to `null` when absent. This includes canonical structured instruction codes, free text exactly as entered, immutable task identity, timestamps, status, and revision. Language preference and translated display strings are excluded because they are device-local. State hashes identify common snapshots even when a legacy v1 receiver gave its local `TASK_IMPORT` audit record a different operation ID than the creator's `TASK_CREATE` record.

Each local edit, status transition, deletion, or resolution appends one `TaskOperation`. New local operations retain `parentOperationId` in addition to Phase 2's `parentRevision`; imported v2 operations retain the sender's operation ID. Historical Phase 2/3 operations are preserved without invented parents. Export can infer a historical parent from its adjacent revision snapshot; if that snapshot is absent, export fails explicitly.

An ordinary update carries `taskId`, `operationId`, `originDeviceId`, `baseRevision`, `nextRevision`, `parentOperationId`, `baseStateHash`, `resultStateHash`, validated changed fields, and `updatedAt`. It advances exactly one revision. A resolution also carries the merged branch's operation ID and state hash and can advance to one above the highest branch revision. Resolution updates carry all mutable fields so the other branch can reproduce the selected state. No task ID, creator, or creation timestamp can be edited by a QR update.

## Classification and application

1. A known operation ID with the same result hash is already applied; no revision is added. Reusing that ID for different content is invalid.
2. If an update's base revision is ahead of local history, it is missing a parent. The user transfers the earlier QR, then scans this update again. There is no deferred inbox in Phase 5.
3. If the base revision and state hash match local head, the ordinary update is applicable. Its proposed task and result hash are validated before an atomic Dexie transaction writes the task, operation, and import ledger.
4. If the incoming branch starts at a known ancestor but local head has changed, it is a conflict. The incoming branch is reconstructed and validated, then preserved in an idempotent conflict record. Local task state is not overwritten.
5. If the incoming result is an already known ancestor, it is stale. If ancestry cannot be reconstructed, missing history is reported. Equal revision numbers alone never establish equality.
6. A resolution is applicable to the other branch only when its `mergedOperationId` is known locally, its merged state hash matches local head, and its result revision is higher. The full selected mutable state is then verified against the result hash and committed.

Soft-deleted tasks are excluded from normal lists. A normal update cannot resurrect one. Concurrent deletion and modification create a conflict; a deliberate user resolution is needed to choose a branch. Invalid lifecycle status transitions are rejected on ordinary updates. Reopening a completed task is marked explicitly. No timestamp-only or last-write-wins rule is used.

## Conflict resolution

Task Details shows the saved local and incoming branches and offers **Keep Local Version**, **Accept Incoming Version**, or leaving the conflict pending. Either decision creates a new `TASK_RESOLVE` operation and advances the task revision atomically with the conflict record. The operation stores the local parent and incoming merged operation/state hash. The selected complete mutable state can be exported as an update QR. The other device recognizes its own branch as the merge parent and applies the resolution, converging to the same canonical task hash.

## Outgoing identity and acknowledgments

Each local operation is exported individually. Its first v2 outgoing message and canonical raw JSON are stored in `outgoing`; redisplaying the same operation reuses the message ID and bytes. Multiple edits must be transferred in order. The Send screen selects operations explicitly and defaults to a newly resolved operation when present.

After an incoming update commits, the receiver can display a `TASK_ACK` QR referencing its exact message ID, operation ID, task ID, receiver device ID, applied revision, result, and time. The sender accepts an ACK only when all references and revision match a stored outgoing update. The ACK is stored once and marks the outgoing message acknowledged without touching the task revision. Checksums protect against accidental corruption but are **not digital signatures**; device IDs are anonymous assertions, not authenticated identities.

## Storage migration and limits

Dexie version 3 adds `outgoing`, `acknowledgments`, and `conflicts`, plus operation ancestry indexes. Version 1/2 tasks, operations, settings, and import records are retained. Incoming update writes and resolution writes are transactional. Outgoing envelope creation checks the existing 2,048-byte limit and never truncates data. If an operation does not fit, the UI reports the error and the local operation remains available; Phase 5 has no multi-QR fragmentation.

The application performs task and QR work locally after loading. Service-worker caching and startup without a running host are Phase 8. LAN transport, automatic delivery, retries, authentication, and the Phase 7 durable queue are outside this phase.
