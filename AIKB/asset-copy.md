# asset-copy.js

## Responsibility

The build's asset copies as the engine runs them: one queued `copyAssets` run (`lib/assets.js`)
per registration, and the bookkeeping around it — the `<sass: …>` failures each copy owns, the
registrations a replay re-runs, and the copies a released page claim can restore. `lib/assets.js`
is the copy itself and knows nothing of the instance; this module is what ties a copy to a build.

`copyAssetFolder(kiss, …)` takes the `Kiss` instance and reads its state at call time. The state
stays on `Kiss` — `_assetQueue`, `_sassFailures`, `_assetCopies`, `_restorableAssets`,
`_failures`, `_promises` — and `Kiss._copyAssets()` is a one-line delegator to it. Calls back
into the instance go through it (`kiss._stagedPath()`, `kiss._carry()`, `kiss._refreshReport()`).

## Public interface

- `copyAssetFolder(kiss, sourceDir, targetDir, watch = false)` → the queued run (a promise of
  `lib/assets.js`'s result). The body of `Kiss._copyAssets()`; the public `.copyAssets()` and the
  watch re-copies both arrive here. `watch` keeps the run off `_promises`.
- `assetCopyKey(sourceDir, targetDir)` → a copy's identity: the canonicalised `(source, target)`
  pair joined by `\u0000`, or `null` when either half is missing (`folders.assets: null`). Also
  imported by `lib/kiss.js`'s `_replay()`, which re-runs a registered copy by this key.
- `canonical(path)` → `path` canonicalised through `realpathSync.native` as far as it exists, with
  the rest re-appended.

## Depends on

`fs-extra` (`realpathSync.native`), `node:path`, `./utils.js` (`posixPath`), `./assets.js`
(`copyAssets`, `assetCopyOwner`).

## Depended on by

`lib/kiss.js` — `_copyAssets()` delegates to `copyAssetFolder`; `_replay()` uses `assetCopyKey`.

## Non-obvious behavior

- **Copies run one after another, in registration order**, chained on `_assetQueue`: one copy's
  target can be a subdirectory of another's source (a site copying into its own assets folder), and
  concurrent `fs.copy` walks racing there fail with `ENOENT`. A registration's run is pushed onto
  `_promises`; a watch re-copy (`watch: true`) is tracked by the rebuild queue instead, and
  `generate()` / `_drain()` await the `_assetQueue` slot as well as registration work.
- **Paths are resolved at registration, in the caller's working directory**, and the queued run
  copies against those. Re-resolving the raw arguments when the queue drained copied a different
  `./vendor` once anything had moved the working directory in between — measured: neither
  directory got the output. The `<sass: …>` label is computed at the same moment, project-relative
  when the source is inside the project and absolute when it is not; it is display only, never
  identity.
- **A copy owns its Sass failures by object identity**, through `_sassFailures`, a `Map` keyed on
  `assetCopyKey`. Two asset roots can each hold `css/theme.scss`, and a prefix match on the view
  string let a parent root's copy clear a nested root's unresolved failure (measured: a stylesheet
  that could not be written at all, on a build reporting `ok: true`). Each run clears exactly the
  set it recorded last time before recording this time, which is also what lets a deleted or
  renamed broken stylesheet lose its entry. Failures are `kiss._carry()`-marked: a replay keeps
  them, because an asset re-copy is the only thing that can re-check one.
- **The key is computed after the copy has run**, not at registration: canonicalising needs the
  path to exist, and two spellings of a destination that does not exist yet could not canonicalise
  and each kept its own key — a failure stranded under the one nothing would reach again.
  `canonical` walks up to the deepest existing ancestor for the same reason: a plain `realpath`
  with a `resolve` fallback keys one copy two ways across the folder's creation (reproduced through
  a symlinked parent, and on Windows with a case-different one).
- **The registration (`_assetCopies`) exists exactly while a failure does**, because a replay
  re-runs a copy only to re-check one; both maps are pruned together on a clean run, so a
  long-lived process copying into a fresh destination each run does not grow them for ever.
- **`report()` is refreshed after every copy** (`kiss._refreshReport()`): an asset re-copy changes
  `_failures` and settles no build, so nothing else would.
- `_restorableAssets` records a copy whose owner still has a producer in the output registry, so a
  replay's orphan sweep can restore an asset a released page claim had overwritten.
