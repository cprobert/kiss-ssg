# dev-server.js

## Responsibility

Starts the dev-mode static file server (`connect` + `serve-static`) plus a `livereload` server watching the build output.

## Public interface

- `startDevServer(httpRoot, port, { logger, livereloadPort, host })` → `{ server, livereload, ready, close }`. Every parameter is required: the module is engine-internal and `Kiss` always passes `config.folders.build`, `config.port`, `config.livereloadPort` and `config.devHost`, so the defaults belong in `DEFAULT_CONFIG` (one documented place) rather than here. The dead `'public'`/`3000` defaults this signature used to carry contradicted the documented port of 3001 and were reachable only by a deep import (review finding D-12).
  - `server` — the raw `http.Server` from `connect().listen(port, host)`.
  - `livereload` — the `livereload` server instance (already watching `httpRoot`).
  - `ready` — a `Promise` that resolves on the HTTP server's `'listening'` event, or rejects on its `'error'` event.
  - `close()` — `Promise` that closes `livereload` then the HTTP server, resolving once both are down.

## Depends on

`connect`, `serve-static`, `livereload`.

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- `ready` rejects on the server's `'error'` event (e.g. `EADDRINUSE`), and the `Kiss` constructor attaches its own `.catch()` to log that rejection. The server also has its own `'error'` listener (`server.on('error', ...)`) that logs independently — so a startup error is logged **twice** (once by the server's own listener, once by the constructor's `.catch`). This is cosmetic, not a functional bug.
- **The livereload server's `'error'` listener is not optional.** `livereload.createServer()` returns an `EventEmitter` whose `listen()` starts an `http.Server` and wraps it in a `ws.Server`; `ws` re-emits the HTTP server's `'error'`, and livereload's `onError` re-emits that on the livereload object itself. With no listener there, an `EADDRINUSE` on the livereload port was an **uncaught exception that killed the whole dev process** — not, as this doc previously claimed, an error that was merely "not surfaced". Two sites in dev mode hit it every time, which is the documented use of `config.port` (review finding D-01). The listener logs and continues: live reload is optional, the site must keep being served without it.
- Both ports and the host come from config, so two sites can run side by side: `livereloadPort` also feeds the `<script>` tag `lib/kiss-page.js` injects, otherwise site B's pages would poll site A's livereload server.
- `host` is passed to both servers so they agree (livereload's own default is `'localhost'`). `app.listen(port)` with no host bound every interface while the log line said `localhost` (review finding D-13); it now binds `config.devHost` — loopback by default — and the log line names the host actually bound. The injected reload `<script>` still points at `localhost`, so with `devHost: '0.0.0.0'` a page loaded from another device serves fine but does not live-reload.
- `port` of `0` picks a free ephemeral port (Node's standard `net`/`http` behavior) — used by tests that need an isolated server per run without hardcoding a port.
- Every incoming request is logged via `logger.plain(req.url)` before being served — noisy by design in dev mode.
