# model-resolver.js

## Responsibility

Resolves `options.model` (in any of its four accepted shapes) into `{ id, data }`, reading from disk, fetching over HTTP, or passing an in-memory object through unchanged.

## Public interface

- `readModelFile(modelsDir, file, { logger })` → parsed JSON object, or `null` (and a logged error) if the file doesn't exist.
- `readModelsFromFolder(modelsDir, folder, { logger })` → array of parsed JSON objects from every `*.json` directly under `${modelsDir}/${folder}`, or `[]` if the folder doesn't exist.
- `async resolveModel(model, { modelsDir, logger, fetchImpl = globalThis.fetch })` → `Promise<{ id, data }>`. Dispatches on `typeof model`:
  - `string` starting with `http` → fetched via `fetchImpl`, `id` = the URL; a response whose `ok` is false rejects rather than resolving.
  - `string` ending `.json` → read via `readModelFile`, `id` = the filename.
  - other `string` → treated as a folder name, read via `readModelsFromFolder`, `id` = the folder name, `data` is an array.
  - `object` → `{ id: hashId(model), data: model }` (used as-is).
  - `undefined` → `{ data: {} }` (no `id`).
  - anything else → rejects with `Error('Unexpected model type: ...')`.

## Depends on

`fs-extra`; `./utils.js` (`globFiles`, `posixPath`, `hashId`).

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- The four model shapes and the `id` each produces: filename (`id` = filename), URL (`id` = URL), plain object (`id` = `hashId(object)`), folder name (`id` = folder name, `data` is an array — this is the shape `.pages()` fan-out expects).
- **The relative model filename is `path.posix.relative(root, file)`, not `file.slice(root.length + 1)`.** The slice assumed `modelsDir` had no trailing slash; with one, every filename lost its first characters (`blog/a.json` → `log/a.json`), `readModelFile` logged "Can not find model on file system", every model was filtered out and `resolveModel` threw `Invalid model <folder>` — an error blaming the folder name for a path-arithmetic bug (review finding C4). `resolveFolders` normalises `folders.models` as well; this is the second line of defence for a caller passing `modelsDir` directly.
- **A non-2xx response rejects before the body is parsed** (`Model fetch failed: <url> → <status> <statusText>`). Without that guard an error envelope — the normal shape an API returns with a 500 — parsed as JSON and became the page's model, so the page rendered empty or garbage content and the build reported success (review finding C2). Only an error body that is not JSON failed, and by accident: `response.json()` threw.
- Uses the _global_ `fetch` by default (`globalThis.fetch`, Node's built-in) rather than importing a fetch library.
- `fetchImpl` is an injectable dependency specifically so tests can stub network calls without mocking global `fetch`.
- Every failure path rejects with an `Error` (not a plain string/object) whose `.message` `Kiss.page()`'s `.catch()` logs; the HTTP failure path additionally attaches the original `error` as `err.error` so both messages get logged.
