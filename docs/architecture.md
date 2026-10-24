# Relay Miden architecture

## Phase 1 boundary

Relay Miden is an npm-workspaces monorepo with a React interface, a minimal Express process, and shared TypeScript vocabulary. The current interface uses static sample records and ephemeral React state. It does not implement offline storage or transport. The existing root LICENSE is preserved.

## Frontend

`apps/web` uses React, Vite, strict TypeScript, Tailwind's Vite plugin, declarative React Router, and Lucide icons. `App.tsx` only composes providers and routes. `AppShell` owns desktop/mobile navigation, route focus, and the content region. Pages assemble reusable layout, dashboard, task, and UI components. `lib/demo-data.ts` explicitly labels fixtures; the dashboard totals are independent design fixtures, not counts derived from the four sample rows. `lib/task-form.ts` isolates validation. `hooks/use-language.ts` exposes a small in-memory language context.

The route map is `/`, `/create`, `/tasks`, `/tasks/:id`, `/send`, `/receive`, `/connections`, and `/settings`, with unknown-route and unknown-task fallback views. Search/filter state is local or in URL query parameters. Creating a task displays a validated, unsaved preview. Status selections never modify sample records. Language changes translate navigation and selected headings only, reset on reload, and do not claim full localization.

DM Sans is bundled locally with Fontsource; Malayalam and Tamil use available system fonts. No runtime CDN, analytics, paid API, external images, or cloud dependency is required. Font glyph coverage on the target demo devices should be checked during Phase 4.

## Backend foundation

`apps/server/src/app.ts` exports the Express app for tests; `src/index.ts` validates `PORT`, binds to `HOST`, starts the process, and closes it on termination signals. `GET /health` returns `{ "status": "ok", "service": "relay-miden-server", "phase": 1 }`, with no-store caching. There are no task endpoints, fake API responses, authentication, databases, or network discovery. The UI makes no API calls yet. Root `.env` is optional and loaded by Node for the server and Vite for the web app. `VITE_API_URL` is reserved for future integration and is public configuration.

## Shared package

`packages/shared` contains readonly demonstration task types, priority/status/language vocabulary, and the health response contract. It exports TypeScript types and builds JavaScript/declarations. These are not validated persistence schemas or a QR protocol. The build script builds shared first, then server and web.

## Planned offline-first data flow

```text
User intent -> validated task command -> IndexedDB transaction -> local UI
                                          |
                                    durable outbox
                                          |
                            QR transfer or local LAN transport
                                          |
                         validate / deduplicate / apply / acknowledge
```

This diagram is a target architecture, not an implemented flow. Phase 2 will add a storage boundary, task IDs, timestamps, IndexedDB migrations, error recovery, and transactional reads/writes. Components should call that boundary instead of coupling directly to IndexedDB.

## Planned PaperBridge

Phase 3 will define versioned transfer envelopes and strict validation in shared. It must address QR capacity, length limits, checksums, untrusted payloads, and duplicate detection. Phase 5 adds acknowledgments, lifecycle changes, and conflict semantics. A plain QR icon currently marks the display area; it is intentionally not a scannable task payload.

## Planned LAN transport and synchronization

Phase 6 will add explicit local server discovery/configuration and a transport interface independent of the UI. Phase 7 adds a durable queue, retries, idempotency, conflict resolution, and sync observability. No public internet or paid infrastructure should be required for core operation. Do not use the browser's online flag as proof that another device is reachable.

## Security and browser limitations

- Future incoming QR and LAN data must be treated as untrusted; validate version, shape, size, identifiers, and content before applying changes.
- Camera access requires a secure context (HTTPS or localhost), user permission, and supported browser APIs. Ordinary LAN HTTP may not provide camera/service-worker APIs.
- Browser storage can be evicted; private browsing and quotas vary. Offline data needs clear durability messaging and future export/recovery design.
- A development server is not a production server. The server binds to loopback by default; LAN exposure, origin policy, authentication, abuse limits, and TLS require Phase 6 decisions.
- Production static hosting must fall back to `index.html` for client routes. Express does not currently serve the frontend.
- A service worker, installability, offline asset caching, and refresh without a running server are Phase 8 work. Loading this UI once does not make it an offline-ready PWA.
- No camera requests, real scans, storage, network probes, or task uploads occur in Phase 1. Never put credentials in `VITE_` environment variables.

## Verification boundaries

Vitest exercises form rules and the real Express app over an ephemeral local port. Playwright exercises the built frontend, route fallbacks, filters, preview interactions, language navigation, responsive overflow, and computed styling. These checks do not prove future transport reliability, full translation correctness, or offline persistence.
