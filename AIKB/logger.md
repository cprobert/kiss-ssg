# logger.js

## Responsibility

Creates the colorized console logger passed around as `{ logger }` through every other module — the single seam for output and, via `silentLogger`, for silencing it in tests.

## Public interface

- `createLogger({ verbose = false, silent = false } = {})` → an object with `verbose`, `banner`, `info`, `success`, `highlight`, `notice`, `warn`, `error`, `debug`, `plain` methods. Each of `banner`/`info`/`success`/`highlight`/`notice`/`warn`/`error` wraps a `console.*` call, painting string arguments with a fixed `colors` color and passing non-string arguments through unchanged; all become no-ops when `silent`.
- `silentLogger` — `createLogger({ silent: true })`, exported as a ready-made instance for tests.
- `export default createLogger()` — a default (verbose: false, silent: false) instance.

## Depends on

`colors` (npm).

## Depended on by

`lib/kiss.js`, `lib/kiss-page.js` (fallback logger only — every other module receives a logger via dependency injection rather than importing this file).

## Non-obvious behavior

- This is the _only_ module allowed to import `colors` (it extends `String.prototype` as a side effect); every other `lib/*.js` module logs only through an injected `logger`, never by importing `colors` itself.
- `paint()` only recolors string arguments — objects/arrays/errors are passed to `console.*` untouched so they still print with native inspection.
- `debug` is separately gated on `verbose` (not just `silent`) — passing `verbose: false` silences `.debug()` even when `silent: false`.
- `silentLogger` exists specifically so tests can pass `{ logger: silentLogger }` into `new Kiss(...)` and suppress all console noise without stubbing individual methods.
