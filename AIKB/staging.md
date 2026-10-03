# staging.js

## Responsibility

The staging folder of a `cleanBuild: 'atomic'` build, from its name to its end: naming the
sibling folders, routing writes into them, promoting the staged build into place, discarding a
failed one, and sweeping what a crashed run left behind. `lib/kiss.js` decides _when_ — its
`complete()` promotes or discards, its constructor sweeps, its `close()` removes — and this module
does the work.

Every function except `stagingSiblings` and `renameForPromote` takes the `Kiss` instance as its
first argument and reads its state at call time. State stays on `Kiss` (`_stagingDir`,
`_buildTarget`, `_oldDir`, `_buildSettled`, `_promotedFrom`); the module owns none. `Kiss` keeps a
same-named private method for each (`_promote()` → `promote(kiss)`), and inside this module one
step calls another through the instance (`kiss._swapIn(…)`, `kiss._renameForPromote(…)`), never
directly — tests patch `_promote` on the instance (`test/integration/redirects.test.js`), and a
direct call would step around the patch.

## Public interface

- `stagingSiblings(target)` → `{ stagingDir, oldDir }` — `<target>.kiss-staging-<pid>-<random>`
  and `<target>.kiss-old-<same suffix>`. Called by `Kiss._setupFolders()`.
- `writeRoot(kiss)` / `writeConfig(kiss)` — the bodies of the `_writeRoot` / `_writeConfig`
  getters: the folder this build writes into, and `config` with `folders.build` pointed at it (the
  same object as `config` when nothing is staged).
- `sweepStaleSiblings(kiss)` — `_sweepStaleSiblings()`.
- `stagedPath(kiss, target)` — `_stagedPath()`. `toReportedPath(kiss, target)` —
  `_reportedPath()` (named apart from `build-report.js`'s unrelated `reportedPath`).
- `renameForPromote(from, to, folder)` — `_renameForPromote()`.
- `restorePrevious`, `promote`, `swapIn`, `discardStaging`, `abandonStaging`, `removeStaging` —
  the `_`-prefixed method of the same name on `Kiss`.

## Depends on

`fs-extra` and `node:fs/promises` as **default imports** — `test/integration/staging.test.js`,
`watch.test.js` and `atomic-build.test.js` spy on `fs.rm`, `fs.remove`, `fs.move` and
`fsp.rename`, which only works while this module calls them as members of those objects. And
`node:path`. Nothing from `lib/`.

## Depended on by

`lib/kiss.js` only, through its delegating methods and the `_writeRoot` / `_writeConfig` getters.

## Non-obvious behavior

- **`cleanBuild: 'atomic'` builds into a staging sibling and swaps it in on success.**
  `Kiss._setupFolders()` keeps the folder the consumer asked for in `_buildTarget` and sets
  `_stagingDir` from `stagingSiblings()`, which `_writeRoot` and `_writeConfig` follow, so every
  write path lands there with no further plumbing; the real folder is not touched at all until the
  swap, and `config.folders.build` is never repointed (`AIKB/kiss.md`, the write-root bullet).
  `complete()` is the decision point: a settle with no failures calls `_promote()`, and a settle
  with failures calls `_discardStaging()`, which deletes the staging folder and leaves the previous
  output exactly as it was. Promotion happens **once**: `_buildSettled` latches, so the nested
  `complete()` pattern's second call is a no-op and a second `complete()` after a failed build can
  never promote a build that failed. The latch is set **before the first `await`** in both
  `promote` and `discardStaging`, which is why `Kiss`'s delegators are synchronous. The failure
  message names the target path, not the staging path (`_reportedPath`), because the staging
  folder is an implementation detail the operator should not have to decode.
- **Promotion is rename-aside, not remove-then-rename**, so the previous output is never absent
  for the length of a recursive delete. `swapIn` renames the existing target to the `kiss-old`
  sibling (both siblings of one build share the `<pid>-<random>` suffix, so a leftover pair is
  recognisably one crashed run), renames staging into the target, and only then removes the old
  folder. The previous output is therefore absent only _between two renames_ — metadata operations
  on one filesystem. **Both renames (and the restore) go through `renameForPromote`, which calls
  `node:fs/promises` directly, not fs-extra**: fs-extra's `rename` is graceful-fs's, which on
  Windows retries `EPERM`/`EACCES`/`EBUSY` for up to 60 s, so a preview server or editor holding a
  file open in the build folder made the build sit silent for a minute and then fail with a bare
  `EPERM` (measured 60136 ms, 2026-09-28; `AIKB/upstream.md`). It retries those codes itself for
  about 1.5 s (`PROMOTE_RETRY_MS`) — long enough for an antivirus or indexer blip — and then throws
  an error naming the folder and the likely holder. If the second rename fails, the cross-device
  `fs.move` fallback is tried **only for `EXDEV`** — a lock is not a filesystem boundary, and a
  copy under one fails the same way after far more work, so any other error restores the previous
  output and rethrows; and if the fallback fails too, the fragment it wrote is removed and the old
  folder is renamed back before the error is rethrown, so a failed promotion ends with the previous
  output byte-identical. The one case that cannot be repaired automatically is a restore that
  itself throws: the old folder then holds the only copy, so it is named in an `error` line and
  `close()` deliberately leaves it alone while the target is missing. `promote` wraps `swapIn`:
  **any** throw from it removes the staging folder at once through `_abandonStaging()`, before
  rethrowing — it used to be left for `close()`, which a one-shot build script never calls.
  `_stagingDir` is still cleared only after a successful swap, so `close()` removes anything
  written into it afterwards.
- **A crashed run's siblings are swept at construction.** `sweepStaleSiblings` (atomic, non-dev
  only) removes any `<build>.kiss-staging-*` / `<build>.kiss-old-*` beside the target and logs one
  `notice` naming them. Siblings carrying **this** process's pid are skipped: those belong to a
  live instance, which is the case a second `Kiss` building the same target in one process would
  hit. The names are built (`stagingSiblings`) and matched (`sweepStaleSiblings`) in this one file
  on purpose: they are two halves of one invariant.
- **After a promotion the instance is an ordinary one.** `promote` clears `_stagingDir`, so
  `_writeRoot` is the real folder again, and re-points every stack entry's `buildDir`/`buildTo`, so
  a second build on the same instance — or a watch rebuild — writes into the promoted folder. It
  parks the staging prefix on `_promotedFrom` first, for `_finishBuild()` (`AIKB/kiss.md`).
  `stagedPath` covers the one write that does not read the write root: a `copyAssets()` the
  consumer aimed explicitly at the build folder (or a subfolder of it) is rewritten into staging,
  or the promotion would delete the files that copy had just made. A copy aimed anywhere else is
  left where it was asked for.
- `discardStaging` captures the staging path before awaiting removal, so a concurrent `close()`
  cannot redirect claim cleanup to a cleared field.
- **An unpromoted staging folder is removed by `removeStaging`, from both ends: a failed build's
  `_discardStaging()` and `close()` with nothing promoted.** It calls `fs.rm` with `maxRetries` —
  Node's own retry for the `EBUSY` / `ENOTEMPTY` / `EPERM` a Windows antivirus, indexer or pending
  delete throws for a moment — and never throws: a removal that outlasts the retries logs one
  `warn` naming the folder, saying nothing was published from it, to delete it by hand, and that
  the next `cleanBuild: 'atomic'` build sweeps leftovers at start. Before 2.6.2 both sites removed
  with `fs.remove` and a debug-only catch, and the output claims were cleared only on success; they
  are now cleared in `abandonStaging`'s `finally`. (The `ENOTEMPTY` a test hit was a different
  cause: it discarded while a render was still writing — see `AIKB/testing.md` § Gotchas.)
