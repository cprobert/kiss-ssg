# Review, round 2: `codex/protect-source-folders` at `c69c2a7` (2026-09-22)

**Reviewer:** Claude (Fable 5.1), the same session that wrote round 1 (`2026-09-22-protect-source-folders-review.md`).
**Scope:** commit `c69c2a7` ("Protect generated output ownership and restore watcher fast paths"), the corrective pass for round 1's seven findings.
**Method:** an eight-angle recall pass by a subagent, then every finding re-derived by the reviewing session against the code at `c69c2a7`. Each finding says which. None was executed as a test. Codex's claim that the three reproduction fixtures failed at the previous head before the fixes is Codex's own evidence, recorded in the session log, and was not re-run here.

**Verdict on round 1:** all seven findings are addressed in the shape agreed. The fast paths are back and gated on the manifest's hashable-URL revision rather than an extension filter. Ownership is a registry (`lib/output-registry.js`) that pages, the JSON sibling, sitemap, llms, feed, redirects and the report append all claim at write time, with a unit test and an AIKB doc, and the CLAUDE.md table row is committed. `record()` is gone with no stale reference left in `lib/`, `test/`, `AIKB/`, `llms.txt`, `README.md` or the plugin skills. The cwd diagnostic, the asset log and the junction cleanup are corrected.

The corrective pass introduced the items below. Two are worth fixing before merge (1 and 2); the rest are small. Ranked most severe first.

---

## 1. Output collisions never reach the build report

**Where:** `lib/output-registry.js:27-29`, `lib/assets.js:73-74`, `lib/build-report.js` (no `warn` anywhere; `collisions` exists only under `redirects`)
**Status:** confirmed by reading.

A collision is one deduped `logger.warn`, and warnings are not on `BuildReport`. So `report().ok` stays true, `kiss-ssg check` exits 0, `err.report` and the `KISS_REPORT` line say nothing, for:

- a static `src/assets/robots.txt` silently overwritten by `.robots()` on every build;
- a Sass entry refused by `canWriteAsset` because a page or a generated writer owns its `.css`. That entry returns `{ file, skipped: true }`, the same shape as a partial, with no `error`, so it never reaches `_failures` either. After the first refusal the warn is deduped and the author's edits reach nothing, silently.

`AIKB/assets.md` argues at length that a silently dead stylesheet is a production problem and that the Sass-versus-copied-CSS collision exists because page hashes structurally cannot catch it. The same argument applies here, and the report is where the repo puts the machine verdict. `redirects.collisions` is the existing shape: a `collisions` list on an `outputs` (or `assets`) key, advisory like the rest. A refused Sass entry should also carry a distinguishing shape (`refused: true` or an `error`), not `skipped`.

## 2. The `changed` flag on a Sass result is always true under `assets.hash`

**Where:** `lib/assets.js:97-101`, `lib/assets.js:186-187`, `AIKB/assets.md:22`
**Status:** confirmed by reading. Practical impact narrower than it looks.

`compileSass` reads `previous` from the plain `cssFile`. Under `assets.hash`, `recordEmitted` had already moved that file to its hashed name and released the plain claim on the previous copy, so the read returns null and every compile reports `changed: true`.

What actually happens: a real byte change also bumps `urlRevision` (the manifest increments it only when a hashable mapping changed, `lib/asset-manifest.js:59-66`), so `renderAssets` is true and the swap path is never consulted. The flag only decides anything when no URL changed, which is a Sass save whose compiled output is byte-identical. Then, under hash, two or more stylesheets force a full page reload for nothing, and one stylesheet "swaps" a file that did not change. The AIKB sentence "comparing the previous compiled CSS bytes with the new bytes" is false in exactly that configuration.

Fix and finding 6 together: derive `changed` from the content hash `recordEmitted` already computes, or compare against `manifest.lookup(name)`'s path rather than the plain one. Either removes the unconditional disk read as well.

## 3. "Removed stale output" is logged for files that were not removed

**Where:** `lib/kiss.js:2802-2807`, `lib/kiss.js:2966-2973`
**Status:** confirmed.

`removePrevious` now returns early when the file is unclaimed or owned by another writer. The `logger.info('Removed stale output:', file)` after it is unconditional. The comment at `lib/kiss.js:2782` shows the author already cares about this exact log line being true. Move the log inside `removePrevious`, after the `fs.remove`.

## 4. In one watch batch, the asset copy runs before the replay releases page claims

**Where:** `lib/kiss.js:3017-3040`
**Status:** confirmed by reading the queue order. Low frequency.

The batch copies assets first (pages need the manifest before they render), then runs `_replay()`, whose sweep releases the removed pages' claims. If one save-all deletes `src/pages/old.hbs` and adds `src/assets/old.html`, the copy is refused against a page that no longer exists, the warning names that page, and `public/old.html` lands only on the next asset event. A fix without reordering: after a replay in a batch that also had refused asset writes, requeue the copy, or have the sweep run before the copy as a separate step.

## 5. The precedence sentence is wrong for asset-versus-asset

**Where:** `lib/output-registry.js:23-26`
**Status:** confirmed.

`kind === 'asset' || previous.kind === 'asset'` selects "Generated output takes precedence over copied assets" even when both sides are assets (two `.copyAssets()` roots emitting `js/vendor.js`), where the truth is that the later copy wins. Message fix: three cases, not two.

## 6. Every compile reads the previous CSS from disk, one-shot builds included

**Where:** `lib/assets.js:98`
**Status:** confirmed. Minor.

N extra reads per build, and N ENOENT round-trips on a first build, for a flag only the dev watcher consumes. Folds into finding 2's fix.

## 7. `lib/output-registry.js` has no JSDoc, so its types are `any`

**Where:** `lib/output-registry.js`, `types/output-registry.d.ts`
**Status:** confirmed. Every parameter and field in the emitted declaration is `any`.

CLAUDE.md: "JSDoc is the type source, and it is checked." The consumers annotate their `outputs` dependency as `OutputRegistry`, but with `claim(file: any, owner: any, kind?: string)` a swapped or omitted argument passes the typecheck gate. Add the JSDoc, regenerate `types/`, and consider a `/** @typedef {'asset'|'generated'} OutputKind */` since the string is load-bearing.

## 8. `_discardStaging` leaves the registry's staging-path claims in place

**Where:** `lib/kiss.js:1758-1764`, `lib/kiss.js:1302`
**Status:** plausible, low. Confirmed that discard does not touch the registry and that `_promote` is the only caller of `relocate`.

A failed atomic build leaves claims on paths under a folder that no longer exists. Nothing in the repo builds again on the same instance after a failed atomic build, so this is hygiene rather than a defect today. The counterpart to `relocate` is a release-under-prefix in `_discardStaging`.

---

## Notes

- Findings 1 and 2 are the two to take before merge. Finding 1 is the round-1 "warning is not enough" point in a new place: a registry stopped the deletion, and the warning explains it, but the verdict still cannot see it.
- Findings 2 and 6 are one fix. Findings 3, 5 and 7 are each a few lines.
- The example-4 dev-mode eyeball from the pulse log is now done by the reviewing session in a headless browser; see the addendum below. The pulse log's entry can be closed against it.
- The working-tree `CLAUDE.md` diff is now only the bench block, which points at the untracked `.claude/skills/bench/SKILL.md`. Still the operator's, still to be committed together.
- The two review files under `planning/reviews/` are untracked. They should be committed on this branch before `/branch-close` runs, or the sweep will not see them.

---

# Addendum (2026-09-22): browser verification, and the round-2 plan

## Browser verification of example 4 in dev mode

Run by the reviewing session with Python Playwright 1.58 driving headless Chromium 145 against `examples/4-layouts-and-partials` started as `node router.js --dev` at `c69c2a7`. Every edited file was restored byte-for-byte and `git status` on the example is clean. The script is in the session scratchpad as `eg4_browser_check.py`; it is not part of the repo.

This closes the pulse log's outstanding eyeball. Timings are from the file write to the browser showing the result, measured in one run.

| Check                               | Result                                                                                 | Measured                |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ----------------------- |
| Footer partial cleared (empty save) | preview shows no footer                                                                | 383 ms, one page reload |
| Footer partial restored             | preview shows the footer again                                                         | 112 ms, one page reload |
| Sass entry edit, hash off           | new rule applied, stylesheet swapped in place, `window` state survived, no page reload | 66 ms                   |
| Sass entry restored                 | reverted, in place                                                                     | 81 ms                   |
| Page edit                           | sentinel shown after one reload                                                        | 158 ms                  |
| Page restore                        | sentinel gone after one reload                                                         | 153 ms                  |
| Browser console                     | empty                                                                                  |                         |

So both round-1 fast paths are observable in a real browser: a non-partial Sass edit is a stylesheet swap, and page state survives it.

**One observation, measured, not attributable to this branch.** A save made immediately after a livereload page reload is served by kiss but never reaches the browser. The probe: after a reload landed, the new page's livereload socket was not yet open at DOM-ready; a second edit written at that moment was rebuilt and served (confirmed over HTTP) and its refresh broadcast had no recipient; the socket opened about 200 ms later; the next save then landed normally. The livereload protocol has no replay, so a refresh broadcast during that window is simply lost. This is the shape of the upstream mechanism rather than a regression here (inferred: `_reload` and `lr.refresh` predate the branch, and I did not run the probe against `main`). A human clearing and restoring a partial does not hit it. Worth a paragraph in `AIKB/upstream.md` with this probe as the way to re-check, per the "documented, not engineered around" rule, not a mechanism.

## The round-2 plan

Codex proposes taking all eight in one bounded pass, combining 2 and 6. Agreed on every row, with these notes:

- **1.** Agreed, including the policy distinction: a `collisions` list on the report is advisory like `links` and `redirects`, and putting it there does not make `check` exit nonzero. Represent a refused Sass entry distinctly from a skipped partial.
- **2 + 6.** Agreed: compare retained fingerprints, hashed outputs included, so a byte-identical save triggers neither a swap nor a reload.
- **4.** Agreed, and Codex is right to move it to before-merge on the grounds that save-all is ordinary usage. Retry refused asset writes after the replay releases ownership, one refresh after everything settles.
- **3 + 5, 7, 8.** Agreed as stated. For 7, whatever the set of kinds is (`asset`, `generated`, `page`), make it a `@typedef` so a wrong string fails the typecheck gate.
- **Tests.** Agreed on the four boundaries: no-op hashed save, combined save-all, report visibility, discarded staging. Each must be seen red against `c69c2a7` before its fix lands.
- **Housekeeping.** Both review files under `planning/reviews/` go in with this pass. The bench working-tree edits stay untouched.
