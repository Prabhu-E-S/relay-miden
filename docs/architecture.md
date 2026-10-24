# Relay Miden architecture

## Phase 8 boundary

Relay Miden is an npm-workspaces monorepo with an offline-first React interface, an installable Progressive Web App with Workbox Service Worker precaching, a local Express & Socket.IO synchronization server with SQLite persistence and TLS support, and a shared TypeScript package with Zod validation schemas. Phase 4 added offline multilingual communication with English, Malayalam, and Tamil templates. Phase 5 established bidirectional PaperBridge v2 updates, causal tracking, acknowledgments, and conflict resolution. Phase 6 implemented a local-network synchronization engine allowing multiple devices on the same Wi-Fi or hotspot to exchange task operations in real time without public internet access. Phase 7 implemented a durable offline operation queue (outbox), autonomous LAN reconnection with bounded exponential backoff and jitter, causal replay ordering, cursor safety, abandoned in-flight recovery, and conflict reconciliation. Phase 8 implements Progressive Web App installability (Chromium, Android, iOS Add to Home Screen, Desktop), offline application launch via Service Worker app shell caching, non-intrusive safe update management, and a configurable HTTPS development environment for mobile camera scanning and secure LAN operation.

## Frontend

`apps/web` uses React, Vite, `vite-plugin-pwa`, strict TypeScript, Tailwind's Vite plugin, declarative React Router, Lucide icons, Dexie.js, `dexie-react-hooks`, and `socket.io-client`. `App.tsx` composes providers (`DatabaseProvider`, `LanguageProvider`) and routes. `AppShell` owns desktop/mobile navigation, route focus, PWA update notifications, and the content region.

- `db/database.ts`: Defines `RelayMidenDatabase` with indexed tables: `tasks`, `operations`, `settings`, `imports`, `outgoing`, `acknowledgments`, `conflicts`, and `outbox` (version 4 schema; previous records remain intact).
- `db/task-repository.ts`: Encapsulates all transactional CRUD, validation, revision increments, operation history generation, atomic `importPaperBridgeTask` ingestion, operation listener subscription, and atomic outbox enqueueing inside the same database transaction.
- `services/paperbridge/`: Dedicated service layer housing QR encoding, decoding, checksumming, and client-side image decoding.
- `services/sync/sync-repository.ts`: Browser persistence adapter for v2 outgoing updates, incoming classification/application, ACK matching, atomic conflict resolution with outbox enqueueing, and pure task update payload generation.
- `services/lan/`: Dedicated LAN synchronization service:
  - `protocol.ts`: Re-exports typed schemas, constants, and envelopes.
  - `connection.ts`: Manages Socket.IO lifecycle, URL/token persistence, device registration, reactive connection state machine (`NOT_CONFIGURED`, `CONNECTING`, `REGISTERING`, `CONNECTED`, `SYNCING`, `DISCONNECTED`, `RECONNECTING`, `ERROR`), and automatic reconnection with exponential backoff and jitter. Supports both `http:` and `https:` origins.
  - `outbox.ts`: Durable queue manager handling outbox statistics, status transitions (`PENDING`, `IN_FLIGHT`, `ACKNOWLEDGED`, `BLOCKED`, `FAILED`), causal dependency sorting, abandoned in-flight recovery, and legacy migration backfill.
  - `sync.ts`: Single-flight synchronization coordinator executing incremental sync pulls, contiguous cursor advancement, outbox causal replay, lost acknowledgment recovery (`ALREADY_APPLIED`), and server reset detection.
  - `client.ts`: High-level singleton wiring reactive Socket.IO broadcasts, task repository operation listeners, and outbox retry controls.
- `hooks/use-pwa.ts`: PWA lifecycle hook managing installation eligibility (`beforeinstallprompt`), standalone display mode detection, iOS Safari Add to Home Screen detection, Service Worker update detection (`virtual:pwa-register`), and safe manual update activation.
- `hooks/use-lan-sync.ts`: Reactive hook exposing connection state, server address, live outbox counts via `useLiveQuery`, retry actions, and manual sync controls.
- `components/pwa/`: Dedicated PWA components:
  - `UpdateNotification.tsx`: Non-intrusive banner alerting users to newly cached application versions with data-preservation guarantees and user-controlled activation.
  - `PwaSection.tsx`: Settings panel presenting App Shell cache status, standalone mode status, installation actions, and security origin status.
- `components/dashboard/ConnectionStatus.tsx`: Displays live local network synchronization status (Connected / Reconnecting / Syncing / Registering / Disconnected / Error), outbox queue status (Pending / Blocked / Failed / All committed), and PWA shell cache status (Ready offline / Caching).
- `pages/ConnectionsPage.tsx`: Manages host address configuration, session tokens, connect/disconnect actions, outbox queue metrics, retry buttons, manual "Sync Now" triggers, and secure LAN TLS architecture guidance without horizontal overflow down to 320px.
- `components/qr/`: Multi-mode offline QR generation, display, and camera/upload scanning with secure-context detection.
- `i18n/`: Bundled dictionaries and language-specific sentence templates for English, Malayalam, and Tamil.

## Backend server and SQLite persistence

`apps/server` hosts the local LAN coordinator:

- `src/app.ts`: Creates Express, HTTP/HTTPS server, and Socket.IO instances with dependency injection, configurable host binding, TLS certificate loading (`httpsKey`, `httpsCert`), and CORS. `GET /health` returns health status.
- `src/config/env.ts`: Loads configuration from environment variables with support for `HOST`, `PORT`, `DB_PATH`, `LAN_SESSION_TOKEN`, `CORS_ORIGIN`, `SSL_KEY_FILE`, `SSL_CRT_FILE`, and `HTTPS`.
- `src/db/`:
  - `connection.ts`: Native Node 24 SQLite connection (`node:sqlite` `DatabaseSync`) with atomic transactions, `foreign_keys = ON`, and `WAL` journal mode.
  - `schema.ts`: Versioned migrations initializing `server_metadata`, `devices`, `tasks`, `operations`, and `conflicts`.
- `src/repositories/`:
  - `deviceRepository.ts`: Persists device registrations and `last_seen_at` timestamps.
  - `taskRepository.ts`: Persists canonical task projections with revision and state hash.
  - `operationRepository.ts`: Append-only operation log with strictly monotonic `sequence INTEGER PRIMARY KEY AUTOINCREMENT`.
  - `conflictRepository.ts`: Records concurrent branch conflicts and resolutions.
- `src/services/syncService.ts`: Core server synchronization engine validating canonical payloads, detecting idempotence, verifying causal ancestry, applying state transitions, and generating bounded sync batches.
- `src/sockets/registerHandlers.ts`: Implements Socket.IO protocol handlers for `device:register`, `sync:request`, `operation:submit`, and selective broadcast `operation:broadcast`. Compatible with both HTTP and HTTPS/WSS transports.

## Shared package

`packages/shared` contains Zod schemas, protocol types, canonical serialization, and static TypeScript types:

- Task models, structured instruction templates, status lifecycle progression rules.
- PaperBridge v1 and v2 QR transfer envelopes, SHA-256 integrity verification, and canonical JSON stringification.
- Pure causal synchronization engine: `classifyIncomingOperation`, `taskStateHash`, `applyTaskChanges`, `taskChanges`, `completeTaskChanges`.
- Phase 6/7/8 LAN protocol schemas: `LAN_PROTOCOL_VERSION = 1`, `LanDeviceRegistrationSchema`, `LanRegistrationResultSchema`, `LanSyncRequestSchema`, `LanOperationSubmitSchema`, `LanOperationAcceptedSchema`, `LanOperationRejectedSchema`, `LanOperationBroadcastSchema`, `LanSyncBatchSchema`, `OutboxEntrySchema`, `OutboxStatusSchema`, and connection status types.

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

## Progressive Web App & Offline Launch (Phase 8)

Phase 8 completes the offline launch and installability layer for Relay Miden:

- **Web App Manifest**: Valid W3C manifest defining `name: "Relay Miden"`, `short_name: "Relay Miden"`, `display: "standalone"`, `theme_color: "#004225"`, `background_color: "#F5F5DC"`, and installable icons (192×192, 512×512, and 512×512 maskable with 20% safe-padding).
- **Workbox Service Worker Precaching**: Precaches 32 essential app shell assets (HTML entrypoint, hashed JS bundles, hashed CSS bundles, local DM Sans fonts, and brand icons).
- **Navigation Route Fallback**: Client-side routing navigates to `/index.html` while offline, while strictly excluding `/api/`, `/socket.io/`, and `/health/` via a denylist.
- **Data Isolation**: Application shell caching is completely decoupled from user data. Tasks and queues live strictly in IndexedDB and are never flushed or cleared during cache updates.
- **Safe Update Management**: New versions install in the background without surprising reloads; users choose when to activate updates via a non-intrusive banner.
- **Secure LAN HTTPS**: Development tooling (`npm run cert:gen`, `npm run dev:https`) provides SAN TLS certificates allowing mobile devices on the same Wi-Fi network to access camera scanning, register service workers, and install the PWA without mixed-content blocking.

## Security and browser limitations

- Incoming QR and LAN data are treated as untrusted; envelopes, payload schemas, and state hashes are strictly validated.
- Anonymous UUIDs provide causal attribution, not proof of identity. For trusted LANs, an optional session token restricts server access.
- Mobile browsers require secure contexts (HTTPS or localhost) for `getUserMedia` camera access and PWA installation. The project provides automated TLS certificate generation (`npm run cert:gen`) to establish secure contexts over LAN Wi-Fi. In insecure contexts, the image file upload fallback remains active.
- Mobile browsers can restrict `crypto.randomUUID()` on an HTTP LAN origin even though IndexedDB is available. Shared UUID generation uses `crypto.getRandomValues()` as a cryptographically secure UUID v4 fallback so device identity and local storage work on any address.
- The camera scanner requests the rear camera with a preferred 1280×720 stream and decodes the full camera frame. This preserves enough QR modules for PaperBridge's signed task envelopes when a phone scans a laptop display.
- Mixed-content policies block unencrypted HTTP/WS connections when web apps are served over HTTPS. Relay Miden configures both frontend and backend for HTTPS/WSS when TLS mode is enabled.
- Local SQLite database files and TLS private keys are excluded from version control (`.gitignore`).

## Verification boundaries

Vitest exercises form validation, multilingual templates, PaperBridge v1/v2 QR encoding/decoding, the Express health endpoint, `TaskRepository` against `fake-indexeddb`, causal classification, ACK matching, conflict resolution, SQLite migrations, server Socket.IO operations, client LAN synchronization, durable outbox atomic insertion, queue state machine transitions, abandoned in-flight recovery, exponential backoff, causal replay, lost acknowledgment recovery, concurrent conflict convergence, PWA manifest invariants, Service Worker caching rules, HTTPS LAN server instantiation, and IndexedDB data preservation during app shell updates (135 tests total across 11 test suites). Playwright exercises built frontend routes across 7 viewports without overflow, task creation/editing/status lifecycle, PaperBridge transfer, concurrent conflict convergence, Connections page configuration, Phase 7 outbox queue indicators, Phase 8 PWA manifest metadata, and offline network simulation with local task navigation (22 tests total). Physical multi-device LAN synchronization has not been verified in Phase 8.
