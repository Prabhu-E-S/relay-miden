# Relay Miden architecture

## Phase 3 boundary

Relay Miden is an npm-workspaces monorepo with an offline-first React interface, a minimal Express health process, and a shared TypeScript package with Zod validation schemas. With Phase 3 completed, task coordination includes **PaperBridge offline QR transfer**: versioned encoding, canonical serialization, SHA-256 checksum verification, scannable QR generation, PNG export, clipboard payload copy, local browser camera scanning, client-side QR image upload, pre-import review, duplicate detection, and atomic IndexedDB ingestion. All QR generation, decoding, hashing, and database writes occur entirely within the browser without cloud APIs, servers, or external networks. The existing root LICENSE is preserved.

## Frontend

`apps/web` uses React, Vite, strict TypeScript, Tailwind's Vite plugin, declarative React Router, Lucide icons, Dexie.js, and `dexie-react-hooks`. `App.tsx` composes providers (`DatabaseProvider`, `LanguageProvider`) and routes. `AppShell` owns desktop/mobile navigation, route focus, and the content region.

- `db/database.ts`: Defines `RelayMidenDatabase` with indexed tables: `tasks`, `operations`, `settings`, and `imports` (version 2 schema).
- `db/task-repository.ts`: Encapsulates all transactional CRUD, validation, revision increments, operation history generation, and atomic `importPaperBridgeTask` ingestion.
- `services/paperbridge/`: Dedicated service layer housing `encodeTaskForQR`, `decodePaperBridgeMessage`, `computeEnvelopeChecksum`, `verifyEnvelopeChecksum`, `generateQRCodeDataUrl`, and `scanQRCodeFromImageFile`.
- `components/qr/QRDisplay.tsx`: Renders real scannable QR codes, PNG download buttons, payload copying, and payload size metrics.
- `components/qr/QRReceiver.tsx`: Multi-mode offline receiver with user-activated camera scanning (`html5-qrcode`), local client-side image file decoding (`jsQR`), visual pre-import task review, and atomic import execution.
- `components/layout/DatabaseProvider.tsx`: Initializes the database on application startup, managing loading and error fallback states gracefully.
- Pages assemble reusable layout, dashboard, task, and UI components. The dashboard aggregates live statistics and recent tasks directly from IndexedDB via `useLiveQuery`.
- The route map is `/`, `/create`, `/tasks`, `/tasks/:id`, `/send`, `/receive`, `/connections`, and `/settings`, with fallback views.
- Status transitions follow strict lifecycle progression: pending -> acknowledged -> in_progress -> completed, with an explicit reopen flow.
- Soft-deleted tasks are flagged with `deletedAt` and excluded from normal listings while preserving operation history and preventing accidental resurrection via PaperBridge import.

DM Sans is bundled locally with Fontsource; Malayalam and Tamil use available system fonts. No runtime CDN, analytics, paid API, external images, or cloud dependency is required.

## Backend foundation

`apps/server/src/app.ts` exports the Express app for tests; `src/index.ts` validates `PORT`, binds to `HOST`, starts the process, and closes it on termination signals. `GET /health` returns `{ "status": "ok", "service": "relay-miden-server", "phase": 2 }`, with no-store caching. There are no task endpoints, fake API responses, authentication, external databases, or network discovery. The UI makes no API calls; task management and QR transfer are completely backend-independent.

## Shared package

`packages/shared` contains Zod schemas for runtime validation, protocol types, canonical serialization, and static TypeScript types:

- `TaskSchema`, `CreateTaskInputSchema`, `UpdateTaskInputSchema`
- `TaskOperationSchema`, `TaskOperationTypeSchema` (including `'TASK_IMPORT'`)
- `TaskStatusSchema`, `TaskPrioritySchema`, `TaskActionSchema`
- Status transition validator `isValidStatusTransition`
- `PaperBridgeEnvelopeSchema`, `PaperBridgeTaskPayloadSchema`, `PaperBridgeError`
- Protocol constants: `PaperBridgeProtocolIdentifier = 'RELAY_MIDEN_PAPERBRIDGE'`, `PAPERBRIDGE_PROTOCOL_VERSION = 1`, `MAX_PAPERBRIDGE_PAYLOAD_BYTES = 2048`
- Deterministic canonical serialization (`canonicalJsonStringify`) and Web Crypto SHA-256 helpers (`computeEnvelopeChecksum`, `verifyEnvelopeChecksum`)
- Pure encoding and decoding functions: `createPaperBridgeEnvelope`, `decodePaperBridgeMessage`
- Health response contract (`phase: 2`)

The root build compiles shared first, then server and web.

## Implemented offline-first data flow

```text
User intent -> validated task command -> IndexedDB transaction -> local UI (reactive via useLiveQuery)
                                         (tasks + operations)
                                          │
                                    [PaperBridge QR Protocol]
                                          ├── Encode task & compute SHA-256 -> Scannable QR code
                                          └── Decode camera/file -> Verify checksum -> User confirmation
                                                  │
                                          Atomic transaction (tasks + operations + imports)
                                                  │
                                    [Planned: Phase 7 durable outbox]
                                                  │
                                    [Planned: Phase 6 LAN transport]
```

Every mutation creates an atomic transaction updating `tasks` and appending a serializable `TaskOperation` record with revision and parent revision tracking. Tasks imported via PaperBridge are recorded as `TASK_IMPORT` with the receiving device as actor, the source message ID in the `imports` ledger for duplicate suppression, and the original creator and revision preserved.

## Implemented PaperBridge offline transfer

Phase 3 implements versioned transfer envelopes (`RELAY_MIDEN_PAPERBRIDGE`, version 1).

- **Encoding**: Produces deterministic JSON, canonical key sorting, and SHA-256 checksums over envelope data. Rejects payloads exceeding 2,048 bytes to ensure QR scan reliability.
- **Decoding**: Parses raw text, enforces version compatibility, validates structure with Zod, and verifies SHA-256 digest against accidental corruption.
- **Send screen**: Generates real scannable QR matrices, PNG download files, and clipboard payload export.
- **Receive screen**: Supports live camera scanning with rear camera preference, automatic camera cleanup, browser insecure context fallback, and 100% offline image file decoding via client-side Canvas and `jsQR`.
- **Pre-import preview**: Presents full task metadata, priority indicator, sender device identity, and creation timestamp for explicit user confirmation.
- **Duplicate & Conflict suppression**: Deduplicates identical message IDs and revisions; guards against overwriting differing local revisions or resurrecting soft-deleted tasks.

Phase 5 will add bidirectional lifecycle QR messages (task acknowledgment and status progression).

## Planned LAN transport and synchronization

Phase 6 will add explicit local server discovery/configuration and a transport interface independent of the UI. Phase 7 adds a durable queue, retries, idempotency, conflict resolution, and sync observability. No public internet or paid infrastructure should be required for core operation. Do not use the browser's online flag as proof that another device is reachable.

## Security and browser limitations

- Incoming QR and LAN data are treated as untrusted; payload length, format, protocol identifier, version, envelope structure, and cryptographic checksums are strictly validated before presentation or persistence.
- SHA-256 provides integrity verification against accidental corruption; it is not a cryptographic signature and does not prove sender authenticity.
- Camera access requires a secure context (HTTPS or localhost), user permission, and supported browser APIs. When accessed over LAN IP via HTTP, browsers disable `getUserMedia`; the application detects this and routes users to offline image file upload.
- Browser storage can be evicted; private browsing and quotas vary. Quota errors and duplicate constraints are caught gracefully.
- A development server is not a production server. The server binds to loopback by default; LAN exposure, origin policy, authentication, abuse limits, and TLS require Phase 6 decisions.
- Production static hosting must fall back to `index.html` for client routes. Express does not currently serve the frontend.
- A service worker, installability, offline asset caching, and refresh without a running server are Phase 8 work. Loading this UI once does not make it an offline-ready PWA.

## Verification boundaries

Vitest exercises form validation, the Express health endpoint, the full `TaskRepository` suite against `fake-indexeddb`, PaperBridge protocol serialization, SHA-256 determinism, corruption detection, oversized payload handling, and QR roundtrip decoding via `jsQR` (57 tests total). Playwright exercises the built frontend, real IndexedDB persistence across reloads, responsive overflow across 7 viewport widths, task lifecycle, multi-device transfer via QR image file upload across isolated browser contexts, duplicate suppression, dialogs, and styling tokens (15 tests total).
