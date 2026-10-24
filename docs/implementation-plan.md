# Relay Miden implementation plan

Only the current explicitly authorized phase may be implemented. Later phases below describe planned work, not shipped capabilities.

| Phase | Scope                                                                                           | Status                   |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------ |
| 1     | Repository setup, design system, responsive UI, health endpoint, documentation and verification | Implemented and verified |
| 2     | Offline task engine: IndexedDB, schemas, migrations, validated create/read/update workflows     | Implemented and verified |
| 3     | PaperBridge QR protocol: versioned envelope, encoding/decoding, validation, duplicate detection | Implemented and verified |
| 4     | Multilingual communication: English, Malayalam, Tamil templates and complete UI localization    | Planned                  |
| 5     | Two-way QR task lifecycle: acknowledgments, status transfer, conflict semantics                 | Planned                  |
| 6     | Local Wi-Fi communication: explicit local connectivity and LAN transport                        | Planned                  |
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
