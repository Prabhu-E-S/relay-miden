# Relay Miden

**When networks fail, communication shouldn't.**

Relay Miden is an offline-first, multilingual task-coordination project for the **Works Anyway** track at **Devin Hacks Kochi**. Communities still need to request supplies, coordinate volunteers, and report problems when infrastructure fails. The product is being designed around three constraints: **no internet connection, no shared network between devices, and no common language between users**.

## Current status

**Phase 3 implemented and verified on 24 October 2026.** PaperBridge offline QR communication is fully functional. Tasks can be exported as scannable QR codes or PNG images, and imported on disconnected receiving devices via live camera scanning or client-side QR image upload. All encoding, canonical serialization, SHA-256 checksum verification, and atomic IndexedDB persistence operate entirely within the browser without cloud APIs, servers, or external networks. Phase 4 has not been started.

### Implemented

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

- No active implementation phase. Phase 3 verification is complete; the project is ready for a separately authorized Phase 4 (Multilingual communication & localized templates).

### Planned

Two-way QR task lifecycle (acknowledgments & status updates), local Wi-Fi/LAN transport, synchronization queues, complete English/Malayalam/Tamil task templates, and installable PWA behavior. All core functionality must work without paid APIs or cloud infrastructure.

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
│   │   │   ├── services/paperbridge/{checksum.ts,decode.ts,encode.ts,index.ts,qr.ts,paperbridge.test.ts}
│   │   │   ├── styles/{palette.css,globals.css}
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── server/src/{app.ts,app.test.ts,index.ts}
├── packages/shared/src/{index.ts,paperbridge.ts,tasks.ts}
├── scripts/dev.mjs
├── tests/ui.spec.ts
├── docs/{architecture.md,design-system.md,implementation-plan.md,paperbridge-protocol.md}
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

## Ten-phase roadmap

1. Repository setup and design system — implemented and verified.
2. Offline task engine — implemented and verified.
3. PaperBridge QR protocol — implemented and verified.
4. Multilingual communication — planned.
5. Two-way QR task lifecycle — planned.
6. Local Wi-Fi communication — planned.
7. Offline queue and synchronization — planned.
8. PWA and mobile readiness — planned.
9. Final UI and mission control — planned.
10. Testing and demo preparation — planned.

See [implementation-plan.md](docs/implementation-plan.md), [architecture.md](docs/architecture.md), and [paperbridge-protocol.md](docs/paperbridge-protocol.md) for boundaries and technical details.

## Verification results

Verified on 24 October 2026 with Node 24.15.0, npm 11.12.1, and Chromium on Windows:

| Check                       | Actual result                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency installation     | Passed; zero vulnerabilities reported by npm                                                                                             |
| `npm run dev`               | Both workspace servers started; frontend returned HTTP 200                                                                               |
| Live `GET /health`          | HTTP 200 with `{ "status": "ok", "service": "relay-miden-server", "phase": 2 }`                                                          |
| `npm run typecheck`         | Passed for web, server, and shared with zero errors                                                                                      |
| `npm run lint`              | Passed with zero warnings                                                                                                                |
| `npm test`                  | 57 tests passed across 4 files (`paperbridge.test.ts`, `task-repository.test.ts`, `task-form.test.ts`, `app.test.ts`)                    |
| `npm run build`             | Shared/server TypeScript builds and production Vite build passed                                                                         |
| `npm run test:e2e`          | 15 test suites passed (multi-device transfer across isolated contexts, duplicate protection, 56 route/width combinations at 320..1440px) |
| Responsive coverage         | Verified across 7 viewport widths without horizontal overflow or uncaught page errors                                                    |
| Multi-device QR transfer    | Verified end-to-end task export, image upload, decoding, pre-import review, and persistence across isolated browser contexts             |
| Duplicate suppression       | Rescanning same QR code displays "Task Already Present" without creating duplicate tasks or duplicate operation logs                     |
| Offline CRUD & Persistence  | Task creation, inline edit, status updates, reopen, and soft deletion persist across browser reloads in IndexedDB                        |
| Reactive Dashboard          | Dashboard counters and recent tasks update reactively via `useLiveQuery` without backend calls                                           |
| Palette and indicator fills | Exact rendered palette verified; metric, priority, and status backgrounds transparent; brand hex values centralized in palette.css       |
| `npm run format:check`      | Passed with 100% Prettier compliance                                                                                                     |

## Known limitations

- Camera scanning requires HTTPS or localhost due to standard browser security policies on `getUserMedia`. Users accessing over an unencrypted local IP HTTP network must use the QR Image Upload option.
- Single QR payloads are capped at 2,048 bytes to ensure reliable scanning on mobile camera viewfinders.
- Connectivity cards remain demonstration status indicators; live LAN detection and Wi-Fi sync arrive in Phase 6.
- Full service worker caching and offline startup installation arrive in Phase 8 (PWA).
- Language switching applies to navigation and selected headings; full multilingual templates and translation arrive in Phase 4.

## Development history

Every Codex execution must update this README and create a unique, immutable Markdown record in `docs/history/` named `phase-XX-YYYYMMDDTHHMMSSZ-unique.md`. Existing records must never be modified, overwritten, reused, or deleted.

- [Phase 1 initialization and verification — 2026-10-24](docs/history/phase-01-20261024T142943Z-9c4b1e.md)
- [Phase 2 recovery and verification — 2026-10-24](docs/history/phase-02-recovery-20261024T153500Z-a7f3c2.md)
- [Phase 3 PaperBridge QR communication and verification — 2026-10-24](docs/history/phase-03-20261024T173000Z-d4e8c1.md)

No Git commands were executed during Phase 1, Phase 2, or Phase 3. The original MIT [LICENSE](LICENSE) is preserved.
