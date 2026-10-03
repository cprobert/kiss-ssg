# asset-manifest.js

## Responsibility

Holds what an asset copy emitted — the path a template writes mapped to the file that is actually in the build — and owns the naming half of the cache-busting policy (content hash, hashed filename, which files may be renamed at all).

## Public interface

- `HASH_LENGTH` — `8`, the number of hex characters a content hash contributes to a filename.
- `isHashable(urlPath)` → boolean. True for `.css` and `.js` (case-insensitive) only.
- `contentHash(bytes)` → the first `HASH_LENGTH` hex characters of the MD5 of `bytes` (a `Buffer` or a string).
- `hashedName(urlPath, hash)` → the same path with the hash inserted before the last extension (`css/site.css` → `css/site.a1b2c3d4.css`). A path whose last dot is in a folder name, or which has no dot at all, gets the hash appended instead (`css/site` → `css/site.a1b2c3d4`).
- `createAssetManifest()` → `{ lookup, toObject, hasOwner, owns, previous, reconcile, reconcileSass, unrecorded, urlRevision }`, a fresh manifest.
  - `lookup(urlPath)` — the emitted path, or `null`.
  - `toObject()` — a plain object copy of the map, for debugging.

- `hasOwner(owner)` — whether a source/target copy has an inventory, or has written outputs it never recorded (below).
- `reconcile(owner, current)` — replaces that copy's map of logical names to emitted filenames, removes vanished mappings, and returns old filenames no copy still owns, plus that copy's unrecorded outputs that this run did not produce again. Another copy's mappings survive.
- `unrecorded(owner, outputs)` — remembers build-relative outputs a copy wrote, or failed to remove, before it stopped partway. They are in no map and `lookup` never sees them; the copy's next `reconcile` reports them stale unless they are live again, then forgets them.
- `owns(owner, output)` — whether `output` (build-relative, keyed by output not by name) is this copy's, recorded or unrecorded. Never another copy's. `lib/assets.js` asks it only when no output registry was passed; with a registry, the registry is the authority.

- `urlRevision` — increments when reconciliation changes a CSS/JS URL mapping, including additions and deletions. Image/font content edits and identical mappings leave it unchanged; the watcher uses it to decide whether hashed references need re-rendering. `reconcile` is the only mapping writer.

## Depends on

`node:crypto`.

## Depended on by

`lib/assets.js` (records and renames), `lib/handlebars-helpers.js` (the `asset` helper reads it), `lib/kiss.js` (creates the one per instance and threads it into both).

## Non-obvious behavior

- **Only `.css` and `.js` are hashable, and that is a domain rule, not a default.** Renaming an image, a font or `robots.txt` breaks URLs nothing here can rewrite: the ones inside a stylesheet, and the ones a host or a browser asks for by a fixed name. kiss has no bundler (`CLAUDE.md`: "no build step, bundler, or transpilation"), so it renames only the files a template links by name and leaves everything else alone — those still reach the manifest, mapped to themselves, so `{{asset "img/logo.png"}}` resolves rather than warning.
- **The hash goes before the extension.** A server picks the content type off the extension, and `site.css.a1b2c3d4` is not a stylesheet to it.
- **Cleanup follows per-copy inventories.** `lib/assets.js` reconciles each source/requested-target pair after copying. Old hashed names and deleted sources disappear; files another copy still owns remain. The output registry separately checks that a generated writer has not taken ownership of a stale file.
- **A map is only written by a copy that finished, so a copy that stopped needs a second record.** `reconcile` runs at the end of a copy; a copy that fails partway has already put files in the build that no map holds, and before `unrecorded` nothing ever removed them (a `git checkout` during `--dev` left a stale asset until restart). They are kept apart from the name map rather than merged into it, because a name has one output: merging a half-copied plain `css/site.css` under a name whose map says `css/site.a1b2c3d4.css` would have reported the last-good hashed file stale and deleted it. A copy with unrecorded outputs counts for `hasOwner`, because its root demonstrably existed, so that root disappearing is a deletion to reconcile, not the typo a missing first root is.
- **A manifest is per `Kiss` instance**, like the Handlebars environment, so two sites in one process cannot link each other's files. Nothing here is module-level state.
- MD5 is a fingerprint, not a security claim — it is comparing a file to its own previous bytes.

- `reconcileSass(owner, fingerprints)` retains the latest successful, unshadowed Sass fingerprints per copy and returns the changed source names. It does not change URL mappings or their revision; replacing the map also retires removed entries.

- `previous(owner, name)` returns that copy's last-good output or null. Failed Sass compiles may carry it into reconciliation; removed sources do not. This does not read another copy's global mapping.
