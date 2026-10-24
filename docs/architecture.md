# Relay Miden architecture

## Phase 7 boundary

Relay Miden is an npm-workspaces monorepo with an offline-first React interface, a local Express & Socket.IO synchronization server with SQLite persistence, and a shared TypeScript package with Zod validation schemas. Phase 4 added offline multilingual communication with English, Malayalam, and Tamil templates. Phase 5 established bidirectional PaperBridge v2 updates, causal tracking, acknowledgments, and conflict resolution. Phase 6 implemented a local-network synchronization engine allowing multiple devices on the same Wi-Fi or hotspot to exchange task operations in real time without public internet access. Phase 7 implements a durable offline operation queue (outbox), autonomous LAN reconnection with bounded exponential backoff and jitter, causal replay ordering, cursor safety, abandoned in-flight recovery, and conflict reconciliation.

## Frontend

`apps/web` uses React, Vite, strict TypeScript, Tailwind's Vite plugin, declarative React Router, Lucide icons, Dexie.js, `dexie-react-hooks`, and `socket.io-client`. `App.tsx` composes providers (`DatabaseProvider`, `LanguageProvider`) and routes. `AppShell` owns desktop/mobile navigation, route focus, and the content region.

- `db/database.ts`: Defines `RelayMidenDatabase` with indexed tables: `tasks`, `operations`, `settings`, `imports`, `outgoing`, `acknowledgments`, `conflicts`, and `outbox` (version 4 schema; previous records remain intact).
- `db/task-repository.ts`: Encapsulates all transactional CRUD, validation, revision increments, operation history generation, atomic `importPaperBridgeTask` ingestion, operation listener subscription, and atomic outbox enqueueing inside the same database transaction.
- `services/paperbridge/`: Dedicated service layer housing QR encoding, decoding, checksumming, and client-side image decoding.
- `services/sync/sync-repository.ts`: Browser persistence adapter for v2 outgoing updates, incoming classification/application, ACK matching, atomic conflict resolution with outbox enqueueing, and pure task update payload generation.
- `services/lan/`: Dedicated LAN synchronization service:
  - `protocol.ts`: Re-exports typed schemas, constants, and envelopes.
  - `connection.ts`: Manages Socket.IO lifecycle, URL/token persistence, device registration, reactive connection state machine (`NOT_CONFIGURED`, `CONNECTING`, `REGISTERING`, `CONNECTED`, `SYNCING`, `DISCONNECTED`, `RECONNECTING`, `ERROR`), and automatic reconnection with exponential backoff and jitter.
  - `outbox.ts`: Durable queue manager handling outbox statistics, status transitions (`PENDING`, `IN_FLIGHT`, `ACKNOWLEDGED`, `BLOCKED`, `FAILED`), causal dependency sorting, abandoned in-flight recovery, and legacy migration backfill.
  - `sync.ts`: Single-flight synchronization coordinator executing incremental sync pulls, contiguous cursor advancement, outbox causal replay, lost acknowledgment recovery (`ALREADY_APPLIED`), and server reset detection.
  - `client.ts`: High-level singleton wiring reactive Socket.IO broadcasts, task repository operation listeners, and outbox retry controls.
- `hooks/use-lan-sync.ts`: Reactive hook exposing connection state, server address, live outbox counts via `useLiveQuery`, retry actions, and manual sync controls.
- `components/dashboard/ConnectionStatus.tsx`: Displays live local network synchronization status (Connected / Reconnecting / Syncing / Registering / Disconnected / Error) and outbox queue status (Pending / Blocked / Failed / All committed).
- `pages/ConnectionsPage.tsx`: Manages host address configuration, session tokens, connect/disconnect actions, outbox queue metrics, retry buttons, and manual "Sync Now" triggers without horizontal overflow down to 320px.
- `components/qr/`: Multi-mode offline QR generation, display, and scanning.
- `i18n/`: Bundled dictionaries and language-specific sentence templates for English, Malayalam, and Tamil.

## Backend server and SQLite persistence

`apps/server` hosts the local LAN coordinator:

- `src/app.ts`: Creates Express, HTTP server, and Socket.IO instances with dependency injection, configurable host binding, and CORS. `GET /health` returns health status.
- `src/db/`:
  - `connection.ts`: Native Node 24 SQLite connection (`node:sqlite` `DatabaseSync`) with atomic transactions, `foreign_keys = ON`, and `WAL` journal mode.
  - `schema.ts`: Versioned migrations initializing `server_metadata`, `devices`, `tasks`, `operations`, and `conflicts`.
- `src/repositories/`:
  - `deviceRepository.ts`: Persists device registrations and `last_seen_at` timestamps.
  - `taskRepository.ts`: Persists canonical task projections with revision and state hash.
  - `operationRepository.ts`: Append-only operation log with strictly monotonic `sequence INTEGER PRIMARY KEY AUTOINCREMENT`.
  - `conflictRepository.ts`: Records concurrent branch conflicts and resolutions.
- `src/services/syncService.ts`: Core server synchronization engine validating canonical payloads, detecting idempotence, verifying causal ancestry, applying state transitions, and generating bounded sync batches.
- `src/sockets/registerHandlers.ts`: Implements Socket.IO protocol handlers for `device:register`, `sync:request`, `operation:submit`, and selective broadcast `operation:broadcast`.

## Shared package

`packages/shared` contains Zod schemas, protocol types, canonical serialization, and static TypeScript types:

- Task models, structured instruction templates, status lifecycle progression rules.
- PaperBridge v1 and v2 QR transfer envelopes, SHA-256 integrity verification, and canonical JSON stringification.
- Pure causal synchronization engine: `classifyIncomingOperation`, `taskStateHash`, `applyTaskChanges`, `taskChanges`, `completeTaskChanges`.
- Phase 6/7 LAN protocol schemas: `LAN_PROTOCOL_VERSION = 1`, `LanDeviceRegistrationSchema`, `LanRegistrationResultSchema`, `LanSyncRequestSchema`, `LanOperationSubmitSchema`, `LanOperationAcceptedSchema`, `LanOperationRejectedSchema`, `LanOperationBroadcastSchema`, `LanSyncBatchSchema`, `OutboxEntrySchema`, `OutboxStatusSchema`, and connection status types.

## Implemented data flow

```text
User intent -> validated task command -> IndexedDB atomic transaction -> local UI (reactive via useLiveQuery)
                                         (tasks + operations + outbox)
                                           │
                   ┌───────────────────────┴───────────────────────┐
                   ▼                                               ▼
       [PaperBridge QR Protocol]                        [Phase 7 LAN Outbox & Sync]
       ├── QR encode & SHA-256                           ├── Enqueued as PENDING
       └── Camera/upload decode & verify                 ├── Auto-reconnect with backoff & jitter
                   │                                     ├── Causal replay (parents before children)
                   ▼                                     └── Single-flight coordinator & pull
       Atomic IndexedDB transaction                                │
       (tasks + operations + imports)                    Server SQLite durable commit
       (no false outbox entry)                           (WAL mode, monotonic sequence)
```

## Implemented durable outbox and recovery (Phase 7)

Phase 7 implements a durable offline queue and autonomous reconnection system:

- **Atomic Outbox Commitment**: Every locally generated operation (`TASK_CREATE`, `TASK_UPDATE`, `TASK_DELETE`, `TASK_RESOLVE`) and its outbox record are committed in the exact same IndexedDB transaction.
- **Queue State Machine**: Strict transitions (`PENDING` -> `IN_FLIGHT` -> `ACKNOWLEDGED` / `BLOCKED` / `FAILED`).
- **Abandoned In-Flight Recovery**: Sessions interrupted by page refresh, tab close, or browser crash recover unconfirmed `IN_FLIGHT` operations to `PENDING` on database open.
- **Autonomous Reconnection**: Bounded exponential backoff (1s, 2s, 4s, 8s, 16s, capped at 30s) with $\pm 20\%$ jitter, browser `online` and `visibilitychange` lifecycle awareness, and automatic device re-registration.
- **Strict Causal Replay**: Operations on the same task replay in parent-first revision order (1 -> 2 -> 3). Missing dependencies mark operations `BLOCKED` without infinite loops.
- **Idempotence & Lost ACK Handling**: Retries carry stable canonical `operationId`s. The server returns `ALREADY_APPLIED` on duplicates, and the client records acknowledgment without duplicating revisions.
- **Contiguous Cursor Safety**: Server cursors advance only after operations commit durably to local storage.
- **Conflict Recovery**: Concurrent edits during offline disconnects are flagged by Phase 5 causal rules, recorded in `db.conflicts`, and resolved into syncable `TASK_RESOLVE` operations.
- **QR / LAN Interoperability**: Remote QR-imported tasks are tracked separately and not falsely enqueued into the local outbox.

## Planned Phase 8 PWA features

Phase 8 will introduce installable PWA capabilities: web app manifest, offline service worker application shell caching, and standalone installation. Phase 7 deliberately works within the existing standard browser lifecycle without claiming unsupported background sync while closed.

## Security and browser limitations

- Incoming QR and LAN data are treated as untrusted; envelopes, payload schemas, and state hashes are strictly validated.
- Anonymous UUIDs provide causal attribution, not proof of identity. For trusted LANs, an optional session token restricts server access.
- Browsers require secure contexts (HTTPS or localhost) for `getUserMedia` camera access; HTTP access over LAN IP routes users to file upload.
- Mixed-content policies may block insecure HTTP/WS connections when web apps are served over HTTPS.
- Local SQLite database files are excluded from version control (`.gitignore`).

## Verification boundaries

Vitest exercises form validation, multilingual templates, PaperBridge v1/v2 QR encoding/decoding, the Express health endpoint, `TaskRepository` against `fake-indexeddb`, causal classification, ACK matching, conflict resolution, SQLite migrations, server Socket.IO operations, client LAN synchronization, durable outbox atomic insertion, queue state machine transitions, abandoned in-flight recovery, exponential backoff, causal replay, lost acknowledgment recovery, and concurrent conflict convergence (126 tests total across 10 test suites). Playwright exercises built frontend routes across 7 viewports without overflow, task creation/editing/status lifecycle, PaperBridge transfer, concurrent conflict convergence, Connections page configuration, and Phase 7 outbox queue indicators (20 tests total). Physical multi-device LAN synchronization has not been verified in Phase 7.
