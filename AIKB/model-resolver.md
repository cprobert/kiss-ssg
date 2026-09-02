# model-resolver.js

## Responsibility

Resolves `options.model` (in any of its four accepted shapes) into `{ id, data }`, reading from disk, fetching over HTTP, or passing an in-memory object through unchanged.

## Public interface

- `readModelFile(modelsDir, file, { logger })` → parsed JSON object, or `null` (and a logged error) if the file doesn't exist.
- `readModelsFromFolder(modelsDir, folder, { logger })` → array of parsed JSON objects from every `*.json` directly under `${modelsDir}/${folder}`, or `[]` if the folder doesn't exist.
- `async resolveModel(model, { modelsDir, logger, fetchImpl = globalThis.fetch })` → `Promise<{ id, data }>`. Dispatches on `typeof model`:
  - `string` starting with `http` → fetched via `fetchImpl`, `id` = the URL.
  - `string` ending `.json` → read via `readModelFile`, `id` = the filename.
  - other `string` → treated as a folder name, read via `readModelsFromFolder`, `id` = the folder name, `data` is an array.
  - `object` → `{ id: hashId(model), data: model }` (used as-is).
  - `undefined` → `{ data: {} }` (no `id`).
  - anything else → rejects with `Error('Unexpected model type: ...')`.

## Depends on

`fs-extra`, `glob`; `./utils.js` (`hashId`).

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- The four model shapes and the `id` each produces: filename (`id` = filename), URL (`id` = URL), plain object (`id` = `hashId(object)`), folder name (`id` = folder name, `data` is an array — this is the shape `.pages()` fan-out expects).
- Uses the *global* `fetch` by default (`globalThis.fetch`, Node's built-in) rather than importing a fetch library.
- `fetchImpl` is an injectable dependency specifically so tests can stub network calls without mocking global `fetch`.
- Every failure path rejects with an `Error` (not a plain string/object) whose `.message` `Kiss.page()`'s `.catch()` logs; the HTTP failure path additionally attaches the original `error` as `err.error` so both messages get logged.
