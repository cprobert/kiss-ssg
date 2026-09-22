# output-registry.js

## Responsibility

Tracks the last successful writer of each output file for one Kiss instance. Prevents asset copying or cleanup from overwriting or removing a file subsequently produced by a page or auxiliary writer, and warns about output collisions.

## Public interface

- `new OutputRegistry(logger)` — an internal per-instance registry.
- `claim(file, owner, kind = 'generated')` — called after a successful write. Records the producer, warns on a different producer, and deduplicates repeated warnings for the same collision.
- `canWriteAsset(file, owner)` — warns about conflicts and refuses an asset overwrite of a generated output or page.
- `owns(file, owner)`, `owner(file)`, `kind(file)` — query current ownership.
- `release(file, owner)` — releases only that producer's claim after removal.
- `relocate(from, to)` — moves claims with atomic build promotion.

## Depends on

`node:path`. Logging is injected. The registry performs no filesystem writes.

## Depended on by

`lib/kiss.js` creates and threads the registry into asset copies, pages, sitemap, llms, feed, robots and redirect writers. Debug writers and `KISS_REPORT` appends in Kiss claim their own files after successful writes too.

## Non-obvious behavior

- Writers register at the write site, using the actual filename, including custom feed and redirect paths. A skipped or failed write claims nothing. There is no auxiliary-filename whitelist.
- Generated outputs take precedence over subsequent asset copies. A warning names the path and both producers; it does not replace ownership protection. Between generated writers, the last successful write owns the file.
- The asset manifest records URL mappings and copy inventories; this registry records actual file ownership. Asset cleanup needs both: a stale inventory entry is removable only while that asset copy still owns the file.
- Page orphan cleanup releases page claims and does not delete a path taken over by another producer. Atomic promotion relocates claims; asset-copy identities use the requested destination, so staging does not change their identity.
- Paths are resolved with Windows case normalization. This is an in-process ownership ledger, not a filesystem lock or a defence against external processes changing files during a build.
