# assets.js

## Responsibility

Compiles every Sass file under the assets folder to a sibling `.css` file in the build folder, copies everything else (excluding raw Sass sources) straight through, and records what it emitted in the instance's asset manifest — applying the renaming half of the cache-busting policy on the way.

## Public interface

- `compileSassFiles(sourceDir, targetDir, { config, logger })` → array of promises (one per `.scss`/`.sass` file found under `sourceDir`), each resolving after that file's compiled CSS is written to `targetDir` (mirroring the relative path, extension swapped to `.css`). Compile errors are caught and logged per-file; the corresponding promise still resolves.
- `copyAssets(sourceDir, targetDir, { config, logger, manifest })` → `Promise<{ id, data }>` (or `{ id, data: null, error }` on copy failure). `id` is `hashId(\`${sourceDir} - ${targetDir}\`)`. Awaits all Sass compilation, then `fs.copy(sourceDir, targetDir, { filter: ... })`excluding`.scss`/`.sass`files, then records every emitted file in `manifest`. Resolves to`{ id, data: null }`immediately if either directory is falsy.`manifest`is optional — a throwaway one is created when it is absent, so the function is usable standalone — but`Kiss` always passes its own.

## Depends on

`fs-extra`, `node:path` (the CSS target arithmetic below); `./sass.js` (the resolved sass binding); `./asset-manifest.js` (`createAssetManifest`, `contentHash`, `hashedName`, `isHashable`); `./utils.js` (`globFiles`, `posixPath`, `hashId`).

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- `copyAssets` is written to _always resolve_, never reject: `generate()`/`complete()` await it via `_promises`, and a rejected or forever-pending promise here would hang or crash the whole build. Copy failures are caught and returned as `{ error }` instead of thrown.
- **The CSS target is path arithmetic, not a string replace.** `path.posix.join(posixPath(targetDir), path.posix.relative(root, sassFile))` — the old `sassFile.replace(root, targetDir)` was an unanchored literal replace, so a `sourceDir` ending in a slash was no longer a substring of the glob result, the replace did nothing, and the compiled CSS was written to a sibling of the build folder (`./publicmain.css` at the project root) while the build logged it as a success and exited 0 (review finding C3). `resolveFolders` now normalises the folder string too; the arithmetic here is what keeps a caller passing `compileSassFiles` a raw folder honest.
- Sass sources (`.scss`/`.sass`) are explicitly excluded from the plain `fs.copy` pass — they're only ever emitted as compiled `.css`, never copied verbatim.
- Sass compilation is `await`ed inside `copyAssets` (via `await Promise.all(compileSassFiles(...))`) and is therefore tracked as part of the single promise `Kiss.copyAssets()` pushes onto `_promises` — v1 fired the CSS write and never tracked it, so a build could finish (and `generate()`/`complete()` resolve) before Sass output existed.
- The returned `{ id, data }` shape is the same shape `Kiss.generate(callback)`'s data array element takes — `id` lets `Kiss.getModelByID` (or manual inspection) find this asset-copy result among the other resolved `_promises`.
- The sass compiler is imported from `./sass.js`, never from `sass` directly: which export carries the modern API depends on the installed sass version, and that detection lives in one place (see `AIKB/sass.md`).
- **The manifest is keyed by the path a template writes, not by the source file.** A `.scss` source is recorded under its compiled `.css` name, so `{{asset "css/site.css"}}` resolves and a template never has to know which policy is on (that is the point of gap O6: the template stops encoding the caching scheme). Keys are relative to `config.folders.build`, not to this copy's target, so an extra `copyAssets(src, './public/extra')` records `extra/x.css` — the URL a page asks for. A target outside the build folder falls back to target-relative keys.
- **With no policy set, the emitted files are byte-for-byte and path-for-path what they always were** — the manifest is built either way, and nothing is renamed until `config.assets.hash` asks for it. That is what keeps an existing site unaffected by the feature's existence.
- **A hash is taken over the emitted bytes, never the source.** A stylesheet is hashed after sass compiled it (and after `dev` chose `expanded` over `compressed`), so the name changes exactly when the file a browser downloads changes.
- **Renaming is a post-pass over the plain copy, not a different copy.** `fs.copy` writes `css/site.css`, the pass then reads it, hashes it and `fs.move`s it to `css/site.<hash>.css`. Keeping the copy itself untouched is what makes the hashing-off path provably the old one.
- **The stale hashed file is deleted here, because nothing else can.** `Kiss._replay()`'s orphan sweep only knows page outputs; a renamed asset never appears in `_stack`. `manifest.record()` returns the name it replaced and this module removes that file, so a watch-mode stylesheet edit leaves one hashed CSS in the build, not one per save.
- **One `fs.stat` per globbed source path decides what was emitted**, and it covers two cases at once: a directory the glob returned, and a `.scss` whose compile failed (its `.css` was never written). Neither is a file in the build, so neither is recorded — a broken sass file still logs its own error and leaves the copy successful.
- `config.assets.hash` and `config.assets.version` are mutually exclusive in effect: with both set the hashed filename wins, `version` is ignored, and one warning says so. The `version` half is the helper's job — nothing is renamed for it — so this module only warns.
- `copyAssets()` itself has no concurrency guard — two calls given overlapping source/target trees (e.g. one's target a subdirectory of the other's source) can run their `fs.copy` walks simultaneously and produce `ENOENT` failures mid-walk. `Kiss.copyAssets()` is the module's only caller and is responsible for serializing calls (via `_assetQueue`) so this function is never actually invoked concurrently in practice; this module makes no such guarantee on its own.
- **Sass is compiled through `compileFile()`, which loads the package at the point of compile and memoises the result**, not bound at import — see `AIKB/sass.md`. A site with no `.scss` under its assets folder never loads the `sass` package at all.
