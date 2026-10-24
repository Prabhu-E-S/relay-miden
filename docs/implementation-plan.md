# Relay Miden implementation plan

Only the current explicitly authorized phase may be implemented. Later phases below describe planned work, not shipped capabilities.

| Phase | Scope                                                                                           | Status                   |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------ |
| 1     | Repository setup, design system, responsive UI, health endpoint, documentation and verification | Implemented and verified |
| 2     | Offline task engine: IndexedDB, schemas, migrations, validated create/read/update workflows     | Implemented and verified |
| 3     | PaperBridge QR protocol: versioned envelope, encoding/decoding, validation, duplicate detection | Implemented and verified |
| 4     | Multilingual communication: English, Malayalam, Tamil templates and localized task workflows    | Implemented and verified |
| 5     | Two-way QR task lifecycle: acknowledgments, status transfer, conflict semantics                 | Implemented and verified |
| 6     | Local Wi-Fi communication: explicit local connectivity and LAN transport                        | Implemented and verified |
| 7     | Offline queue and synchronization: durable retries, reconciliation, idempotency                 | Planned                  |
| 8     | PWA and mobile readiness: manifest, caching, installability, offline refresh                    | Planned                  |
| 9     | Final UI and mission control: integrated operational states, polish and accessibility           | Planned                  |
| 10    | Testing and demo preparation: failure scenarios, devices, end-to-end rehearsals                 | Planned                  |

## Phase 1 verification gate

Install dependencies, check workspace scripts, run strict type checks, lint, tests and production builds, verify the real `/health` endpoint, render every route, inspect representative responsive screenshots, check overflow and palette/no-fill rules, and update README with a unique immutable execution history. Mark Phase 1 implemented only after recording actual results. No later phase is authorized by passing this gate.

## Phase 2 verification gate

Verify full Dexie.js / IndexedDB offline schema with Zod, atomic task and operation transactions, monotonic revision and parent revision tracking, anonymous persistent device identity, task CRUD, status transitions, soft deletion, search, filtering, sorting, live dashboard metrics, backend independence, Vitest and Playwright suites, and responsive UI integrity. Document actual results in an immutable recovery execution history file. Mark Phase 2 implemented only after recording actual results. No later phase is authorized by passing this gate.

## Phase 3 verification gate

Verify versioned PaperBridge envelope format (`RELAY_MIDEN_PAPERBRIDGE` v1), deterministic canonical serialization, Web Crypto SHA-256 checksum generation and verification, payload length ceiling (2,048 bytes), QR code generation with error correction level M, PNG download, clipboard payload copying, client-side camera scanning (`html5-qrcode`) with secure context detection and automatic track cleanup, client-side image file decoding (`jsQR`), pre-import task review and explicit user confirmation, atomic IndexedDB ingestion across `tasks`, `operations` (`TASK_IMPORT`), and `imports` deduplication ledger, duplicate scan suppression, conflict protection on revision mismatches, protection against resurrection of locally deleted tasks, 57 Vitest unit and integration tests including QR roundtrip verification, and 15 Playwright E2E tests including multi-device isolated context transfer. Document actual results in an immutable execution history file. Mark Phase 3 implemented only after recording actual results. No later phase is authorized by passing this gate.

## Phase 4 verification gate

Verify bundled English (`en`), Malayalam (`ml`), and Tamil (`ta`) dictionaries with matching canonical code coverage; a backward-compatible optional `StructuredTaskInstruction` on tasks; language-specific instruction templates; local language-preference persistence; structured-task creation and preview; dynamic dashboard, list, details, send, and receive display; and PaperBridge QR round trips that preserve canonical instructions while retaining legacy payload compatibility. Run the Phase 2/3 regression suite, i18n unit tests, browser language-flow coverage, formatting, strict type checks, linting, and a production build. No translation API, LAN transport, acknowledgment transfer, or synchronization is authorized by this gate.

## Phase 5 verification gate

Verify v1 task QR regression plus v2 update and acknowledgment encoding/decoding, explicit state-hash and operation ancestry, duplicate and stale classification, missing-parent handling, atomic incoming updates, persistent conflict records, user-selected resolution operations, two-device convergence, outgoing ACK matching, browser QR round trips, multilingual canonical data preservation, migration from Dexie version 2, strict TypeScript, lint, unit tests, responsive browser tests, and production build. Phase 6 LAN transport and Phase 7 automatic synchronization remain planned.

## Phase 6 verification gate

Verify local Express and Socket.IO server (`apps/server`) with persistent SQLite storage (`node:sqlite`) in WAL mode, monotonic server sequence, device registration with optional host session token, pure causal synchronization engine reuse, initial and incremental catch-up synchronization batches, real-time operation submission, atomic SQLite commits before acknowledgment, duplicate operation idempotence, concurrent branch conflict detection and resolution, real-time broadcast to peers, client LAN synchronization service (`apps/web/src/services/lan/`), manual "Sync Now" recovery, reactive connection status on the dashboard and Connections page without horizontal overflow at any viewport (320px–1440px), 113 Vitest tests (including 12 server integration tests, 7 client LAN tests, and all Phase 2–5 regressions), 19 Playwright tests, zero ESLint warnings, Prettier formatting, and clean production builds. Phase 7 durable background retry queue and replay remain planned.
