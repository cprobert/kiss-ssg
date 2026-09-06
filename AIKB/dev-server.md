# dev-server.js

## Responsibility

Starts the dev-mode static file server (`connect` + `serve-static`) plus a `livereload` server watching the build output.

## Public interface

- `startDevServer(httpRoot, port, { logger, livereloadPort, host })` → `{ server, livereload, ready, close }`. Every parameter is required: the module is engine-internal and `Kiss` always passes `config.folders.build`, `config.port`, `config.livereloadPort` and `config.devHost`, so the defaults belong in `DEFAULT_CONFIG` (one documented place) rather than here. The dead `'public'`/`3000` defaults this signature used to carry contradicted the documented port of 3001 and were reachable only by a deep import (review finding D-12).
  - `server` — the raw `http.Server` from `connect().listen(port, host)`.
  - `livereload` — the `livereload` server instance (already watching `httpRoot`).
  - `ready` — a `Promise` that resolves on the HTTP server's `'listening'` event, or rejects on a bind failure with the whole message already assembled (`Dev server could not bind <host>:<port> (<code>): the site is not being served`, original error on `cause`). It is the only report of that failure — the module logs nothing for it.
  - `close()` — `Promise` that closes `livereload` then the HTTP server, resolving once both are down.

## Depends on

`connect`, `serve-static`, `livereload`.

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- **A bind failure is fatal, reported once, and never preceded by a `Serving` line** (review findings F-E2/F-E3). It used to be neither: the `Serving (…): http://127.0.0.1:3001` line was printed synchronously after `app.listen()` — before the bind had resolved — and an `EADDRINUSE` was then logged twice, by this module's own `'error'` listener (`Dev server error …`) and again by the `Kiss` constructor's `ready.catch` under the wrong subsystem name (`Error running live reload server`), hundreds of lines apart in a verbose log, while the build ran to completion and the process stayed up serving nothing. Now: the `Serving` line is printed inside the `'listening'` handler, so it only ever claims a server that exists; the bind failure is not logged here at all — `ready` rejects with the full sentence and its owner (`lib/kiss.js`) logs it once and records a `<dev server>` build failure, so `complete()` rejects. The `'error'` listener stays attached for the life of the server (an unheard `'error'` on an `EventEmitter` throws) but only logs errors that arrive **after** `'listening'`; a `listening` flag is what tells the two cases apart.
- **The livereload port clash is deliberately not fatal** — unlike the HTTP server, live reload is optional and the site keeps being served without it, so that path stays "log once and continue" (see the livereload `'error'` listener bullet below).
- `close()` is safe after a failed bind: `server.close()` on a server that never listened invokes its callback with `ERR_SERVER_NOT_RUNNING`, which the resolve ignores, so the returned promise still resolves.
- **The livereload server's `'error'` listener is not optional.** `livereload.createServer()` returns an `EventEmitter` whose `listen()` starts an `http.Server` and wraps it in a `ws.Server`; `ws` re-emits the HTTP server's `'error'`, and livereload's `onError` re-emits that on the livereload object itself. With no listener there, an `EADDRINUSE` on the livereload port was an **uncaught exception that killed the whole dev process** — not, as this doc previously claimed, an error that was merely "not surfaced". Two sites in dev mode hit it every time, which is the documented use of `config.port` (review finding D-01). The listener logs and continues: live reload is optional, the site must keep being served without it.
- Both ports and the host come from config, so two sites can run side by side: `livereloadPort` also feeds the `<script>` tag `lib/kiss-page.js` injects, otherwise site B's pages would poll site A's livereload server.
- `host` is passed to both servers so they agree (livereload's own default is `'localhost'`). `app.listen(port)` with no host bound every interface while the log line said `localhost` (review finding D-13); it now binds `config.devHost` — loopback by default — and the log line names the host actually bound. The injected reload `<script>` resolves its host in the browser from `location.hostname` (see `AIKB/kiss-page.md`), so with `devHost: '0.0.0.0'` a page loaded from another device live-reloads from that same device's address rather than asking its own localhost.
- **`delay: 100` is a write-settle, not a preference.** livereload's watcher (`livereload/lib/livereload.js`, `watch()`) passes chokidar's `add` straight to `filterRefresh` with no settle of its own, and `fs.outputFile` creates a file before filling it — so without the delay a browser could be told to reload and fetch a half-written page. livereload's README names `delay` for exactly this case. 100 ms matches the `stabilityThreshold` of `WRITE_SETTLE` in `lib/watcher.js`, so both watchers wait the same amount.
- **`extraExts` adds asset types livereload's defaults omit** — `svg`, `webp`, `avif`, `ico`, `woff`, `woff2`; editing one of those previously changed the built site without reloading the browser. `extraExts` (not `exts`) is the right option: `exts` _replaces_ livereload's default list, `extraExts` concatenates onto it, so `html`/`css`/`js`/`png`/`jpg`/`gif` keep working. **`json` and `xml` are deliberately excluded**: dev mode writes a debug `.json` sibling for every page and `.sitemap()` rewrites `sitemap.xml`, both on every build, so watching those extensions would fire a second reload on every single build.
- `port` of `0` picks a free ephemeral port (Node's standard `net`/`http` behavior) — used by tests that need an isolated server per run without hardcoding a port.
- Every incoming request is logged via `logger.plain(req.url)` before being served — noisy by design in dev mode.
