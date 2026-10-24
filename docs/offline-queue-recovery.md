# Relay Miden — Phase 7: Durable Offline Queue, Automatic Reconnection & Synchronization Recovery Protocol

## 1. Overview & System Mission

Relay Miden is designed for austere, post-disaster, and network-denied environments where LAN connectivity is intermittent, unreliable, or completely absent.

Phase 7 establishes a **durable, persistent outbox queue** and an **autonomous reconnection coordinator**:

- Every locally authored mutation (`TASK_CREATE`, `TASK_UPDATE`, `TASK_DELETE`, `TASK_RESOLVE`) is committed inside an atomic IndexedDB transaction alongside the task state and append-only operation log.
- Operations awaiting server acceptance remain durably persisted across browser restarts, laptop sleep, page refreshes, and network drops.
- When the device regains LAN connectivity, the Socket.IO client automatically reconnects with bounded exponential backoff and jitter, restores anonymous device registration, pulls missing server operations, and replays pending outbox operations in strict causal dependency order.
- Remote QR imports (PaperBridge) are tracked separately and never falsely enqueued as local outbox operations.
- Concurrent conflicts arising during offline disconnects are classified using Phase 5 causal ancestry and presented for user resolution.

---

## 2. Durable Outbox Schema (Dexie IndexedDB Version 4)

Stored in Dexie table `outbox` with primary key `operationId`:

```typescript
export interface OutboxEntry {
  operationId: string; // Stable canonical UUID (never regenerated across retries)
  taskId: string; // Target task UUID
  originDeviceId: string; // Anonymous local device ID
  status: OutboxStatus; // 'PENDING' | 'IN_FLIGHT' | 'ACKNOWLEDGED' | 'BLOCKED' | 'FAILED'
  attemptCount: number; // Replay attempt counter
  lastAttemptAt?: string; // ISO timestamp of last submission attempt
  nextRetryAt?: string; // ISO timestamp for exponential backoff scheduling
  lastError?: string; // Description of last transient or blocking failure
  createdAt: string; // ISO timestamp of local operation generation
  acknowledgedAt?: string; // ISO timestamp of server durable acceptance
  serverSequence?: number; // Server monotonically increasing operation sequence
}
```

### Table Indices

- Primary key: `operationId`
- Compound & lookup indices: `taskId, status, originDeviceId, createdAt, nextRetryAt, [status+nextRetryAt], [taskId+status]`

---

## 3. Queue State Machine & Allowed Transitions

```
               [Local Task Mutation]
                        │
                        ▼
                   ┌─────────┐
                   │ PENDING │ ◄───────────────┐
                   └────┬────┘                 │
                        │ (Submit)             │ (Transient error / timeout)
                        ▼                      │
                  ┌───────────┐                │
                  │ IN_FLIGHT ├────────────────┘
                  └─┬───────┬─┘
                    │       │
    (Server APPLIED │       │ (Missing parent / Concurrent conflict)
 or ALREADY_APPLIED)│       ▼
                    │  ┌─────────┐
                    │  │ BLOCKED ├──────┐ (User resolution / manual retry)
                    │  └─────────┘      │
                    ▼                   ▼
            ┌──────────────┐       ┌─────────┐
            │ ACKNOWLEDGED │       │ PENDING │
            └──────────────┘       └─────────┘
                    ▲                   ▲
                    │                   │ (Corrective action / manual retry)
                    │  ┌─────────┐      │
                    └──┤ FAILED  ├──────┘
                       └─────────┘
              (Permanent validation error)
```

### Transition Specifications

1. **PENDING -> IN_FLIGHT**: Triggered when the single-flight synchronization coordinator begins transmission of an eligible operation over the LAN socket.
2. **IN_FLIGHT -> ACKNOWLEDGED**: Durably accepted by server with `status: 'APPLIED'` or verified duplicate `status: 'ALREADY_APPLIED'`. Records `acknowledgedAt` and `serverSequence`.
3. **IN_FLIGHT -> PENDING**: Transport error, socket disconnect, or submission timeout. Increments `attemptCount`, applies exponential backoff delay with jitter, and sets `nextRetryAt`.
4. **IN_FLIGHT -> BLOCKED**: Server rejects with `CONFLICT`, `MISSING_PARENT`, or `STALE`. Retained durably without deletion until prerequisite parent operations or conflict resolution are completed.
5. **IN_FLIGHT -> FAILED**: Irrecoverable validation failure (e.g. `INVALID`, `UNAUTHORIZED`, `DUPLICATE_MISMATCH`). Retained for user inspection; does not retry automatically in a tight loop.
6. **Recovery of Abandoned IN_FLIGHT**: On database open or browser refresh, `resetAbandonedInFlight()` resets any entries stuck in `IN_FLIGHT` back to `PENDING`.

---

## 4. Automatic LAN Reconnection & Backoff Policy

### Connection State Lifecycle

```
NOT_CONFIGURED -> CONNECTING -> REGISTERING -> CONNECTED -> SYNCING
                       ▲                             │
                       │                             ▼
                       └──────── RECONNECTING ◄── DISCONNECTED
```

### Backoff Algorithm

- Base delay: 1,000 ms
- Exponential factor: $2^{\text{attempt} - 1}$
- Delays: 1s -> 2s -> 4s -> 8s -> 16s -> 30s (capped at 30,000 ms)
- Random jitter: $\pm 20\%$ to prevent herd reconnect storms across multiple disaster-relief devices on the same access point.

### Reconnection Invariants

1. **Clean Event Listeners**: All existing socket listeners are explicitly removed before establishing a new socket or reconnection.
2. **Explicit Disconnect**: When the user clicks "Disconnect", `isExplicitlyDisconnected` is set to `true`, clearing all retry timers and intervals. Reconnection does not occur until the user selects "Connect".
3. **Lifecycle Events**: Listens to browser `online` and `visibilitychange` events; if configured and disconnected unexpectedly, immediately triggers reconnect check.
4. **Device Re-registration**: Every reconnection automatically transmits `device:register` with persistent `deviceId` and protocol version `LAN_PROTOCOL_VERSION = 1` before allowing operation submission.

---

## 5. Single-Flight Synchronization Coordinator & Causal Replay

All incoming sync pulls and outgoing outbox replays are serialized through `activeSyncPromise` in `sync.ts`:

1. **Phase 1: Invalidation Check & Catch-Up Pull**
   - Client sends `sync:request` starting from its persistent `cursor`.
   - If `cursor > batch.totalServerOperations`, a server database reset or replacement is detected and the cursor is safely reset to 0.
   - Operations in the batch are applied sequentially using `applyIncomingLanOperation`.
   - **Cursor Safety**: Local cursor advances monotonically only after each contiguous operation has successfully committed to IndexedDB.

2. **Phase 2: Strict Causal Outbox Replay**
   - Retrieves all eligible `PENDING` outbox entries where `nextRetryAt <= now`.
   - Sorted in strict causal order:
     - Operations on the same task are ordered by `revision` ascending (parents strictly before children).
     - Across independent tasks, ordered by `createdAt` ascending.
   - Replays operations sequentially. If a parent operation fails or blocks, all dependent child operations in the pass are marked `BLOCKED`.

3. **Phase 3: Follow-Up Catch-Up Check**
   - If any outbox operations were accepted, performs a bounded follow-up sync pull to ingest concurrent broadcasts or resolutions.

---

## 6. Conflict Handling and QR/LAN Interoperability

1. **Lost Acknowledgment Scenario**:
   - Client submits operation $O_1$.
   - Server commits $O_1$, but network drops before client receives acceptance.
   - Client reconnects and retries $O_1$ with the identical, stable `operationId`.
   - Server detects existing operation hash and returns `ALREADY_APPLIED`.
   - Client records $O_1$ as `ACKNOWLEDGED`. Server operations log is not duplicated.

2. **Concurrent Branch Reconnection**:
   - Device A edits status while Device B edits title while offline.
   - Upon reconnect, Device B pulls Device A's revision 2.
   - Phase 5 pure causal engine detects concurrent branch from revision 1 and creates a conflict audit record in `db.conflicts`.
   - Device B's pending update is marked `BLOCKED`.
   - User resolves conflict via `SyncRepository.resolveConflict`, generating a canonical `TASK_RESOLVE` operation with merged operation IDs and state hashes.
   - The resolution enters `outbox` atomically, replays to the server, and server accepts it as revision 3. Both devices converge.

3. **Transport Interoperability**:
   - Operations imported via PaperBridge QR are stored as `TASK_IMPORT` and never enter the local `outbox`.
   - Only locally authored actions (`TASK_CREATE`, `TASK_UPDATE`, `TASK_DELETE`, `TASK_RESOLVE`) are eligible for LAN replay.
