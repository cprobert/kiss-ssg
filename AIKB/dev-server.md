# dev-server.js

## Responsibility

Starts the dev-mode static file server (`connect` + `serve-static`) plus a `livereload` server watching the build output.

## Public interface

- `startDevServer(httpRoot = 'public', port = 3000, { logger })` → `{ server, livereload, ready, close }`.
  - `server` — the raw `http.Server` from `connect().listen(port)`.
  - `livereload` — the `livereload` server instance (already watching `httpRoot`).
  - `ready` — a `Promise` that resolves on the HTTP server's `'listening'` event, or rejects on its `'error'` event.
  - `close()` — `Promise` that closes `livereload` then the HTTP server, resolving once both are down.

## Depends on

`connect`, `serve-static`, `livereload`.

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- `ready` rejects on the server's `'error'` event (e.g. `EADDRINUSE`), and the `Kiss` constructor attaches its own `.catch()` to log that rejection. The server also has its own `'error'` listener (`server.on('error', ...)`) that logs independently — so a startup error is logged **twice** (once by the server's own listener, once by the constructor's `.catch`). This is cosmetic, not a functional bug.
- The `livereload` server has no `'error'` listener of its own — only the HTTP server's failures are surfaced through `ready`.
- `port` of `0` picks a free ephemeral port (Node's standard `net`/`http` behavior) — used by tests that need an isolated server per run without hardcoding a port.
- Every incoming request is logged via `logger.plain(req.url)` before being served — noisy by design in dev mode.
