# Relay Miden

**When networks fail, communication shouldn't.**

Relay Miden is an offline-first, multilingual task-coordination project for the **Works Anyway** track at **Devin Hacks Kochi**. Communities still need to request supplies, coordinate volunteers, and report problems when infrastructure fails. The product is being designed around three constraints: **no internet connection, no shared network between devices, and no common language between users**.

## Current status

**Phase 8 implemented and verified on 25 October 2026.** Relay Miden is now an installable Progressive Web App (PWA) with complete offline launch capabilities and secure LAN access for mobile devices. Static application shell assets (HTML, CSS, JavaScript, local DM Sans fonts, and PNG icons) are precached locally by a Workbox Service Worker, allowing the application to launch and navigate without network connectivity. Tasks, operation histories, and outbox queues persist durably in IndexedDB and are never flushed or cleared during application updates. The application supports installation on Android, Chromium, Desktop, and iOS (Safari Add to Home Screen) in standalone display mode. A non-intrusive update management system notifies users when new application versions are ready and preserves active user edits. Secure-context development tooling (`npm run cert:gen`, `npm run dev:https`) provides multi-IP SAN TLS certificates for mobile camera scanning and secure LAN synchronization over Socket.IO. Phases 1–7 remain 100% operational.

### Implemented

- **Progressive Web App, Offline Launch, Installability & Secure LAN (Phase 8)**:
  - **W3C Web App Manifest**: Full specification compliance (`/manifest.webmanifest`) with `name: "Relay Miden"`, `short_name: "Relay Miden"`, `display: "standalone"`, `theme_color: "#004225"`, and `background_color: "#F5F5DC"`.
  - **Installable Icon Suite**: 192×192 standard PNG, 512×512 high-resolution PNG, 512×512 maskable PNG (with 20% safe-padding margin for Android squircles), 180×180 Apple touch icon, and multi-size web favicons generated directly from the brand SVG geometry.
  - **Workbox Service Worker Precaching**: Precaches 32 essential application shell assets (1,417 KiB total) including HTML, CSS, JavaScript bundles, local fonts, and icons.
  - **Client-Side Navigation Fallback**: Returns `/index.html` for offline navigation while strictly excluding `/api/`, `/socket.io/`, and `/health/` via a navigation denylist.
  - **Data Isolation & Storage Safety**: User tasks, operations, and Phase 7 outbox records remain strictly isolated in IndexedDB. Cache Storage is never used for task records, and local data is never cleared during updates.
  - **PWA Installation Controls**: Intercepts `beforeinstallprompt` on Chromium/Android, provides user-initiated installation in Settings, respects prompt dismissal, detects standalone display mode, and displays iOS Safari Add to Home Screen instructions.
  - **Safe Non-Intrusive Updates**: Background service worker updates display a persistent `<UpdateNotification />` banner guaranteeing local data safety and allowing manual reload activation.
  - **Secure LAN HTTPS Tooling**: `scripts/generate-dev-cert.mjs` detects local IPv4 interfaces via `os.networkInterfaces()` and generates multi-IP SAN TLS certificates via `mkcert` or OpenSSL.
  - **Secure LAN Server (`apps/server`)**: Conditional HTTPS and WSS Socket.IO support when TLS keys and certificates are supplied, preventing mixed-content blocking.
  - **Mobile Camera Scanning Support**: Enables `navigator.mediaDevices.getUserMedia` live camera scanning on mobile phones connecting to the host machine over LAN Wi-Fi.
  - **Dedicated Setup Guide**: [docs/pwa-offline-setup.md](docs/pwa-offline-setup.md) detailing Windows development setup, `ipconfig` host discovery, certificate installation, and mobile testing.

- **LAN HTTP mobile-storage compatibility repair (25 October 2026)**:
  - Browser-generated UUIDs now use `crypto.randomUUID()` when available and securely fall back to `crypto.getRandomValues()` on unencrypted LAN HTTP origins. This allows a phone opening Relay Miden through a same-Wi-Fi address to create its anonymous IndexedDB device identity.
  - The local-storage screen now exposes the underlying database error when a browser still blocks IndexedDB, without clearing any data.

- **Mobile camera QR scanning reliability repair (25 October 2026)**:
  - The in-app scanner now uses the full rear-camera frame at a preferred 1280×720 resolution instead of a 240px decode crop, and restricts detection to QR codes. Its camera selector uses the `html5-qrcode` required single `facingMode` constraint; resolution is supplied through video constraints.
  - Task, update, and acknowledgment QR displays are larger on laptop and desktop layouts so their signed JSON envelopes retain readable module sizes for a phone camera.

- **Durable Offline Queue, Automatic Reconnection & Recovery (Phase 7)**:
  - **Durable Outbox Queue (IndexedDB Version 4)**: Persistent `outbox` table in Dexie with compound indices. Every local task operation (`TASK_CREATE`, `TASK_UPDATE`, `TASK_DELETE`, `TASK_RESOLVE`) commits atomically in the same database transaction as the task and operation log.
  - **Queue State Machine**: Strict transitions (`PENDING` -> `IN_FLIGHT` -> `ACKNOWLEDGED` / `BLOCKED` / `FAILED`). Interrupted `IN_FLIGHT` operations recover automatically to `PENDING` on database open.
  - **Automatic LAN Reconnection**: Autonomous exponential backoff (1s, 2s, 4s, 8s, 16s, capped at 30s) with $\pm 20\%$ random jitter to prevent reconnect storms. Browser `online` and `visibilitychange` lifecycle awareness.
  - **Causal Operation Replay**: Strict parent-first dependency ordering ensures task creations and base revisions replay before dependent edits. Missing dependencies transition operations to `BLOCKED` without infinite retry loops.
  - **Idempotent Replay & Lost Acknowledgment Recovery**: Retries carry stable canonical `operationId`s. The server returns `ALREADY_APPLIED`, and the client records durable acknowledgment without duplicating revisions.
  - **Contiguous Cursor Safety**: Server cursors advance monotonically only after incoming operations successfully commit to local storage. Invalidation detection safely resets stale cursors if the server database was wiped or replaced.
  - **Concurrent Conflict Reconciliation**: Offline concurrent edits trigger Phase 5 causal conflict detection upon reconnection, recording audit entries in `db.conflicts`. User resolutions generate canonical `TASK_RESOLVE` operations that replay over LAN.
  - **Transport Provenance Isolation**: Remote tasks imported via PaperBridge QR are stored as `TASK_IMPORT` and never falsely enqueued into the local outbox.
  - **Reactive Telemetry & Controls**: Dashboard displays live Offline Queue indicators; Connections page displays Outbox metrics (Pending, In Flight, Blocked / Error, Acknowledged) and a "Retry Blocked & Failed Operations" action.

- **Local Network Server & Real-Time LAN Synchronization (Phase 6)**:
  - **Local Host Coordinator (`apps/server`)**: Node.js, Express, and Socket.IO server backed by persistent SQLite (`node:sqlite` `DatabaseSync`) running in WAL mode with foreign key enforcement. Configurable host binding (`0.0.0.0` or custom LAN IP) and optional session token authentication (`LAN_SESSION_TOKEN`).
  - **Typed LAN Protocol (`LAN_PROTOCOL_VERSION = 1`)**: Socket.IO envelopes validated by Zod schemas (`device:register`, `sync:request`, `operation:submit`, `operation:accepted`, `operation:rejected`, `operation:broadcast`).
  - **Durable Persistence Before Acknowledgment**: Operations are validated and committed atomically to SQLite before the server returns an acceptance response or broadcasts to peers.
  - **Causal Model & Conflict Reuse**: Directly reuses Phase 5 `TaskUpdatePayload`, parent operation IDs, state hashing (`SHA-256`), and conflict detection. Concurrent edits are captured in conflict ledgers and resolved cleanly using `TASK_RESOLVE` operations.
  - **Incremental & Catch-Up Sync**: Monotonic server sequence numbers allow connecting or returning clients to request missing operations from their last known cursor. Bounded batches prevent unbounded payloads.
  - **Client LAN Sync Service (`apps/web/src/services/lan/`)**: Reactive Socket.IO client managing connection state, local storage persistence for host address and session tokens, real-time operation submission on task mutation, and manual "Sync Now" recovery.
  - **Reactive Connection UI**: Dashboard and Connections page reflect live connection states (`Connected`, `Connecting...`, `Syncing...`, `Disconnected`, `Error`) with full responsiveness down to 320px viewports without horizontal overflow.
  - **Mixed Transport & Offline First**: Local IndexedDB remains the primary offline datastore. Tasks transferred via PaperBridge QR and synced over LAN share identical IDs, preventing duplicate records.

- **Bidirectional PaperBridge synchronization (Phase 5)**:
  - PaperBridge v2 `TASK_UPDATE` and `TASK_ACK` envelopes with strict Zod payload validation, SHA-256 integrity checks, and the existing 2,048-byte QR payload ceiling. Version 1 `TASK_CREATE` decoding remains compatible.
  - Local edits, status changes, soft deletion, and conflict resolutions retain append-only operation history. Update QRs export individual operations in revision order with base/result task-state hashes, parent operation IDs, and stable message IDs for retries.
  - Update import classifies applicable, duplicate, stale, conflicting, invalid, and missing-history messages. Accepted updates atomically advance IndexedDB state and operation/import history; missing earlier updates can be rescanned after their dependencies arrive.
  - Concurrent branches remain intact in persistent conflict records. Task Details shows local and incoming versions with Keep Local and Accept Incoming actions. Resolution creates a new transferable operation referencing both branches; two-device convergence is tested.
  - Acknowledgment QRs identify a received message and operation. The sender accepts them only for a matching outgoing update, records duplicates idempotently, and does not change the task revision.
  - Send/Receive screens support task, update, and acknowledgment QRs using camera or local image upload. Generated PNGs are checked with the local QR decoder before display; no transport server is involved.

- **Offline multilingual task communication (Phase 4)**:
  - Bundled English (`en`), Malayalam (`ml`), and Tamil (`ta`) dictionaries for structured task actions, items, units, priorities, statuses, and task/QR workflow labels.
  - Backward-compatible optional `StructuredTaskInstruction` with Zod-validated canonical action, item, and unit codes.
  - Language-specific task templates that render structured instructions immediately without mutating task IDs, revisions, or stored canonical data.
  - Persisted local language preference with an English default; selected language restores after refresh.
  - Structured task creation with localized action/item/unit controls, live instruction preview, optional notes, and continued free-text task support.
  - Multilingual structured task display in task lists, task details, PaperBridge send, and PaperBridge receive previews.
  - PaperBridge v1 structured-instruction round trips, checksum protection, duplicate prevention, and legacy QR compatibility.

- **PaperBridge QR Protocol (`RELAY_MIDEN_PAPERBRIDGE` v1)**:
  - Versioned envelope format with unique message ID, sender device ID, creation timestamp, and validated task payload.
  - Deterministic canonical serialization (lexicographically ordered keys, omitted undefined properties).
  - SHA-256 integrity checksums computed via the standard Web Crypto API (`crypto.subtle`).
  - Strict payload capacity ceiling (2,048 bytes) to ensure high scan reliability.
  - Clear error detection for invalid JSON, unsupported protocols/versions, schema errors, and tampered checksums.
- **Send via QR**:
  - Live selection of any locally created task.
  - Dynamic QR matrix generation with Level M error correction and 4-module quiet zone using the centralized Forest Green palette.
  - One-click PNG image download (`relay-miden-task-[id].png`).
  - Clipboard payload copy and message ID regeneration.
  - Real-time payload byte size and checksum preview.
- **Receive via QR**:
  - User-activated live camera scanning with rear-facing camera preference (`html5-qrcode`).
  - Insecure context detection: warns when accessed over unencrypted LAN IP HTTP and routes users to image upload.
  - 100% offline client-side QR image file upload (`.png`, `.jpg`, `.webp`) decoded locally via HTML5 Canvas and `jsQR`.
  - Automatic camera stream release and cleanup on page navigation or modal dismissal.
  - Visual pre-import review card showing action, title, description, quantity, unit, location, priority, status, sender device ID, and creation timestamp.
  - Explicit user confirmation required before any data is written.
- **Atomic IndexedDB Import & Deduplication**:
  - Atomic Dexie transaction spanning `tasks`, `operations`, and `imports` stores.
  - Preserves original task UUID, original creator device UUID, creation timestamp, and revision number.
  - Records `TASK_IMPORT` audit entry identifying the receiving device as actor while linking source `messageId`.
  - Duplicate scan suppression: prevents duplicate task creation and duplicate operation logging.
  - Conflict protection: preserves local data if an incoming QR code contains a differing task revision.
  - Soft-delete protection: prevents deleted tasks from being silently resurrected via QR scan.
- **Offline Task Engine (Phase 2)**:
  - Dexie.js / IndexedDB offline database (`relay-miden-db`) with `tasks`, `operations`, `settings`, and `imports` tables.
  - Zod runtime validation schemas for tasks, inputs, and operation payloads in `@relay-miden/shared`.
  - Monotonic revision incrementing and `parentRevision` tracking.
  - Persistent anonymous device UUID identity auto-provisioned in IndexedDB.
  - Live reactive queries (`useLiveQuery`) updating dashboard metrics and filterable task views.
  - Real-time search across titles, locations, and descriptions, multi-criteria status/priority filters, and deterministic sorting.
  - Status lifecycle progression (`pending` -> `acknowledged` -> `in_progress` -> `completed`) and controlled task reopening.
- **Foundation & Design System (Phase 1)**:
  - Exact Forest Green `#004225`, Beige `#F5F5DC`, Amber `#FFB000`, and Peach `#FFCF9D` palette in `palette.css`.
  - Metric icons, priorities, and statuses use outline icons/colored text without colored background fills or pills.
  - Real Express `/health` endpoint returning phase status; strictly backend-independent task CRUD and QR transfer.

### In progress

- No active implementation phase. Phase 5 verification is complete.

### Planned

Local Wi-Fi/LAN transport, durable synchronization queues, installable PWA behavior, final operational UI, and demo preparation. All core functionality must work without paid APIs or cloud infrastructure.

## PaperBridge: How to Transfer Tasks Offline

PaperBridge allows one device to transfer a task to another using a QR code displayed on a screen or printed on paper without internet, Wi-Fi, Bluetooth, or cloud infrastructure.

### Sending a Task

1. Open Relay Miden and navigate to **Send via QR** (`/send`).
2. Select any local task from the dropdown.
3. The scannable QR code is instantly rendered.
4. Display the QR code on screen for another device to scan, click **Download QR** to save a PNG image, or click **Copy Payload** to copy the raw envelope.

### Receiving a Task

1. Open Relay Miden on the receiving device and navigate to **Receive via QR** (`/receive`).
2. Choose one of two methods:
   - **Use camera**: Click to request camera access, point the camera at the QR code, and align within the frame.
   - **Upload image**: Click to select a PNG or JPEG photo containing a PaperBridge QR code. Decoded entirely inside your browser.
3. Review the decoded task details (title, action, quantity, location, priority, and original creator device).
4. Click **Import Task**. The task is atomically saved to local IndexedDB storage and immediately appears on your Dashboard and Tasks list.

### Sending and receiving a task update

1. Both devices need the same task first. Transfer a **Send Task** QR if the receiver has no task copy.
2. Edit, advance, or delete the task locally. Open **Send via QR**, select the task, then choose **Send Update**. Select each unsent local operation in revision order; the same operation reuses its stored message ID on retry. Resolved conflicts default to the resolution operation.
3. On the other device, use **Receive via QR** to scan or upload the image. Review the proposed fields and choose **Apply Update**. The task changes only after the IndexedDB transaction succeeds.
4. If an earlier revision is missing, transfer that earlier update first, then scan the pending QR again. If branches conflict, open Task Details to compare them and choose **Keep Local Version** or **Accept Incoming Version**. Export the resulting resolution through **Send Update** so the other device can converge.
5. After an update applies, the receiver shows a return **Acknowledgment** QR. The original sender scans it and records a matching acknowledgment. A duplicate ACK leaves the task untouched. The Send page can also regenerate an ACK for a previously applied incoming update.

QR exchange is asynchronous: neither device receives changes or acknowledgments until someone physically transfers the appropriate code. A SHA-256 checksum detects corruption but does not authenticate another device.

### Browser Camera & Security Notes

- Modern browser security policies require a **secure context** (`HTTPS` or `localhost`) for camera access (`getUserMedia`).
- If accessing Relay Miden over a local network HTTP address (e.g. `http://192.168.1.50:5173`), the browser will disallow camera access. The UI automatically detects this and provides the **Upload image** option, which works 100% offline without camera permissions.

## Stack

React 19, Vite 8, TypeScript 6 (strict), Tailwind CSS 4 with its Vite plugin, React Router 8, Dexie.js 4, `qrcode`, `html5-qrcode`, `jsqr`, Lucide React, Node.js 24, Express 5, npm workspaces, ESLint 10, Prettier 3, Vitest 5, and Playwright for browser verification. Dependency versions are locked in `package-lock.json`. No paid service or cloud API is used.

## Repository structure

```text
relay-miden/
├── apps/
│   ├── web/
│   │   ├── public/assets/
│   │   ├── src/
│   │   │   ├── components/{dashboard,layout,qr,tasks,ui}/
│   │   │   ├── db/{database.ts,errors.ts,task-repository.ts,task-repository.test.ts}
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── pages/{ConnectionsPage.tsx,CreateTaskPage.tsx,DashboardPage.tsx,ReceivePage.tsx,SendPage.tsx,SettingsPage.tsx,TaskDetailsPage.tsx,TasksPage.tsx}
│   │   │   ├── services/lan/{client.ts,connection.ts,index.ts,lan-sync.test.ts,protocol.ts,sync.ts}
│   │   │   ├── services/paperbridge/{checksum.ts,decode.ts,encode.ts,index.ts,qr.ts,paperbridge.test.ts}
│   │   │   ├── services/sync/{sync-repository.ts,sync-repository.test.ts}
│   │   │   ├── styles/{palette.css,globals.css}
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── server/src/{app.ts,app.test.ts,index.ts,server.test.ts,config/,db/,repositories/,services/,sockets/}
├── packages/shared/src/{index.ts,lan.ts,multilingual.ts,paperbridge.ts,paperbridge-v2.ts,sync.ts,tasks.ts}
├── scripts/dev.mjs
├── tests/ui.spec.ts
├── docs/{architecture.md,design-system.md,implementation-plan.md,lan-sync-protocol.md,multilingual-protocol.md,paperbridge-protocol.md,synchronization-protocol.md}
├── docs/history/
├── docs/verification/
├── AGENTS.md
├── README.md
├── LICENSE
├── package.json
└── ...
```

## Prerequisites and installation

Use **Node.js 24 LTS** and **npm 11+**.

```sh
npm ci
# Only needed for browser tests:
npx playwright install chromium
```

## Development

```sh
npm run dev         # frontend + backend
npm run dev:web     # frontend only: http://127.0.0.1:5173
npm run dev:server  # backend only: http://127.0.0.1:3001/health
```

## Build, test, and formatting

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run format:check
npm run format
npm run preview -w @relay-miden/web  # production UI on :4173 after build
npm run start -w @relay-miden/server # compiled server after build
```

## Design system

Forest Green `#004225`, Beige `#F5F5DC`, Amber `#FFB000`, and Peach `#FFCF9D` are declared centrally in [palette.css](apps/web/src/styles/palette.css). Components use variables or derived Tailwind tokens. Metric icons, priorities, and statuses use outline icons/colored text **without colored background fills or pills**. See [design-system.md](docs/design-system.md).

## Local Network Synchronization: How to Connect Devices on a LAN

Phase 6 enables real-time synchronization between multiple devices connected to the same Wi-Fi network or mobile hotspot without public internet access.

### 1. Start the LAN Server (Host Coordinator)

On the coordinator host device:

```sh
# Start the local server
npm run dev:server
# Or after build:
npm run start -w @relay-miden/server
```

The server binds to `0.0.0.0:3001` by default and stores persistent data in `apps/server/data/relay-miden.sqlite` using SQLite WAL mode.

**Environment Variables**:

- `PORT`: Port to listen on (default: `3001`).
- `HOST`: Host interface to bind to (default: `0.0.0.0` for LAN access).
- `DB_PATH`: Path to SQLite database (default: `apps/server/data/relay-miden.sqlite`).
- `LAN_SESSION_TOKEN`: Optional shared secret required from connecting devices.
- `CORS_ORIGIN`: Allowed origins (default: `*` for local network access).

### 2. Connect Client Devices

1. Ensure all devices are connected to the same Wi-Fi network or mobile hotspot.
2. Note the LAN IP address of the coordinator host (e.g., `192.168.1.50`).
3. Open Relay Miden on any device and navigate to **Connections** (`/connections`).
4. Enter the **LAN Server Address**: `http://192.168.1.50:3001`.
5. Enter the **Session Token** if configured on the host.
6. Click **Connect to LAN**. The status advances from `Connecting...` to `Connected` once device registration is acknowledged by the server.

### 3. Real-Time Synchronization & Recovery

- **Live Propagation**: While connected, any task created, edited, status updated, or conflict resolved is committed locally to IndexedDB and immediately submitted to the LAN server. The server persists the change in SQLite and broadcasts it to all other connected peers.
- **Offline Independence**: If a device disconnects from the LAN, task creation and editing continue without interruption in local IndexedDB.
- **Manual Sync Recovery**: Reconnecting devices can click **Sync Now** on the Connections page to catch up on any missed server operations and submit pending local operations.
- **Conflict Handling**: If two devices concurrently modify a task while disconnected, both branches are preserved using Phase 5 causal ancestry. Users resolve the conflict in the Task Details view via _Keep Local_ or _Accept Incoming_, creating a transferable `TASK_RESOLVE` operation that converges both devices.
- **QR / LAN Compatibility**: Tasks imported via PaperBridge QR and synced over LAN share the exact same UUIDs, revisions, and state hashes without duplicate creation.

### 4. Network and Browser Considerations

- **Firewall**: Ensure the host firewall permits inbound TCP traffic on port 3001.
- **Camera Insecure Context**: Browsers disable camera access (`getUserMedia`) on unencrypted HTTP LAN IPs (`http://192.168.x.x`). Relay Miden automatically detects this and directs users to offline QR image file upload.
- **HTTPS Mixed Content**: If the web frontend is hosted under HTTPS, browsers may block insecure `http://` or `ws://` connections to local LAN IPs.

## Ten-phase roadmap

1. Repository setup and design system — implemented and verified.
2. Offline task engine — implemented and verified.
3. PaperBridge QR protocol — implemented and verified.
4. Multilingual communication — implemented and verified.
5. Two-way QR task lifecycle — implemented and verified.
6. Local Wi-Fi communication — implemented and verified.
7. Offline queue and synchronization — implemented and verified.
8. PWA and mobile readiness — implemented and verified.
9. Final UI and mission control — planned.
10. Testing and demo preparation — planned.

See [implementation-plan.md](docs/implementation-plan.md), [architecture.md](docs/architecture.md), [pwa-offline-setup.md](docs/pwa-offline-setup.md), [offline-queue-recovery.md](docs/offline-queue-recovery.md), [lan-sync-protocol.md](docs/lan-sync-protocol.md), [paperbridge-protocol.md](docs/paperbridge-protocol.md), [synchronization-protocol.md](docs/synchronization-protocol.md), and [multilingual-protocol.md](docs/multilingual-protocol.md) for boundaries and technical details.

## Verification results

Verified through 25 October 2026 with Node 24.15.0, npm 11.12.1, and Chromium on Windows:

| Check                       | Actual result                                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency installation     | Passed; zero vulnerabilities reported by npm                                                                                                                                                 |
| `npm run dev`               | Both workspace servers started; frontend returned HTTP 200                                                                                                                                   |
| Live `GET /health`          | HTTP 200 with `{ "status": "ok", "service": "relay-miden-server", "phase": 2 }`                                                                                                              |
| `npm run typecheck`         | Passed for web, server, and shared with zero errors                                                                                                                                          |
| `npm run lint`              | Passed with zero warnings and zero errors                                                                                                                                                    |
| `npm test`                  | 135 tests passed across 11 suites: 9 PWA/manifest/caching, 13 outbox/sync recovery, 7 client LAN, 12 server integration, and 94 Phase 1–5 regressions                                        |
| `npm run build`             | Shared, server, and web production builds passed cleanly; PWA precache manifest generated with 32 entries (1,417 KiB)                                                                        |
| `npm run test:e2e`          | 22 Playwright tests passed: 7 viewports without overflow, CRUD, languages, QR transfer, conflict convergence, LAN server controls, outbox queue, PWA manifest/meta, offline task navigation  |
| Responsive coverage         | Verified across 7 viewport widths (320px–1440px) without horizontal overflow or uncaught page errors                                                                                         |
| PWA Manifest & Icons        | W3C manifest generated with `#004225` theme color, `#F5F5DC` background, standalone mode; complete icon suite (192×192, 512×512, 512×512 maskable, apple-touch-icon, favicon)                |
| Service Worker & App Shell  | Workbox generates `sw.js` precaching 32 essential assets; navigation fallback to `/index.html` with explicit `/api/`, `/socket.io/`, `/health/` exclusion denylist                           |
| Offline Launch & Storage    | Application launches and navigates completely offline; IndexedDB tasks and outbox queues remain intact and are never cleared during cache updates                                            |
| PWA Install & Updates       | Chromium `beforeinstallprompt` handling, iOS Safari Add to Home Screen instructions, standalone mode detection; non-intrusive update notification with user-controlled reload activation     |
| Secure LAN HTTPS Tooling    | `npm run cert:gen` generates multi-IP SAN TLS certificates; `npm run dev:https` starts frontend and server with TLS/WSS; mobile camera access supported in secure context                    |
| Durable Outbox & Recovery   | Verified atomic local mutation enqueueing, abandoned `IN_FLIGHT` recovery on restart, legacy backfill, and live outbox queue telemetry on dashboard/settings                                 |
| Reconnection & Backoff      | Autonomous reconnection with bounded exponential backoff (1s–30s) and $\pm 20\%$ jitter; clean listener teardown; explicit disconnect suppression                                            |
| Causal Replay & Idempotency | Verified parent-first revision replay (1 -> 2 -> 3), duplicate idempotence (`ALREADY_APPLIED`), lost ACK recovery, and missing-parent blocking                                               |
| Contiguous Cursor Safety    | Verified server cursor advances only after local durable commits; invalid server sequence resets detected without data loss                                                                  |
| Conflict Reconciliation     | Offline concurrent edits trigger Phase 5 causal detection; user resolutions generate canonical `TASK_RESOLVE` operations replaying over LAN to convergence                                   |
| QR / LAN Interoperability   | PaperBridge QR imports tracked separately as `TASK_IMPORT` without false outbox publishing; shared operation IDs prevent duplicates                                                          |
| `npm run format:check`      | Passed with 100% Prettier compliance                                                                                                                                                         |
| LAN HTTP mobile UUID repair | `npm run typecheck`, lint, build, and format check passed; 58 targeted storage, sync, QR, and UUID tests passed. Full LAN socket tests remain sandbox-blocked by loopback `EACCES`.          |
| Mobile camera QR repair     | Type check, lint, production build, format check, and 58 targeted task-storage, PaperBridge, and synchronization tests passed. Physical camera decoding requires a phone test after restart. |

The production bundle passes, with Vite's existing advisory that the main JavaScript chunk exceeds 500 kB. Automated browser suites verify LAN UI controls, error states, and isolated client/server exchanges. Physical multi-device LAN testing on distinct hardware has not been manually verified this execution.

## Known limitations

- Background sync when all browser tabs are closed is not supported across all mobile browsers (especially iOS Safari); Relay Miden relies on the durable outbox to replay immediately upon app launch or reconnect.
- Camera scanning requires HTTPS or localhost due to standard browser security policies on `getUserMedia`. Users accessing over an unencrypted local IP HTTP network must use the QR Image Upload option, or run `npm run dev:https` with locally trusted TLS certificates.
- Physical device installation and camera access on actual mobile phones require running `npm run dev:https` and trusting the generated certificate on the phone; simulated headless browsers verify API presence and secure context detection.
- Some mobile browsers restrict `crypto.randomUUID()` on unencrypted LAN HTTP origins. Relay Miden uses a secure `crypto.getRandomValues()` UUID fallback for this case; restart the development server after updating before testing on a phone.
- Single QR payloads are capped at 2,048 bytes to ensure reliable scanning on mobile camera viewfinders.
- Several local edits over QR require individual transfers in revision order. A missing operation is rejected and must be transferred before retrying the dependent update.
- Conflict resolution supports choosing either complete branch. It does not offer field-by-field merging.
- Legacy v1 task snapshots can act as shared ancestry for subsequent v2 edits. Historical operations that predate causal IDs are retained unchanged; the protocol never fabricates missing parent records.
- Structured task codes and selected workflow UI are translated locally. Arbitrary locations and notes remain in the original language, by design.

## Development history

Every Codex execution must update this README and create a unique, immutable Markdown record in `docs/history/` named `phase-XX-YYYYMMDDTHHMMSSZ-unique.md`. Existing records must never be modified, overwritten, reused, or deleted.

- [Phase 1 initialization and verification — 2026-10-24](docs/history/phase-01-20261024T142943Z-9c4b1e.md)
- [Phase 2 recovery and verification — 2026-10-24](docs/history/phase-02-recovery-20261024T153500Z-a7f3c2.md)
- [Phase 3 PaperBridge QR communication and verification — 2026-10-24](docs/history/phase-03-20261024T173000Z-d4e8c1.md)
- [Phase 4 multilingual communication audit, fixes, and verification — 2026-10-25](docs/history/phase-04-20261024T185518Z-b1e5d9.md)
- [Phase 5 bidirectional PaperBridge synchronization and verification — 2026-10-25](docs/history/phase-05-20261024T193303Z-1590d1.md)
- [Phase 6 LAN server and real-time local network synchronization — 2026-10-25](docs/history/phase-06-20261024T203500Z-7f8a12.md)
- [Phase 7 durable offline queue, automatic reconnection, and synchronization recovery — 2026-10-25](docs/history/phase-07-20261024T211000Z-9e4a7b.md)
- [Phase 7 LAN HTTP mobile-storage compatibility repair — 2026-10-25](docs/history/phase-07-20261024T215134Z-4b39f2.md)
- [Phase 7 mobile camera QR scanning reliability repair — 2026-10-25](docs/history/phase-07-20261024T220919Z-c82f40.md)
- [Phase 7 camera constraint correction — 2026-10-25](docs/history/phase-07-20261024T221306Z-7ad27c.md)
- [Phase 8 Progressive Web App, offline launch, installability, and secure LAN — 2026-10-25](docs/history/phase-08-20261024T225500Z-e8f4a1.md)

No Git commands were executed during Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7, or Phase 8. The original MIT [LICENSE](LICENSE) is preserved.
