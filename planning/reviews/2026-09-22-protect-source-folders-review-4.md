# Review, round 4: `codex/protect-source-folders` at `ec94a9f`, whole branch (2026-09-22)

**Reviewer:** Claude (Fable 5.1), the same session as rounds 1 to 3.
**Scope:** `git diff main...HEAD` at extra-high effort, after the round-three corrective commit.
**Method:** a broad recall pass by a subagent, then every finding re-derived by the reviewing session against the code at `ec94a9f`. One finding was measured with the bench harness and an isolated experiment; the rest are by reading. Where the subagent's version was wrong in detail, this file carries the corrected version.

One finding is a merge blocker and it is a measured performance regression. Three are watch-lifecycle gaps of the kind round three fixed. The rest are small.

---

## 1. Build time doubles at 2000 pages: the duplicate-output check resolves a path per comparison

**Where:** `lib/kiss.js:1827-1830`, `lib/kiss-page.js:159-161` (`get outputPath()` is `path.resolve(this._directory, this.buildTo)`), `lib/kiss-page.js:153` (`buildTo` is itself a getter)
**Status:** measured. `npm run bench`, scan and fanout, 3 runs, median, this machine, main worktree at `bf6878d` as the baseline.

| scenario      | phase | main    | branch `ec94a9f` | branch, getter memoised in a scratch worktree |
| ------------- | ----- | ------- | ---------------- | --------------------------------------------- |
| scan @ 500    | build | 503 ms  | 644 ms (+28%)    |                                               |
| scan @ 2000   | build | 2636 ms | 5276 ms (+100%)  | 2810 ms (+7%)                                 |
| fanout @ 2000 | build | 1851 ms | 4415 ms (+138%)  | 1917 ms (+4%)                                 |

The subagent named the mechanism correctly but the wrong phase. `_preparePage` runs when the registration promises drain, which the bench counts as build, not register. Main compared `entry.buildTo === buildTo`, two cached strings. The branch compares `entry.page.outputPath === preparedPage.outputPath`, and both sides are getters: each call runs `path.resolve` and the `buildTo` getter, which rebuilds the page URL. The right-hand side is re-evaluated on every iteration. At 2000 pages that is two million comparisons and four million resolves. The scratch experiment replaced the getter with a first-access cache and hoisted the right-hand side; the residual 4 to 7% is unattributed and small enough to be the per-page registry claim or noise.

**Fix:** cache the resolved output path per page and invalidate it when `buildDir` changes. `buildDir` is a plain field today, assigned by `_promote`, so either add a setter that clears the cache, or compute the path in `prepare()` and again in `_promote`'s loop. Hoist `preparedPage.outputPath` out of the `some`. Record a bench before and after under `planning/benchmarks/` per the bench skill, since no unit test pins this.

The fleet check did not see it: the four sites are 7 to 20 pages, where the cost is microseconds. diploma-msc at 686 pages would pay about a third of a second per build; a 5000-page site about fifteen seconds.

## 2. A failing page in a replay skips the refused-asset retry and the report refresh

**Where:** `lib/kiss.js:3098-3118`, `_replay` at `lib/kiss.js:2817` (awaits `this.complete()` inside `try … finally`, so a rejection propagates)
**Status:** confirmed by reading.

In `_runRebuildQueue`, `await this._replay()` is followed by the retry copy and `_refreshReport()`. `complete()` rejects when any page fails, `_replay` rethrows it, and the async block jumps to the `.catch` that logs "Error rebuilding site". So a save-all batch that deletes a page and adds a static file at its path, while any other page has a template error, leaves the file absent until the next unrelated asset event. Wrap the replay so the retry and refresh still run, or move them into a `finally`.

## 3. Deleting a page that shadowed an asset leaves neither file, and the manifest still maps the asset

**Where:** `lib/kiss.js:2843-2860` (the sweep), `lib/kiss.js:1152-1160` (a successful copy is not re-run on replay)
**Status:** confirmed by reasoning through the lifecycle.

Build one: `src/assets/about.html` is copied, then page `about.hbs` writes the same path and wins. The author deletes the page. The replay batch has no asset event, the sweep unlinks the page's bytes and releases the claim, and nothing re-copies the asset because successful copies are pruned from replay and the retry is gated on a refusal in the same batch. The collision record keeps the asset as its remaining producer, so the registry knows. Fix at the sweep: when a released page claim's record still has an asset producer, re-run that copy (or mark it for the replay).

## 4. One dangling symlink in `src/assets` fails the whole copy

**Where:** `lib/assets.js:170`
**Status:** confirmed. `if (!(await fs.stat(file)).isFile()) continue` has no catch, where the pre-branch stat had `.catch(() => null)`. A symlink whose target is gone, or a file removed between the glob and the stat under watch, rejects `recordEmitted`; `copyAssets` returns `{ error }`, the manifest is not reconciled, and every asset save fails the same way until the link is removed. Catch and skip.

## 5. The asset copy resolves its paths against the cwd at call time; the page anchoring in round three did not reach it

**Where:** `lib/kiss.js:1044-1046` (`path.resolve(sourceDir)`, `path.resolve(targetDir)`), `lib/kiss.js:1077` (owner built from them), `lib/assets.js:275-277` (the default owner uses the staged target instead)
**Status:** confirmed by reading.

Round three anchored page paths to the registration directory. The watch re-copy still resolves the configured folders against `process.cwd()` at event time, so a `chdir` after construction changes the owner string, the manifest treats it as a first copy, and every previous claim reads as a different asset copy. Separately, the default owner in `lib/assets.js` keys on the staged target while `lib/kiss.js` keys on the requested one; only external callers hit it, but it is the same identity spelled twice. Resolve against `_directory` and export one `assetCopyOwner(source, target)` beside `assetCopyKey`.

## 6. The registry keeps a "collision" record for every output, not only for collisions

**Where:** `lib/output-registry.js:36-46` (the early return on a single producer is gone), `beginPages` and `retain` iterate the whole map
**Status:** confirmed by reading. Cost is modest: the bench residual above bounds it at a few percent. The smell is the name: a map called `collisions` that holds one entry per output, filtered down in `snapshot()`. This shape is what makes finding 3's "the asset is still a producer" knowable, so it is a deliberate lifecycle choice; if it stays, rename it (`producers`) and say in the doc that single-producer entries are the normal case.

## 7. An inline-template page's owner id is the whole template

**Where:** `lib/kiss-page.js:246,273` (`page: ${this.view}`)
**Status:** confirmed. A collision warning, the report line and `outputs.collisions[].producers[].owner` in a committed `last-build.json` carry the template body. `reportedView()` in `lib/build-report.js` exists for this elision; use it for the id.

## 8. Three duplications a single primitive would remove

**Status:** confirmed by reading, all low.

- `lib/kiss.js:3074-3079` rebuilds refused output paths with `path.resolve(folders.build, file.replace(…))` from two differently shaped lists, when `recordEmitted` already holds `attempted` with the real paths. Return them.
- `lib/build-report.js:338-346` maps a collision path through `reportedPath` twice with inline separator fixes, beside the `real()` closure every other field uses. Teach `real()` the resolved build dir, or record the path relative to the write root.
- `lib/output-registry.js:118-147` `release()` reasons about `warned` by parsing JSON tuples, and `beginPages()` deletes then re-sets the same `files` entry. A `retired` flag on the claim makes `beginPages` a flag flip.

## 9. `isInside` moved to `lib/utils.js` but its test and a re-export stayed in the watcher

**Where:** `lib/watcher.js:6` (`export { isInside } from './utils.js'`), `test/unit/watcher.test.js:403`
**Status:** confirmed. Move the `describe('isInside')` block to `test/unit/utils.test.js` and drop the re-export; `/corpse-collector` will flag it otherwise.

## 10. Registry keys fold case on Windows only

**Where:** `lib/output-registry.js:27`
**Status:** confirmed by reading. On a default case-insensitive macOS volume, `About.html` and `about.html` are two owners, so the asset guard does not fire and the sweep can unlink the other producer's bytes. The subagent said README claims case coverage "without qualification"; that sentence (README line 192) is about the folder-safety guard, which uses `realpath`, and `llms.txt` says "Windows case differences". So the docs are not wrong, but the registry gap is real for macOS. Fold on `darwin` too, or say the platform in the AIKB doc. Low for this fleet, which builds on Windows and Linux.

## 11. The batch order is why the retry exists

**Where:** `lib/kiss.js:3068-3118`
**Status:** design note, not a defect. The copy runs before the replay so pages render against the current manifest, which hashed URLs need. That is why a deleted page's claim blocks the copy and a retry is needed after the sweep. Retiring page claims before the copy when a replay is pending (calling `beginPages()` at the top of the batch) would let one copy see the retired claims without reordering the render. Codex's call; it interacts with findings 2 and 3.

## 12. The working-tree `CLAUDE.md` edit still points at the untracked bench skill

Operator's, unchanged since round 2. This round's bench numbers were produced by following that skill, so it is worth committing together with the pointer.

---

## Notes for the pass

- Finding 1 is the merge blocker and is a few lines. The bench records (`bench-main.json`, `bench-branch.json`) are in the session scratchpad; the numbers above are the medians.
- Findings 2 and 3 are the same class as round three: the lifecycle is right in the common path and wrong in a transition. Tests, seen red first: a replay with a failing page still retries a refused copy; deleting a page that shadowed an asset restores the asset.
- Finding 4 is one `.catch`. Findings 5, 7 and 9 are a few lines each. 6, 8, 10 and 11 are judgement calls that can wait for the lifecycle to settle.
