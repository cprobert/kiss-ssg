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
- `stagedPath(kiss, target)` — `_stagedPath()`. It decides "inside the build folder" by
  `path.relative`, as `reportedPath` does, so on Windows a target in another case still follows
  the build into staging; until the third review (2026-11-08) it was a case-sensitive text prefix,
  and such a copy landed in the live folder, which the promotion then replaced.
  `toReportedPath(kiss, target)` —
  `_reportedPath()`, which delegates to `build-report.js`'s `reportedPath` so the report and
  the failure messages map a staged path by one rule (they were two copies, and both missed
  a `\`-joined path on Windows until 2026-11-05).
- `stagingLogger(logger, kiss)` → the logger `Kiss` keeps as `this.logger`: the site's own,
  behind a Proxy. While `_stagingDir` is set, it passes the string arguments of **`success` and
  `info` only** through `unstageText`. `unstageText(text, stagingDir, buildDir)` finds each path
  **under** the staging folder, in any of its spellings (as made, as `path.join` writes it,
  absolute), and hands the whole path to `build-report.js`'s `reportedPath`. So the log and the
  report name a file by **one rule** (`./docs/x/y.html`, with `/`). The first version swapped the
  prefix by text and kept `\`, and the second review (2026-11-08) measured the two disagreeing.
  `\` is a separator in the pattern only on Windows, as in `reportedPath`. The pattern is compiled
  once per staging folder and kept in one slot (a map gained a pattern per build, each folder
  having a new suffix), and the replacement is a function, so a `$&` in the build folder's name
  is text. After the third review (2026-11-08) a match starts only where a path can start (not
  after a word character, `.`, `~`, `-` or a separator), so the shorter relative spelling is never
  matched partway through a longer path. It needs a name character after the separator, so
  `…staging/,` in a sentence is the folder, not a file (it was rewritten to `./docs`). On Windows it
  ignores case, as `path.relative` does (a lowercase drive letter was spliced into `c:\…\./docs/x`). Every writer logs the file it wrote through
  `success`, and under staging that named the sibling (`./docs.kiss-staging-…/_redirects`,
  `sitemap.xml`; a1k9training, 2.13.3). The mapping sits at the logger so that a writer added
  later cannot bring the leak back.
  - **`warn`, `error` and `debug` are passed through untouched.** They carry diagnostics, an
    `err.stack` or a file the staging folder could not remove, whose real path is the one to act
    on. The first version mapped every method, and the code review (2026-11-08) showed it telling a
    user to delete a locked file in the live site.
  - The folder named on its own is never rewritten either: "could not remove the staging folder …,
    delete it by hand" has to name it (`test/integration/staging.test.js`).
  - **Every method runs on the site's logger, never on the Proxy.** The mapped ones are applied to it
    and the rest are bound to it, so a logger class whose methods read private fields (`this.#out`)
    still works; the first version returned them unbound. One function per method while the method is
    the same one, so `kiss.logger.warn === kiss.logger.warn` holds and a spy installed later is still
    reached. `kiss.logger` is not `config.logger`.
  - **The Proxy stands over the logger itself**, so `kiss.logger` has the logger's keys and class,
    and a spy or override defined on it (`vi.spyOn(kiss.logger, 'warn')`) is reached. A Proxy's
    `get` must return a read-only, non-configurable property as it is, so a **frozen** logger's
    methods pass through unmapped and unbound: it works, but its write lines keep the staging name.
    The third review found the first version threw on a frozen logger; the fix put the Proxy over
    an empty object, which the fourth review found lost spies, `Object.keys` and `instanceof`.
    This version keeps the common case whole and gives up the mapping only for the rare one.
  - **The pattern also matches a `./` spelling** of a folder configured without one (`docs` →
    `./docs.kiss-staging-…`), for a writer that logs `./<path>` (fourth review).
  - **Recorded, not changed:** the pattern cache is one slot, so two instances staging at once in
    one process rebuild it on alternate lines (a cost, never a wrong result); a path that mixes `\`
    and `/` on Windows is not matched.
  - **Under check and aikb the write lines name the build folder too** (`./docs/sitemap.xml`), though
    nothing is written there; the closing line says so. The operator chose this over a
    `(not written)` marker or the staging name (2026-11-08): stable, and the same as the record.
  - **Recorded, not changed:** a writer's own `error` line under staging (`Error writing
./public.kiss-staging-…/consent-banners.json`) names a folder the failed build then discards. It
    read the same way before this logger existed, and changing it was outside the branch that added
    the logger (second review, 2026-11-08).
- `renameForPromote(from, to, folder)` — `_renameForPromote()`.
- `restorePrevious`, `promote`, `swapIn`, `discardStaging`, `abandonStaging`, `removeStaging` —
  the `_`-prefixed method of the same name on `Kiss`.

## Depends on

`lib/build-report.js` (`reportedPath`, the one staged-path mapping). `fs-extra` and `node:fs/promises` as **default imports** — `test/integration/staging.test.js`,
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
