# Relay Miden architecture

## Phase 2 boundary

Relay Miden is an npm-workspaces monorepo with an offline-first React interface, a minimal Express health process, and a shared TypeScript package with Zod validation schemas. With Phase 2 completed, task management (creation, retrieval, update, status progression, soft deletion, search, filtering, and metric calculation) is fully offline and backed by IndexedDB via Dexie.js. No operational task data is sent to the backend or cloud. The existing root LICENSE is preserved.

## Frontend

`apps/web` uses React, Vite, strict TypeScript, Tailwind's Vite plugin, declarative React Router, Lucide icons, Dexie.js, and `dexie-react-hooks`. `App.tsx` composes providers (`DatabaseProvider`, `LanguageProvider`) and routes. `AppShell` owns desktop/mobile navigation, route focus, and the content region.

- `db/database.ts`: Defines `RelayMidenDatabase` with indexed tables: `tasks`, `operations`, and `settings`.
- `db/task-repository.ts`: Encapsulates all transactional CRUD, validation, revision increments, and operation history generation.
- `components/layout/DatabaseProvider.tsx`: Initializes the database on application startup, managing loading and error fallback states gracefully.
- Pages assemble reusable layout, dashboard, task, and UI components. The dashboard aggregates live statistics and recent tasks directly from IndexedDB via `useLiveQuery`.
- The route map is `/`, `/create`, `/tasks`, `/tasks/:id`, `/send`, `/receive`, `/connections`, and `/settings`, with fallback views.
- Status transitions follow strict lifecycle progression: pending -> acknowledged -> in_progress -> completed, with an explicit reopen flow.
- Soft-deleted tasks are flagged with `deletedAt` and excluded from normal listings while preserving operation history.

DM Sans is bundled locally with Fontsource; Malayalam and Tamil use available system fonts. No runtime CDN, analytics, paid API, external images, or cloud dependency is required.

## Backend foundation

`apps/server/src/app.ts` exports the Express app for tests; `src/index.ts` validates `PORT`, binds to `HOST`, starts the process, and closes it on termination signals. `GET /health` returns `{ "status": "ok", "service": "relay-miden-server", "phase": 2 }`, with no-store caching. There are no task endpoints, fake API responses, authentication, external databases, or network discovery. The UI makes no API calls; task management is completely backend-independent.

## Shared package

`packages/shared` contains Zod schemas for runtime validation and static TypeScript types:

- `TaskSchema`, `CreateTaskInputSchema`, `UpdateTaskInputSchema`
- `TaskOperationSchema`, `TaskOperationTypeSchema`
- `TaskStatusSchema`, `TaskPrioritySchema`, `TaskActionSchema`
- Status transition validator `isValidStatusTransition`
- Health response contract (`phase: 2`)

The root build compiles shared first, then server and web.

## Implemented offline-first data flow

```text
User intent -> validated task command -> IndexedDB transaction -> local UI (reactive via useLiveQuery)
                                         (tasks + operations)
                                          |
                                    [Planned: Phase 7 durable outbox]
                                          |
                                    [Planned: Phase 3 QR / Phase 6 LAN]
                                          |
                          validate / deduplicate / apply / acknowledge
```

The initial local stage is fully functional: every mutation creates an atomic transaction updating `tasks` and appending a serializable `TaskOperation` record with revision and parent revision tracking.

## Planned PaperBridge

Phase 3 will define versioned transfer envelopes and strict validation in shared. It must address QR capacity, length limits, checksums, untrusted payloads, and duplicate detection. Phase 5 adds acknowledgments, lifecycle changes, and conflict semantics. Send and Receive routes currently present layout placeholders linked to real local task records.

## Planned LAN transport and synchronization

Phase 6 will add explicit local server discovery/configuration and a transport interface independent of the UI. Phase 7 adds a durable queue, retries, idempotency, conflict resolution, and sync observability. No public internet or paid infrastructure should be required for core operation. Do not use the browser's online flag as proof that another device is reachable.

## Security and browser limitations

- Future incoming QR and LAN data must be treated as untrusted; validate version, shape, size, identifiers, and content before applying changes.
- Camera access requires a secure context (HTTPS or localhost), user permission, and supported browser APIs. Ordinary LAN HTTP may not provide camera/service-worker APIs.
- Browser storage can be evicted; private browsing and quotas vary. Offline data needs clear durability messaging and future export/recovery design. Quota errors are handled gracefully with user notifications.
- A development server is not a production server. The server binds to loopback by default; LAN exposure, origin policy, authentication, abuse limits, and TLS require Phase 6 decisions.
- Production static hosting must fall back to `index.html` for client routes. Express does not currently serve the frontend.
- A service worker, installability, offline asset caching, and refresh without a running server are Phase 8 work. Loading this UI once does not make it an offline-ready PWA.
- No camera requests, real scans, or network task uploads occur in Phase 2. Never put credentials in `VITE_` environment variables.

## Verification boundaries

Vitest exercises form validation, the Express health endpoint, and the full `TaskRepository` suite against `fake-indexeddb`. Playwright exercises the built frontend, real IndexedDB persistence across reloads, responsive overflow across 7 viewport widths, task lifecycle, search/filtering, dialogs, and styling tokens.
