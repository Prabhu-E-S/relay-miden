# Relay Miden

**When networks fail, communication shouldn't.**

Relay Miden is an offline-first, multilingual task-coordination project for the **Works Anyway** track at **Devin Hacks Kochi**. Communities still need to request supplies, coordinate volunteers, and report problems when infrastructure fails. The product is being designed around three constraints: **no internet connection, no shared network between devices, and no common language between users**.

## Current status

**Phase 2 implemented and verified on 24 October 2026.** Local task management is fully functional and backed by IndexedDB via Dexie.js. Tasks, revision histories, and persistent anonymous device identities are stored entirely within the browser. Creating tasks, editing details, progressing statuses, soft deletion, searching, filtering, and live dashboard metrics operate offline without requiring any backend connection or cloud service. Phase 3 has not been started.

### Implemented

- npm-workspaces monorepo with frontend, backend, and shared package.
- Reference-based forest-green/cream responsive UI with desktop sidebar, mobile header and bottom navigation.
- Dashboard, task form/list/details, QR send/receive layouts, connections, and settings routes.
- Dexie.js / IndexedDB offline database (`relay-miden-db`) with `tasks`, `operations`, and `settings` tables and compound indexes.
- Zod runtime validation schemas for tasks, inputs, and operation payloads in `@relay-miden/shared`.
- Atomic local transactions pairing every task mutation with an immutable append-only `TaskOperation` record.
- Monotonic revision incrementing and `parentRevision` tracking for future synchronization.
- Persistent anonymous device UUID identity auto-provisioned in IndexedDB.
- Live reactive queries (`useLiveQuery`) updating dashboard metrics, recent task lists, and filterable task views.
- Real-time search across titles, locations, and descriptions, multi-criteria status/priority filters, and deterministic sorting.
- Explicit status lifecycle progression (`pending` -> `acknowledged` -> `in_progress` -> `completed`) and controlled task reopening.
- Soft-delete lifecycle excluding records from normal listings while preserving operation history for future recovery.
- Accessible native form controls, inline validation, and graceful IndexedDB initialization and quota error handling.
- In-memory English/Malayalam/Tamil navigation dictionaries and language settings; partial interface coverage only.
- Centralized exact brand palette, semantic tokens, locally bundled DM Sans, and Lucide outline icons.
- Real Express `/health` endpoint returning phase 2 status; strictly backend-independent task CRUD.
- Strict TypeScript, ESLint, Prettier, Vitest, browser verification setup, architecture and permanent execution-history policies.

### In progress

- No active implementation phase. Phase 2 verification is complete; the project is ready for a separately authorized Phase 3 (PaperBridge QR protocol).

### Planned

PaperBridge QR task transfer, two-way acknowledgment/status updates, local Wi-Fi/LAN communication, synchronization queues, complete English/Malayalam/Tamil task templates, and installable PWA behavior. All core functionality must eventually work without paid APIs or cloud infrastructure.

## Stack

React 19, Vite 8, TypeScript 6 (strict), Tailwind CSS 4 with its Vite plugin, React Router 8, Dexie.js 4, Lucide React, Node.js 24, Express 5, npm workspaces, ESLint 10, Prettier 3, Vitest 5, and Playwright for browser verification. Dependency versions are locked in `package-lock.json`; TypeScript is kept within the lint parser's supported range. No paid service is used.

## Repository structure

```text
relay-miden/
├── apps/
│   ├── web/
│   │   ├── public/assets/
│   │   ├── src/
│   │   │   ├── components/{dashboard,layout,tasks,ui}/
│   │   │   ├── db/{database.ts,errors.ts,task-repository.ts,task-repository.test.ts}
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── pages/
│   │   │   ├── styles/{palette.css,globals.css}
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── server/src/{app.ts,app.test.ts,index.ts}
├── packages/shared/src/index.ts
├── scripts/dev.mjs
├── tests/ui.spec.ts
├── docs/{architecture.md,design-system.md,implementation-plan.md}
├── docs/history/
├── docs/verification/                 # reviewed desktop/tablet/mobile screenshots
├── AGENTS.md
├── README.md
├── LICENSE
├── .env.example
├── .gitignore
├── .prettierrc
├── eslint.config.js
├── playwright.config.ts
├── vitest.config.ts
├── tsconfig.json
├── package-lock.json
└── package.json
```

## Prerequisites and installation

Use **Node.js 24 LTS** and **npm 11+**. Initial package/browser installation needs internet; the running UI uses local assets. On Windows, PowerShell is supported.

```sh
npm ci
# Optional: copy .env.example to .env in the repository root and adjust values.
# Only needed for browser tests:
npx playwright install chromium
```

## Development

From the repository root:

```sh
npm run dev         # frontend + backend
npm run dev:web     # frontend only: http://127.0.0.1:5173
npm run dev:server  # backend only: http://127.0.0.1:3001/health
```

Run the two individual commands in separate terminals if preferred. Ports are strict for predictable local URLs. The API binds to loopback by default. No credentials or account is required.

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

The root build orders shared, server, then web. `test:e2e` starts a production frontend preview and requires an existing frontend build and Chromium. Test reports/screenshots go into ignored `test-results/` and `playwright-report/`. Formatting excludes append-only history. For production deployment, the static host must rewrite client routes to `index.html`; the Express foundation does not serve the frontend.

## Environment variables

| Variable       | Default                            | Purpose                                                    |
| -------------- | ---------------------------------- | ---------------------------------------------------------- |
| `PORT`         | `3001`                             | Validated Express port                                     |
| `HOST`         | `127.0.0.1`                        | Express bind address; LAN transport is not implemented     |
| `VITE_API_URL` | `http://127.0.0.1:3001` in example | Reserved public frontend API URL; not called by Phase 2 UI |

Root `.env` is optional and ignored. Node loads it for server dev/start; Vite reads it through `envDir`. `VITE_` values are public: never put secrets there. `.env.example` contains only documented non-secret values.

## Design system

Forest Green `#004225`, Beige `#F5F5DC`, Amber `#FFB000`, and Peach `#FFCF9D` are declared centrally in [palette.css](apps/web/src/styles/palette.css). Components use variables or derived Tailwind tokens. The approved reference informs desktop proportions and mobile layouts. Metric icons, priorities, and statuses use outline icons/colored text **without colored background fills or pills**. Cards have thin borders, restrained corners, and generous spacing. See [design-system.md](docs/design-system.md).

## Ten-phase roadmap

1. Repository setup and design system — implemented and verified.
2. Offline task engine — implemented and verified.
3. PaperBridge QR protocol — planned.
4. Multilingual communication — planned.
5. Two-way QR task lifecycle — planned.
6. Local Wi-Fi communication — planned.
7. Offline queue and synchronization — planned.
8. PWA and mobile readiness — planned.
9. Final UI and mission control — planned.
10. Testing and demo preparation — planned.

See [implementation-plan.md](docs/implementation-plan.md) and [architecture.md](docs/architecture.md) for boundaries, future data flow, and browser/security limitations. Passing Phase 2 does not authorize Phase 3 implementation.

## Verification results

Verified on 24 October 2026 with Node 24.15.0, npm 11.12.1, and Chromium 156 on Windows:

| Check                       | Actual result                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Dependency installation     | Passed; zero vulnerabilities reported by npm                                                                                       |
| `npm run dev`               | Both workspace servers started; frontend returned HTTP 200                                                                         |
| Live `GET /health`          | HTTP 200 with `{ "status": "ok", "service": "relay-miden-server", "phase": 2 }`                                                    |
| `npm run typecheck`         | Passed for web, server, and shared                                                                                                 |
| `npm run lint`              | Passed with zero warnings                                                                                                          |
| `npm test`                  | 28 tests passed across 3 files (`task-repository.test.ts`, `task-form.test.ts`, `app.test.ts`)                                     |
| `npm run build`             | Shared/server TypeScript builds and production Vite build passed                                                                   |
| `npm run test:e2e`          | 14 test suites passed (56 route/width combinations across 320, 375, 390, 430, 768, 1024, 1440px)                                   |
| Responsive coverage         | Verified across 7 viewport widths without horizontal overflow or uncaught page errors                                              |
| Offline CRUD & Persistence  | Task creation, inline edit, status updates, reopen, and soft deletion persist across browser reloads in IndexedDB                  |
| Reactive Dashboard          | Dashboard counters and recent tasks update reactively via `useLiveQuery` without backend calls                                     |
| Palette and indicator fills | Exact rendered palette verified; metric, priority, and status backgrounds transparent; brand hex values centralized in palette.css |
| `npm run format:check`      | Passed                                                                                                                             |

## Known limitations

- QR layouts and scanner views remain layout placeholders; encoding, decoding, camera permissions, and file uploads arrive in Phase 3.
- Connectivity cards remain demonstration status indicators; live LAN detection and Wi-Fi sync arrive in Phase 6.
- Full service worker caching and offline startup installation arrive in Phase 8 (PWA).
- Language switching applies to navigation and selected headings; full multilingual templates and translation arrive in Phase 4.

## Development history

Every Codex execution must update this README and create a unique, immutable Markdown record in `docs/history/` named `phase-XX-YYYYMMDDTHHMMSSZ-unique.md`, including failures, retries, and follow-ups. Existing records must never be modified, overwritten, reused, or deleted. Each record captures the prompt/objective, files, commands, implementation, actual test results, issues, and next steps. [AGENTS.md](AGENTS.md) enforces these rules, scope boundaries, and the prohibition on all Git commands.

- [Phase 1 initialization and verification — 2026-10-24](docs/history/phase-01-20261024T142943Z-9c4b1e.md)
- [Phase 2 recovery and verification — 2026-10-24](docs/history/phase-02-recovery-20261024T153500Z-a7f3c2.md)

No Git commands were executed during Phase 1 or Phase 2. The original MIT [LICENSE](LICENSE) is preserved.
