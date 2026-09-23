# output-registry.js

## Responsibility

Tracks the last successful writer of each output file for one Kiss instance. Prevents asset copying or cleanup from overwriting or removing a file subsequently produced by a page or auxiliary writer, and warns about output collisions.

## Public interface

- `new OutputRegistry(logger)` — an internal per-instance registry.
- `claim(file, owner, kind = 'generated')` — called after a successful write. Records the producer, warns on a different producer, and deduplicates repeated warnings for the same collision.
- `canWriteAsset(file, owner)` — warns about conflicts and refuses an asset overwrite of a generated output or page.
- `owns(file, owner)`, `owner(file)`, `kind(file)` — query current ownership.
- `release(file, owner)` — releases only that producer's claim after removal.
- `assetOwners(file)` and `hasProducer(owner)` retain visibility of asset producers after a shadowing page is released. This lifecycle is pinned by a unit test.
- `relocate(from, to)` — moves claims and collision paths with atomic build promotion.
- `beginPages()` retires page producers at replay start, keeping their last-written ownership until replacement or orphan cleanup.
- `retain(owner, paths)` retires asset producers absent from the copy's current attempted outputs, including refused writes.
- `snapshot()` — detached collision observations: `{ file, producers, winner, refused }`.
- `clearUnder(directory)` — clears live claims after successful staging disposal, preserving observations for the discarded build's report.

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

- `OutputKind` is the closed union `asset | generated | page`; claims, parameters and collision records have JSDoc types checked by consumers.
- Collisions are advisory records with at least two active producers. Asset and generated producers survive replay; old page producers retire before replacement pages write. Asset reconciliation releases removed sources even if a generated writer now owns their output. Producers include refused asset attempts; `winner` follows successful writes and explicit releases, and is preserved as the last build outcome on discard. `refused` lists owners whose attempts were blocked until a successful claim clears that refusal. The warning is deduplicated independently of the report. Between asset copies the later copy wins; only mixed asset/generated collisions use the generated-precedence wording.

- Registration sites pass absolute filesystem paths; relative display paths belong to the report. Releasing a producer removes it from collision records even when another producer owns the bytes. Warnings involving a released producer may fire again if that conflict returns. Staging disposal preserves the final observations for its report.

- `producers` stores one record per observed output; single-producer records are normal and are not collisions. `snapshot()` filters to two or more active producers. `assetOwners(file)` identifies asset copies to restore after the sweep releases a page; `hasProducer(owner)` keeps restoration registrations only while outputs remain registered.
- **This ledger is the hard road, chosen on purpose.** Jekyll wipes the destination per build, Eleventy never cleans, Hugo renders its dev build to memory; kiss tracks ownership so a watch replay re-copies nothing it does not have to, and every defect the 2026-09 review rounds found was a transition this ledger got wrong. The comparison, kiss's split across `cleanBuild` modes, and the fallback design (a replay that stages and swaps like one-shot `'atomic'`) are in `AIKB/design.md` § Prior art. Read that before extending the lifecycle.
- Case folding is Windows-only. Case aliases on case-insensitive macOS volumes are not currently unified by this registry; blindly folding all Darwin paths would be wrong on case-sensitive volumes. Use consistent path spelling. Volume-aware identity is deferred, not claimed as verified coverage.
