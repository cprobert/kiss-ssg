# Review, round 3: `codex/protect-source-folders` at `6d24494`, whole branch (2026-09-22)

**Reviewer:** Claude (Fable 5.1), the same session as rounds 1 and 2.
**Scope:** `git diff main...HEAD`, the whole branch, at extra-high effort: `lib/config.js`, `lib/output-registry.js`, `lib/kiss.js`, `lib/assets.js`, `lib/asset-manifest.js`, `lib/watcher.js`, `lib/kiss-page.js`, `lib/build-report.js`, docs.
**Method:** a broad recall pass by a subagent, then every finding re-derived by the reviewing session against the code at `6d24494`. None was executed as a test. Where a finding turned out to differ from the subagent's version, this file carries the corrected version.

**Context from the fleet check** (`2026-09-22-fleet-check-protect-source-folders.md`): four real sites build identically on registry 2.5.0, main and this branch. None of the findings below could have appeared there. They are all watch-mode behaviour or report shape, and the fleet check ran one-shot `check` builds.

Three are worth fixing before merge (1 to 3). The rest are small. Ranked most severe first.

---

## 1. Under `assets.hash`, a Sass compile error in a watch session deletes the last-good stylesheet and breaks every page

**Where:** `lib/assets.js:165-171` (the `fs.stat(plain)` skip), `lib/assets.js:217-226` (the reconcile unlink), `lib/asset-manifest.js:66-88`, `lib/kiss.js:3033-3037`, `lib/handlebars-helpers.js:258-270`
**Status:** confirmed by reading. A regression against main, which never unlinked and never dropped a mapping for a file it did not emit.

The chain: the author saves a syntax error in `main.scss`. `compileSass` writes nothing and returns `{ error }`. `copyAssets` runs `recordEmitted` regardless. Under hash, the previous copy had already moved `main.css` to `main.<hash>.css`, so the stat of the plain path finds nothing and the entry is skipped. `main.css` is therefore absent from `current`; `reconcile` deletes its mapping, bumps `urlRevision`, and returns the hashed file as stale; the asset owner owns it, so it is unlinked. Back in the rebuild queue, `renderAssets` is true because a hashable mapping changed, so every page re-renders. Each page's `{{asset "main.css"}}` now finds no mapping, and on this branch that is a render failure rather than a warning (the helper was made strict in the same range). Result: one typo in a stylesheet fails every page of the preview until it is fixed, and the last-good CSS is gone from disk. With hash off the plain file is still there from the previous compile, so the stat succeeds and nothing is lost. The asymmetry is the tell.

**Fix:** when a Sass entry's compile failed this pass, carry its previous mapping forward in `current` instead of dropping it, so the last-good file and URL survive the error the way they do with hash off. The `sass` results already say which entries errored.

## 2. Registry collisions are never reset, so a watch session's report accumulates stale and false collisions

**Where:** `lib/output-registry.js:19,38-46` (the `collisions` map only grows), `lib/kiss.js:2826-2845` (`_replay` resets every other report input), `lib/kiss.js:1443` (`snapshot()` hands the whole map to every report)
**Status:** confirmed by reading.

`_replay()` says "the rebuild is its own build: it gets its own report" and resets `_report`, `_idNoticed`, `_sitemapPath` and the rest. It does not touch `_outputs.collisions` or `_outputs.warned`. Two consequences. A collision fixed by the author (the static file deleted) stays in `report().outputs.collisions` for the life of the session. And a replay can manufacture one: rename `a.hbs` to `b.hbs` with the same slug. The re-render claims `public/x.html` as `page: b.hbs` while `page: a.hbs` still holds the claim (the orphan sweep runs after the render, `lib/kiss.js:2975`), so `collision()` records both producers and warns, though the two pages never coexisted.

**Fix:** clear the collision map at the start of `_replay()` beside `_report = null`, or take the snapshot per build. Decide separately whether `warned` should also reset; a collision that persists across rebuilds arguably deserves one warning per session, but then the report must be the place it stays visible.

## 3. A collision's `file` is an absolute, machine-specific path, unlike every other path on the report

**Where:** `lib/output-registry.js:39` (`path.resolve(file)`), `lib/build-report.js:152-158` (`reportedPath` maps only a staging prefix), `lib/build-report.js:338-346`
**Status:** confirmed by reading.

`pages[].buildTo`, `sitemap`, `feed`, `robots.file` and `redirects.files` all carry the configured spelling (`./public/robots.txt`). A collision's `file` is resolved absolute at record time and mapped back only when a staging prefix matches. So under `check` it reads `./public/robots.txt`; under `cleanBuild: true` there is no staging and it stays `C:/Users/<name>/.../public/robots.txt`; under `'atomic'`, `relocate()` rewrites it under the resolved target before the report is built, so the staging prefix no longer matches and it stays absolute. `kiss-ssg aikb` then commits that absolute path into `AIKB/last-build.json`, which differs per machine and per checkout path.

**Fix:** record the path as the claimant wrote it (the page claims `this.buildTo`, the writers claim their configured paths) and key the map on the resolved form only, or extend `reportedPath` to map the resolved build dir as well as the staging dir.

## 4. Any refused asset write makes every replay batch copy assets twice, for the life of the session

**Where:** `lib/kiss.js:3035`, `lib/kiss.js:3066-3076`
**Status:** confirmed by reading. Bounded to sites with a standing collision.

`retryAssets` is `!!result.refused?.length`, which does not distinguish a refusal the replay can release (a deleted page's claim) from a permanent one (a generated writer's). A site with `.robots()` and a static `src/assets/robots.txt`, the documented collision, refuses that copy on every pass. Any watch batch holding both a replay and an asset event then runs the full copy, every Sass compile included, twice, and the second is refused again. On a Sass-heavy site that is a second compile per batch.

**Fix:** retry only when a refused path's claim was actually released by the replay (the sweep knows which owners it released), or release removed pages' claims before the first copy so the retry is unnecessary. The retry exists because the batch order is copy, replay, copy, when it is the replay's sweep that frees the paths.

## 5. `_discardStaging` reads `_stagingDir` after the await, and `close()` can null it in between

**Where:** `lib/kiss.js:1762-1768`, `lib/kiss.js:3390-3394`, compare `lib/kiss.js:1255` where `_promote` captures a local first
**Status:** confirmed by reading. Needs `close()` to overlap a failing atomic `complete()`.

`.then(() => this._outputs.clearUnder(this._stagingDir))` runs after `fs.remove` resolves. If `close()` ran meanwhile it has set `_stagingDir = null`, so `clearUnder(null)` throws inside `path.resolve`, the `.catch` logs it at debug, and the staging claims are never cleared. One line: capture `const staging = this._stagingDir` before the await.

## 6. A pending empty `add` followed by `unlink` forwards a bare `unlink` for a file kiss never saw

**Where:** `lib/watcher.js:89-104`
**Status:** confirmed by reading.

`settled()` upgrades a pending empty `add` only when the follow-up is `change`. When it is `unlink` (an editor's cancelled new file, a swap file created empty and removed), the timer is cleared and the `unlink` is delivered. For a page path that is a whole-site replay for a file kiss never registered. Drop the `unlink` when the cancelled pending event was an `add`, since nothing was ever delivered for the path.

## 7. The registry resolves a relative path against the cwd at every call

**Where:** `lib/output-registry.js:25-28`, `lib/kiss-page.js:246` (claims `this.buildTo`, the configured spelling)
**Status:** confirmed by reading; the failure needs a `chdir` between claim and query.

Page claims and sweep queries both pass the relative `buildTo`, resolved at call time. The codebase already treats a mid-run `chdir` as real: `copyAssets` resolves at registration for exactly this reason (`lib/kiss.js` says a relative path "must not be re-resolved against whatever the working directory is when the queue drains"). The registry does the opposite. A script that builds two sites on one instance and changes directory between them would have its orphan sweep miss the first site's outputs and its asset refusal pass. Resolve once at registration, the way the copy does.

## 8. `containsFolder` in config is a copy of `isInside` in the watcher

**Where:** `lib/config.js:424-432`, `lib/watcher.js:25-35`; `lib/kiss.js:45` already imports `isInside`
**Status:** confirmed. Same predicate, same Windows-case comment, added on the same branch. Hoist to `lib/utils.js` and import from all three.

## 9. The `previousOwners` snapshot in `_replay` is equivalent to a kind check at sweep time

**Where:** `lib/kiss.js:2796-2817`
**Status:** confirmed by reasoning through the cases. A file re-claimed by any page is in `current` and skipped first; one taken over by a non-page writer is skipped by either test; one never claimed is skipped by either. `if (this._outputs.kind(file) !== 'page') return` gives the same outcome without the 2×N map and without a third spelling of the `.json` sibling rule.

## 10. Watch-mode asset copies keep pushing onto `_promises`, which only a replay prunes

**Where:** `lib/kiss.js:1164`, `lib/kiss.js:3031`
**Status:** confirmed by reading; pre-existing on main (the asset event there also called `copyAssets`), doubled here by the retry. An asset-only session grows the list by one or two settled promises per save and awaits all of them on every event. Track the watch copy on `_generating` or a dedicated promise rather than the build's registration list.

## 11. `AIKB/watcher.md` is one watcher out of date and one sentence short

**Where:** `AIKB/watcher.md:38` ("All three watchers"; there are four: entry, sources, helpers, assets), `AIKB/watcher.md:45` (helpers bullet)
**Status:** confirmed. The helpers bullet says the empty-file guard means "a truncate-then-write save does not reload from an empty file", which is true, but does not say what the new bullet at line 42 says: a file still empty after 200 ms is forwarded. Read alone, the helpers bullet suggests an empty `helpers/index.js` is never delivered. It is, and it unregisters every helper. One clause fixes it.

## 12. The working-tree `CLAUDE.md` edit still points at the untracked bench skill

Operator's, unchanged since round 2, noted so the sweep sees it.

---

## Notes for the pass

- Findings 1 to 3 are the merge blockers. 1 is a real dev-loop regression against main; 2 and 3 make the new `outputs.collisions` key wrong in the two places it will be read, a watch session's report and a committed `last-build.json`.
- Regression tests worth having, each seen red first: a hashed watch session with a Sass syntax error keeps the previous stylesheet and mapping (1); a replay after a page rename reports no collision, and a collision fixed by deleting the file leaves the next report (2); a `cleanBuild: true` build's collision `file` equals the configured spelling (3).
- 4 to 10 are each a few lines. 11 is a doc edit.

---

# Addendum (2026-09-22): the round-3 plan

Codex proposes fixing 1 to 3 before merge, with two refinements, and taking the rest in the same pass after failing transition tests are in place. Agreed on every row. Notes:

- **2, the refinement is right and my proposed fix was wrong.** Clearing the collision map at replay would not stop the rename false positive, because the previous build's page claims are still live when the new page writes over them; and it would hide a standing asset-versus-generated collision, because a successful copy is not re-run on replay (`_assetCopies` prunes it), so nothing would re-observe it. The lifecycle that settles both: a claim is live while its producer is registered in the current build. Page claims belong to the build that made them, so at replay start they become previous-generation; a new page claim over a previous-generation page claim is a takeover, not a collision; the orphan sweep releases the previous-generation page claims nobody took over. Asset and generated claims stay live across replays because their registrations do. A collision record exists while both producers' claims are live and is dropped when either is released. That one model also answers 4 (retry a refused copy only when the claim that refused it was released), 9 (the sweep is "release previous-generation page claims not in `current`"), and the `warned` question (warn once per collision record's lifetime).
- **3.** Agreed: map at the report boundary, both the staging prefix and the resolved build dir, and keep absolute registry keys. Test plain, atomic and check.
- **1.** Agreed, including the genuine-deletion test: a removed `.scss` source must still lose its `.css`, or the fix over-preserves.
- **7.** Agreed: anchor at registration, never at construction. `copyAssets` already resolves at registration and is the pattern.
- **Order.** Transition tests first, seen red at `6d24494`: collision present then fixed; page renamed; Sass valid, invalid, recovered; repeated asset saves not growing `_promises`; collision `file` spelling under the three build modes.
- Codex's correction of its own "all eight addressed" is noted and appreciated; the fleet check could not have caught any of these, so this round is the first evidence on the collision lifecycle.

---

# Verification of `ec94a9f` (2026-09-22, reviewing session)

Codex's corrective pass for this round landed as `ec94a9f` ("Fix watch ownership lifecycle and preserve last-good Sass"). Re-derived here rather than taken from the summary:

- **Code, by reading.** A failed Sass entry now carries its previous mapping and file forward through `manifest.previous` and `retain` (finding 1). Page claims become previous-generation at `beginPages()`; a takeover by a new page is not a producer, and a collision record is deleted when it loses its last producer (finding 2). A collision's reported `file` is mapped through both the staging prefix and the resolved build dir (finding 3), and `test/integration/watch.test.js` pins the spelling under plain, atomic and check. `retryAssets` is gone; the retry keys off ownership (4). `_discardStaging` captures the staging path before the await (5). A pending empty `add` followed by `unlink` is dropped (6). `isInside` lives in `lib/utils.js` and is imported by config, watcher and kiss (8). The sweep is the kind check (9). Watch copies no longer push onto `_promises` (10). `AIKB/watcher.md` updated (11).
- **Tests, executed here:** `npm test` at `ec94a9f`: 71 files, 1661 passed, 0 failed (Codex's 1,659 plus two that are platform-skipped elsewhere). Nine new "round three" transition tests cover the Sass fail/recover/delete path, standing and resolved collisions, the page rename, repeated copies, chdir anchoring, the discard race, the refused-copy retry and the cancelled empty add. That they were red at `6d24494` first is Codex's claim, recorded in the session log's round-three amendment; not re-run here.
- **Fleet, executed here:** the four-site harness re-run against `ec94a9f`. a1k9training 20, pro-plumbing 7, swan-love 11 pages: every pairwise diff `= N unchanged`, exit 0 on all three engines, no branch-only stderr lines, registry copies restored, git clean. metacarpus: 0 pages on all three engines for the known data reason, identical; its tracked Tailwind output restored again.
- **Browser, executed here:** the example-4 Playwright check at `ec94a9f`: all thirteen checks pass, including the in-place Sass stylesheet swap with page state preserved, so the last-good preservation did not cost the fast path.

Nothing outstanding from round three. Not verified: the round-three transition tests being red at the previous head, and dev mode on a real site.
