# Relay Miden architecture

## Phase 6 boundary

Relay Miden is an npm-workspaces monorepo with an offline-first React interface, a local Express & Socket.IO synchronization server with SQLite persistence, and a shared TypeScript package with Zod validation schemas. Phase 4 added offline multilingual communication with English, Malayalam, and Tamil templates. Phase 5 established bidirectional PaperBridge v2 updates, causal tracking, acknowledgments, and conflict resolution. Phase 6 implements a local-network synchronization engine allowing multiple devices on the same Wi-Fi or hotspot to exchange task operations in real time without public internet access.

## Frontend

`apps/web` uses React, Vite, strict TypeScript, Tailwind's Vite plugin, declarative React Router, Lucide icons, Dexie.js, `dexie-react-hooks`, and `socket.io-client`. `App.tsx` composes providers (`DatabaseProvider`, `LanguageProvider`) and routes. `AppShell` owns desktop/mobile navigation, route focus, and the content region.

- `db/database.ts`: Defines `RelayMidenDatabase` with indexed tables: `tasks`, `operations`, `settings`, `imports`, `outgoing`, `acknowledgments`, and `conflicts` (version 3 schema; previous records remain intact).
- `db/task-repository.ts`: Encapsulates all transactional CRUD, validation, revision increments, operation history generation, atomic `importPaperBridgeTask` ingestion, and operation listener subscription.
- `services/paperbridge/`: Dedicated service layer housing QR encoding, decoding, checksumming, and client-side image decoding.
- `services/sync/sync-repository.ts`: Browser persistence adapter for v2 outgoing updates, incoming classification/application, ACK matching, conflict resolution, and pure task update payload generation.
- `services/lan/`: Dedicated LAN synchronization service:
  - `protocol.ts`: Re-exports typed schemas, constants, and envelopes.
  - `connection.ts`: Manages Socket.IO lifecycle, URL/token persistence, device registration, and reactive connection state machine.
  - `sync.ts`: Builds operations, applies incoming `TASK_CREATE` and `TASK_UPDATE` payloads, submits local operations, tracks server cursors, and requests initial/manual synchronization.
  - `client.ts`: High-level singleton wiring reactive Socket.IO broadcasts and task repository operation listeners.
- `hooks/use-lan-sync.ts`: Reactive hook exposing connection state, server address, connect/disconnect actions, and manual sync controls.
- `components/dashboard/ConnectionStatus.tsx`: Displays live local network synchronization status (Connected / Connecting / Syncing / Disconnected / Error).
- `pages/ConnectionsPage.tsx`: Manages host address configuration, session tokens, connect/disconnect actions, and manual "Sync Now" triggers without horizontal overflow across all viewports.
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
- Phase 6 LAN protocol schemas: `LAN_PROTOCOL_VERSION = 1`, `LanDeviceRegistrationSchema`, `LanRegistrationResultSchema`, `LanSyncRequestSchema`, `LanOperationSubmitSchema`, `LanOperationAcceptedSchema`, `LanOperationRejectedSchema`, `LanOperationBroadcastSchema`, `LanSyncBatchSchema`, and connection status types.

## Implemented data flow

```text
User intent -> validated task command -> IndexedDB transaction -> local UI (reactive via useLiveQuery)
                                         (tasks + operations)
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
      [PaperBridge QR Protocol]                        [Phase 6 LAN Sync Service]
      ├── QR encode & SHA-256                           ├── Submit committed local operation
      └── Camera/upload decode & verify                 ├── Real-time broadcast to peers
                  │                                     └── Cursor-based initial & manual sync
                  ▼                                               │
      Atomic IndexedDB transaction                     Server SQLite durable commit
      (tasks + operations + imports)                   (WAL mode, monotonic sequence)
```

## Implemented LAN transport and real-time synchronization

Phase 6 implements a complete local network synchronization architecture:

- **Host Binding**: Configurable host binding (`0.0.0.0` or custom LAN IP) allowing devices on Wi-Fi or mobile hotspots to connect.
- **SQLite Persistence**: Operations and materialized task projections persist across server restarts in `data/relay-miden.sqlite`.
- **Durable Commitment**: Operations are validated and committed to SQLite before returning application-level acceptance or broadcasting to peers.
- **Causal Model Reuse**: LAN operations reuse Phase 5 `TaskUpdatePayload`, parent operation IDs, and SHA-256 state hashes.
- **Conflict Handling**: Concurrent edits over LAN are detected using Phase 5 causal rules, recorded in conflict ledgers, and converged via `TASK_RESOLVE` operations.
- **Mixed-Transport Compatibility**: Operations exchanged via PaperBridge QR and LAN share stable IDs and revisions, avoiding duplication.
- **Phase 7 Readiness**: Clean interfaces exist for listing unsynchronized local operations, submitting by ID, and cursor tracking.

## Planned Phase 7 durable outbox and recovery

Phase 7 will add a durable pending-operation queue, automatic reconnection, retry backoff scheduling, and synchronization telemetry. Phase 6 deliberately establishes connected-LAN synchronization and manual recovery without claiming durable background replay is complete.

## Security and browser limitations

- Incoming QR and LAN data are treated as untrusted; envelopes, payload schemas, and state hashes are strictly validated.
- Anonymous UUIDs provide causal attribution, not proof of identity. For trusted LANs, an optional session token restricts server access.
- Browsers require secure contexts (HTTPS or localhost) for `getUserMedia` camera access; HTTP access over LAN IP routes users to file upload.
- Mixed-content policies may block insecure HTTP/WS connections when web apps are served over HTTPS.
- Local SQLite database files are excluded from version control (`.gitignore`).

## Verification boundaries

Vitest exercises form validation, multilingual templates, PaperBridge v1/v2 QR encoding/decoding, the Express health endpoint, `TaskRepository` against `fake-indexeddb`, causal classification, ACK matching, conflict resolution, SQLite migrations, server Socket.IO operations, client LAN synchronization, and end-to-end client/server exchange (113 tests total across 9 test suites). Playwright exercises built frontend routes across 7 viewports without overflow, task creation/editing/status lifecycle, PaperBridge transfer, concurrent conflict convergence, and Connections page configuration (19 tests total). Physical multi-device LAN synchronization has not been verified in Phase 6.
