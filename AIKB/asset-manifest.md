# asset-manifest.js

## Responsibility

Holds what an asset copy emitted — the path a template writes mapped to the file that is actually in the build — and owns the naming half of the cache-busting policy (content hash, hashed filename, which files may be renamed at all).

## Public interface

- `HASH_LENGTH` — `8`, the number of hex characters a content hash contributes to a filename.
- `isHashable(urlPath)` → boolean. True for `.css` and `.js` (case-insensitive) only.
- `contentHash(bytes)` → the first `HASH_LENGTH` hex characters of the MD5 of `bytes` (a `Buffer` or a string).
- `hashedName(urlPath, hash)` → the same path with the hash inserted before the last extension (`css/site.css` → `css/site.a1b2c3d4.css`). A path whose last dot is in a folder name, or which has no dot at all, gets the hash appended instead (`css/site` → `css/site.a1b2c3d4`).
- `createAssetManifest()` → `{ record, lookup, toObject }`, a fresh manifest with its own `Map`.
  - `record(urlPath, emittedPath)` — stores the mapping and returns the **previous** `emittedPath` when it differs from the new one (the caller's cue to delete the file it just replaced), otherwise `null`.
  - `lookup(urlPath)` — the emitted path, or `null`.
  - `toObject()` — a plain object copy of the map, for debugging.

## Depends on

`node:crypto`.

## Depended on by

`lib/assets.js` (records and renames), `lib/handlebars-helpers.js` (the `asset` helper reads it), `lib/kiss.js` (creates the one per instance and threads it into both).

## Non-obvious behavior

- **Only `.css` and `.js` are hashable, and that is a domain rule, not a default.** Renaming an image, a font or `robots.txt` breaks URLs nothing here can rewrite: the ones inside a stylesheet, and the ones a host or a browser asks for by a fixed name. kiss has no bundler (`CLAUDE.md`: "no build step, bundler, or transpilation"), so it renames only the files a template links by name and leaves everything else alone — those still reach the manifest, mapped to themselves, so `{{asset "img/logo.png"}}` resolves rather than warning.
- **The hash goes before the extension.** A server picks the content type off the extension, and `site.css.a1b2c3d4` is not a stylesheet to it.
- **`record` returning the old name is the whole stale-file mechanism.** Nothing else knows which file a rename replaced: `Kiss._replay()`'s orphan sweep only ever considers page outputs (`_stack` `buildTo` paths), so a hashed asset is invisible to it. `lib/assets.js` deletes what `record` hands back.
- **A manifest is per `Kiss` instance**, like the Handlebars environment, so two sites in one process cannot link each other's files. Nothing here is module-level state.
- MD5 is a fingerprint, not a security claim — it is comparing a file to its own previous bytes.
