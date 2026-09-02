# assets.js

## Responsibility

Compiles every Sass file under the assets folder to a sibling `.css` file in the build folder, then copies everything else (excluding raw Sass sources) straight through.

## Public interface

- `compileSassFiles(sourceDir, targetDir, { config, logger })` → array of promises (one per `.scss`/`.sass` file found under `sourceDir`), each resolving after that file's compiled CSS is written to `targetDir` (mirroring the relative path, extension swapped to `.css`). Compile errors are caught and logged per-file; the corresponding promise still resolves.
- `copyAssets(sourceDir, targetDir, { config, logger })` → `Promise<{ id, data }>` (or `{ id, data: null, error }` on copy failure). `id` is `hashId(\`${sourceDir} - ${targetDir}\`)`. Awaits all Sass compilation, then `fs.copy(sourceDir, targetDir, { filter: ... })` excluding `.scss`/`.sass` files. Resolves to `{ id, data: null }` immediately if either directory is falsy.

## Depends on

`fs-extra`, `glob`, `sass`; `./utils.js` (`hashId`).

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- `copyAssets` is written to *always resolve*, never reject: `generate()`/`complete()` await it via `_promises`, and a rejected or forever-pending promise here would hang or crash the whole build. Copy failures are caught and returned as `{ error }` instead of thrown.
- Sass sources (`.scss`/`.sass`) are explicitly excluded from the plain `fs.copy` pass — they're only ever emitted as compiled `.css`, never copied verbatim.
- Sass compilation is `await`ed inside `copyAssets` (via `await Promise.all(compileSassFiles(...))`) and is therefore tracked as part of the single promise `Kiss.copyAssets()` pushes onto `_promises` — v1 fired the CSS write and never tracked it, so a build could finish (and `generate()`/`complete()` resolve) before Sass output existed.
- The returned `{ id, data }` shape is the same shape `Kiss.generate(callback)`'s data array element takes — `id` lets `Kiss.getModelByID` (or manual inspection) find this asset-copy result among the other resolved `_promises`.
