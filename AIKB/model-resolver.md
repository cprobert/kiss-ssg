# model-resolver.js

## Responsibility

Resolves `options.model` (in any of its four accepted shapes) into `{ id, data }`, reading from disk, fetching over HTTP, or passing an in-memory object through unchanged.

## Public interface

- `readModelFile(modelsDir, file, { logger })` → parsed JSON object, or `null` (and a logged error) if the file doesn't exist.
- `readModelsFromFolder(modelsDir, folder, { logger })` → array of parsed JSON objects from every `*.json` directly under `${modelsDir}/${folder}`, or `[]` if the folder doesn't exist.
- `async resolveModel(model, { modelsDir, logger, fetchImpl = globalThis.fetch, fetchConfig })` → `Promise<{ id, data }>`. `fetchConfig` is the resolved `config.fetch` block (`headers`, `timeout`, `retries`, `cache`), passed straight through to `fetchModel`; omitted, every key takes its `DEFAULT_FETCH` value. Dispatches on `typeof model`:
  - `string` whose scheme is `http:` or `https:`, in any case and after any leading space (the test is `isUrlModel`, `lib/utils.js`, shared with `lib/aikb.js` and `lib/page-registry.js`) → fetched via `fetchModel` (`lib/fetch-policy.js`) around `fetchImpl`, `id` = the URL; a response whose `ok` is false rejects rather than resolving.
  - `string` ending `.json` → read via `readModelFile`, `id` = the filename.
  - other `string` → treated as a folder name, read via `readModelsFromFolder`, `id` = the folder name, `data` is an array.
  - `object` → `{ id: hashId(model), data: model }` (used as-is).
  - `undefined` → `{ data: {} }` (no `id`).
  - anything else → rejects with `Error('Unexpected model type: ...')`.

## Depends on

`fs-extra`, `node:path` (the relative-filename arithmetic below); `./utils.js` (`globFiles`, `posixPath`, `hashId`, `isUrlModel`, `redactUrl`); `./fetch-policy.js` (`fetchModel`).

## Depended on by

`lib/page-registry.js` (`resolveModel`, in `_page()`).

## Non-obvious behavior

- The four model shapes and the `id` each produces: filename (`id` = filename), URL (`id` = URL), plain object (`id` = `hashId(object)`), folder name (`id` = folder name, `data` is an array — this is the shape `.pages()` fan-out expects).
- **The relative model filename is `path.posix.relative(root, file)`, not `file.slice(root.length + 1)`.** The slice assumed `modelsDir` had no trailing slash; with one, every filename lost its first characters (`blog/a.json` → `log/a.json`), `readModelFile` logged "Can not find model on file system", every model was filtered out and `resolveModel` threw `Invalid model <folder>` (since 2.14.0 `Model folder empty or missing: <folder>`) — an error blaming the folder name for a path-arithmetic bug (review finding C4). `resolveFolders` normalises `folders.models` as well; this is the second line of defence for a caller passing `modelsDir` directly.
- **The URL branch owns dispatch, not policy.** Headers, timeout, retries and the on-disk cache all live in `lib/fetch-policy.js`; this module passes `fetchConfig` and the injected `fetchImpl` through and keeps its one job (model shape → `{ id, data }`). The order the policy applies is policy-shape check → cache read → URL and header checks → fetch and parse under one timer → non-2xx guard → retry → cache write (a warning on failure); see `AIKB/fetch-policy.md`.
- **A non-2xx response rejects before the body is parsed** (`Model fetch failed: <url> → <status> <reason>`, the URL redacted and the reason the status's standard phrase from `node:http`'s `STATUS_CODES`, never the response's own `statusText` — `AIKB/fetch-policy.md`). Without that guard an error envelope — the normal shape an API returns with a 500 — parsed as JSON and became the page's model, so the page rendered empty or garbage content and the build reported success (review finding C2). Only an error body that is not JSON failed, and by accident: `response.json()` threw.
- **A rejection here is a build failure.** `lib/page-registry.js` records it on `_failures` named by the page's view, once, and the page is not prepared (2.14.0; before, the page was logged and skipped and the build reported success). So the two messages say what is wrong rather than what kiss did about it: `Model not found: <file>` for a `.json` model that is not on disk (it was `Skipping: <file>`), and `Model folder empty or missing: <folder>` for any other string that names no folder with a `.json` in it (it was `Invalid model <folder>`). A folder name is the fallback for every string that is neither a URL nor a `.json` file, so a typo in a file name without the extension lands on the folder message.
- **A model that is not fetched is still printed, so it is printed through `shownModel`.** `Model not found: <model>`, `Model folder empty or missing: <model>` and `readModelFile`'s "Can not find model on file system" line all name the string the author wrote. A file or folder name is shown as written. A string written as `scheme://…` is a URL with a scheme kiss does not fetch (`ftp://user:pass@host/data.json`), and is shown as `redactUrl` shows it: no credentials, no query. Before 2026-11-06 all three printed it whole (the code review of `b8be845`); `test/unit/model-resolver.test.js` holds both shapes, and that an ordinary name with a space or a `?` in it is unchanged.
- A cached URL model never reaches `fetchImpl` at all (`config.fetch.cache`), which is what stops a watch rebuild paying a network round trip per remote model — a cached model is a build input like a `.json` file on disk.
- Uses the _global_ `fetch` by default (`globalThis.fetch`, Node's built-in) rather than importing a fetch library.
- `fetchImpl` is an injectable dependency specifically so tests can stub network calls without mocking global `fetch`.
- Every failure path rejects with an `Error` (not a plain string/object) whose `.message` `registerPage`'s catch logs and records; the HTTP failure path additionally attaches the original `error` as `err.error` so both messages get logged.
- **The URL is the real one in `id` and redacted in everything printed.** `id` is the author's own handle — `.getModelByID(<the URL they wrote>)` must find it — so it is the URL as written. The `Error getting model from <url>` line goes through `redactUrl` (`lib/utils.js`: no credentials, no fragment, each query value `[redacted]`), and the rejection's message and attached `err.error` are the ones `fetchModel` built, already redacted, with no `cause` hanging off them. `lib/page-registry.js`'s catch prints both, so neither may carry a token from the query string.
