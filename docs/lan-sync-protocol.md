# Relay Miden — Phase 6 LAN Synchronization Protocol

## 1. Overview and Purpose

Relay Miden Phase 6 introduces real-time local area network (LAN) synchronization between devices connected to the same Wi-Fi network, mobile hotspot, or local Ethernet switch. It operates entirely without internet access, external databases, cloud brokers, or SaaS relays.

The architecture comprises:

1. **Local Server (`apps/server`)**: A Node.js, Express, and Socket.IO coordinator backed by host-local SQLite persistence (`node:sqlite`).
2. **Local Client (`apps/web`)**: A browser-side Socket.IO client service (`src/services/lan/`) that maintains offline-first Dexie/IndexedDB as the primary source of truth while propagating and receiving operations in real time.
3. **Canonical Causal Model**: Direct reuse of Phase 5 causal ancestry, parent operation IDs, state hashing (`SHA-256`), and conflict detection/resolution semantics.

---

## 2. Protocol Version and Identification

- **Protocol Version**: `1` (`LAN_PROTOCOL_VERSION = 1`)
- **Transport**: Socket.IO over WebSockets with HTTP polling fallback.
- **Envelope Validation**: Zod runtime schema validation on all incoming and outgoing messages.

---

## 3. Trust Model and Registration

### Device Identity

Devices identify themselves using their persistent anonymous UUID generated during Phase 2 (`device:register`). Device IDs serve as causal actors and sequence attribution, not cryptographic authentication.

### LAN Access Control

For trusted local environments, the server supports an optional host-configured session token (`LAN_SESSION_TOKEN`).

- When set, incoming connections must supply the matching `sessionToken` in `device:register`.
- If invalid or missing, the server rejects registration with `UNAUTHORIZED`.
- Once registered, the socket is tied to that `deviceId`. Subsequent operation submissions from that socket must match the registered `deviceId`, preventing spoofing across open sockets.

---

## 4. Message Envelopes and Socket.IO Events

### Client -> Server Events

#### `device:register`

Registers the client session with the local server.

```typescript
{
  protocolVersion: 1,
  deviceId: string,        // UUID
  displayName?: string,    // Max 80 chars
  appVersion?: string,     // Max 40 chars
  sessionToken?: string    // Optional LAN token
}
```

#### `sync:request`

Requests incremental or initial catch-up synchronization.

```typescript
{
  protocolVersion: 1,
  deviceId: string,        // UUID
  cursor?: number,         // Last known server sequence (default 0)
  limit?: number           // Max operations per batch (max 500, default 50)
}
```

#### `operation:submit`

Submits a local task operation for durable server application.

```typescript
{
  protocolVersion: 1,
  requestId: string,       // UUID for correlation
  deviceId: string,        // UUID
  operation: LanOperationPayload
}
```

### Server -> Client Events

#### `device:registered`

```typescript
{
  protocolVersion: 1,
  success: boolean,
  serverDeviceId: string,
  currentSequence: number,
  message?: string
}
```

#### `sync:operations`

Returns a batch of operations ordered by monotonic server sequence.

```typescript
{
  operations: Array<{
    sequence: number,
    operation: LanOperationPayload
  }>,
  cursor: number,
  hasMore: boolean,
  totalServerOperations: number
}
```

#### `operation:accepted`

Acknowledges that an operation has been validated and committed to SQLite.

```typescript
{
  requestId: string,
  operationId: string,
  taskId: string,
  sequence: number,
  revision: number,
  resultStateHash: string,
  status: 'APPLIED' | 'ALREADY_APPLIED'
}
```

#### `operation:rejected`

```typescript
{
  requestId: string,
  operationId: string,
  taskId?: string,
  classification: 'STALE' | 'MISSING_PARENT' | 'CONFLICT' | 'INVALID' | 'UNAUTHORIZED' | 'DUPLICATE_MISMATCH',
  reason: string
}
```

#### `operation:broadcast`

Broadcasts committed operations in real time to all connected clients except the original sender.

```typescript
{
  sequence: number,
  operation: LanOperationPayload
}
```

---

## 5. Operation Types and Causal Integration

All operations carry the Phase 5 causal model:

### `TASK_CREATE`

```typescript
{
  type: 'TASK_CREATE',
  operationId: string,
  taskId: string,
  actorId: string,
  task: Task,
  resultStateHash: string,
  timestamp: string
}
```

### `TASK_UPDATE`

```typescript
{
  type: 'TASK_UPDATE',
  update: TaskUpdatePayload // Identical schema to Phase 5 PaperBridge QR updates
}
```

Where `TaskUpdatePayload` includes:

- `taskId`, `operationId`, `originDeviceId`
- `baseRevision`, `nextRevision`, `parentOperationId`
- `baseStateHash`, `resultStateHash`
- `changes` (status, priority, title, location, description, quantity, unit, instruction)
- `resolution` (if resolving a concurrent branch)
- `reopen` (if reopening a completed task)

---

## 6. Server SQLite Schema

The server maintains a local SQLite database (`data/relay-miden.sqlite`) in WAL mode (`journal_mode = WAL`) with foreign key enforcement:

- `server_metadata`: Schema migration versioning and stable `server_device_id`.
- `devices`: Connected and registered client devices, protocol versions, and `last_seen_at`.
- `tasks`: Canonical task projections (`id`, `revision`, `title`, `location`, `priority`, `status`, `action`, `created_by`, `state_hash`, `updated_at`, `deleted_at`).
- `operations`: Append-only log with strictly monotonic `sequence INTEGER PRIMARY KEY AUTOINCREMENT`, unique `operation_id`, `task_id`, `actor_id`, `payload_json`.
- `conflicts`: Detected branch conflicts for audit and resolution verification.

---

## 7. Synchronization Workflows

### Initial Connection / Catch-Up Sync

1. Client connects via Socket.IO.
2. Client registers device identity (`device:register`).
3. Client requests synchronization from its last known cursor (`sync:request`).
4. Server returns bounded batch (`sync:operations`).
5. Client imports operations into IndexedDB using the Phase 5 causal engine.
6. Client updates its persistent cursor (`lanConnection.setSyncCursor`).

### Real-Time Propagation

1. User creates or edits a task locally in IndexedDB.
2. If LAN client is connected, it submits the operation (`operation:submit`).
3. Server validates envelope, checks causal ancestry and state hashes via `SyncService`.
4. Server atomically commits the operation and updates the task projection in SQLite.
5. Server acknowledges the sender (`operation:accepted`).
6. Server broadcasts the committed operation to other connected devices (`operation:broadcast`).
7. Other devices apply the operation through `applyIncomingLanOperation`, updating IndexedDB and reactive UI.

### Concurrent Conflict Handling

If two devices diverge from revision `N`:

1. Server receives Device A's update -> applied as revision `N+1`.
2. Server receives Device B's concurrent update -> classified as `CONFLICT`.
3. Server records the conflict in SQLite and responds with `operation:rejected` (`classification: 'CONFLICT'`).
4. Client records conflict in IndexedDB (`db.conflicts`).
5. User resolves conflict on Device B (`Keep Local` or `Accept Incoming`).
6. Resolution produces a `TASK_RESOLVE` operation with `mergedOperationId` and `mergedStateHash`.
7. Resolution operation is submitted over LAN and cleanly accepted by server and peers.

---

## 8. Offline & Mixed-Transport Compatibility

- **Offline Independence**: Local task creation and edits never block on network connectivity. If the server is offline, tasks commit locally in IndexedDB.
- **PaperBridge Compatibility**: Tasks transferred via QR and tasks synced over LAN share the identical UUIDs, revisions, and state hashes. An operation received via QR and later observed via LAN is recognized idempotently (`ALREADY_APPLIED`), preventing duplicates.
- **Phase 7 Readiness**: Clean interfaces are exposed for listing unsynchronized local operations (`getUnsynchronizedOperations`), submitting by stable ID (`submitLocalOperation`), and tracking server cursors.

## 9. Repair guarantees and operator behavior

- A configured coordinator change resets the client cursor to `0`, preventing checkpoints from one SQLite history from being used with another server.
- The **Connect & Sync** control saves the visible coordinator configuration, reconnects and registers when disconnected, replays eligible causal outbox entries, retrieves remote entries, and performs the existing follow-up catch-up pass.
- A UI success result means the final outbox has no `PENDING`, `IN_FLIGHT`, `BLOCKED`, or `FAILED` entries. Other states are shown as action-required partial completion.
- For an incoming `TASK_CREATE`, an existing operation ID is idempotent. An existing task ID is idempotent only when its state hash matches; a mismatched state hash is an integrity conflict.
- `TASK_UPDATE` delivery is applied by the same causal update engine used by PaperBridge, preserving missing-parent and conflict behavior across transports.
