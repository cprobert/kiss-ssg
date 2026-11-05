# images-sweep.js

## Responsibility

Every decision behind `npx kiss-ssg images <script>`, the encode cache's maintenance sweep: the argv, the environment protocol with the build, which cache entries to remove, which originals under the assets folder to list, and, under `--write`, rewriting them. `bin/kiss-ssg.js` only spawns the build and prints.

## Public interface

- `IMAGES_HELP`, `parseImagesArgs(argv)` → `{ script, args, refresh, write, help, error }`. Flags are read before the script, and `--write` and `--refresh` after it too, up to a `--`, as `check` reads `--summary`. Every other argument after the script, and everything after `--`, goes to the script. Until 2026-11-05 `--write` after the script went to the script: nothing was rewritten and the command exited 0.
- `sweepRequest(env)` → `{ file, refresh } | null`, read by the build: `KISS_IMAGES` names the JSON Lines file to append to, `KISS_IMAGES_REFRESH` asks for every variant to be encoded again. Off by the `CHECK_MODE_OFF` rule `KISS_CHECK` uses.
- `sweepLine({ cache, keys, encoded, assets, maxWidth, failed })` → `SweepLine`, the one line each instance appends; `readSweepLines(text)`.
- `pruneCache({ dir, keep, encoded, dryRun })` → `{ added, removed, kept }`, each `{ count, bytes }`. Removes every cache-named file not in `keep`, an empty one included. A name `isCacheFileName` (`lib/image-encode.js`) does not recognise is neither removed nor counted, so a cache folder configured onto the wrong place cannot cost the site a file (Codex adversarial review, 2026-11-05).
- `findOriginals({ dir, maxWidth })` → `Original[]`: the rasters (not animated) under `dir` with a GPS location or wider than `maxWidth`, from their headers.
- `rewriteOriginals(originals, maxWidth)`: `autoOrient()`, metadata stripped, resized down to `maxWidth`, JPEG at quality 90 (mozjpeg), PNG lossless, WebP at 90, AVIF at 75; a file is replaced only when the result is smaller or it had GPS. The replacement is whole or nothing: a temp sibling, then a rename over the original, so a full disk or a killed process never leaves a truncated photo in `src/` (Codex adversarial review, 2026-11-05). A process killed between the two steps can leave a `<name>.<pid>.<hex>.tmp` beside the original, which is safe to delete.
- **Folders are compared on disk, not by spelling.** Caches are grouped by real path (`fs.realpathSync.native`, which also settles letter case on Windows), so two instances reaching one cache through a junction or a different case each keep the other's entries. Each original is keyed by its real path and judged against the widest recipe of **every** assets folder that contains it, so a photo in one site's `assets/photos`, which another site reads as part of `assets` at a narrower recipe, is never cut to the narrower width (Codex adversarial review, 2026-11-05).
- `sweepImages(...)` returns `rerun: true` when it replaced an original. The replaced file's digest changed, so the cache that pass left holds its old variants and lacks its new ones; the bin then runs the staged build and the sweep once more, without `--write`, so the committed cache matches the next deploy (Codex adversarial review, 2026-11-05).
- `sweepImages({ lines, reports, write, cwd })` → `{ out, err, code }`, the whole sweep after the build.

## Depends on

`node:fs`, `node:path`, `./check.js` (`CHECK_MODE_OFF`), `./image-header.js`, `sharp` (dynamic import, only under `--write`).

## Depended on by

- `bin/kiss-ssg.js` `images`, covered by `test/integration/images-sweep.test.js`.
- `lib/build-finish.js` `encodeImages`, for `sweepRequest` and `sweepLine`.

## Non-obvious behavior

- **The build reports, the sweep prunes.** Each instance's settle encodes its misses into the cache and appends the cache entries its pages asked for. Pruning waits until the whole script has run, because one script can build several sites into one cache (example 7's seasons), and pruning against one instance would delete what its sibling uses. A build never prunes either: a cache shared by branches would lose what another branch's pages use.
- **Never after a failed build.** A page that failed asked for nothing, so pruning against its run would delete entries it needs. Any report that is not `ok`, a line with an encode failure, a line whose instance could not write the cache (`cacheSkipped`: a build only warns, but this command exists to fill the cache), or a run that reported nothing at all refuses, exits 1, and leaves the cache alone. So do passing reports with no sweep line: every settled build appends one, a site with no `{{image}}` included, so none means the script's own kiss-ssg predates `KISS_IMAGES`, and the error says to upgrade (Codex adversarial review, 2026-11-05). So does the script's own exit (`script: { status, signal, error }`, from the bin's `spawnSync`): a script that settled one instance and then threw has written only passing reports, and the next instance's entries, and under `--write` the originals, would otherwise go (Codex adversarial review, 2026-11-05).
- **The run is `check`'s**: `KISS_CHECK=1`, so the build is staged and discarded and only the cache (and, under `--write`, `src/`) is written.
- **The WebP and AVIF qualities for a rewritten original** (90 and 75) are Claude's choice; the operator's decision named only JPEG at 90 and PNG lossless. A WebP or AVIF original with GPS would otherwise have had no way to be stripped.
- **`--write` changes the source**, so the person reads the diff in git before committing. A rewrite that came out larger and carried no GPS is reported as kept.
