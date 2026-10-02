# Contract — split `lib/kiss.js` to the orchestrator

Branch `refactor/split-kiss-orchestrator`, session log
`planning/sessions/2026-10-02-split-kiss-orchestrator.md`. One workstream (the main session), one
module per commit. Amended in place with dated sections — never forked.

## The shape

Every extracted method becomes a plain function `name(kiss, ...args)` in a new `lib/` module. Its
body is the old method with `this.` → `kiss.`. `Kiss` keeps a thin method of the **same name**:

```js
/**
 * <original description, @param, @returns — one block>
 * @private
 */
_name(...args) {
  return name(this, ...args)
}
```

State stays on `Kiss`. No module owns a field; no module caches anything off the instance.

## Rules every moved function obeys

1. **Late binding.** A call to another `Kiss` method is `kiss._x()`, never a direct import of the
   function that implements `_x`. Tests patch or replace `_reload`, `_rebuild`, `_promote`,
   `_replay`, `_requestRebuild`, `_requestReplay` on the instance, and call `_handleChange`,
   `_runRebuildQueue`, `_discardStaging`, `_drain` and others directly.
2. **Fields are read at call time.** Tests overwrite `_pendingReplay`, `_stagingDir`,
   `_helpersReady`, `_watcher` mid-test. No destructuring of `kiss` at the top of a long-running
   function when the field is read again after an `await`.
3. **Same fs objects.** `import fs from 'fs-extra'` and `import fsp from 'node:fs/promises'` as
   default imports, and call `fs.rm` / `fs.remove` / `fs.move` / `fsp.rename` as members — tests
   spy on those objects (`staging.test.js`, `watch.test.js`, `atomic-build.test.js`).
4. **Types.** The instance parameter is `/** @param {any} kiss */` (precedent:
   `lib/site-helpers.js`). Each delegating method keeps `@private` in the **same** block as its
   description; nothing is inserted directly above `registerPartials()`'s JSDoc. `types/` is
   regenerated (`npm run types`) and committed with each module.
5. **Pure move.** A defect found while moving is recorded as an Amendment in the session log and
   left alone in that commit. Exceptions allowed in the moving commit: re-attaching a displaced
   comment to the method it documents, and renaming a local variable that would shadow a module
   import.
6. **Per module, same commit:** `test/unit/<m>.test.js`, `AIKB/<m>.md` (five headings), a
   `CLAUDE.md` table row, `AIKB/kiss.md` pointing at it.

## The five modules (in commit order)

### 1. `lib/staging.js` — the staging folder and promotion

Moves: `_sweepStaleSiblings`, `_stagedPath`, `_reportedPath`, `_renameForPromote`,
`_restorePrevious`, `_promote`, `_swapIn`, `_discardStaging`, `_abandonStaging`, `_removeStaging`;
constants `LOCKED`, `PROMOTE_RETRY_MS`.

Stays on `Kiss`: the `_writeRoot` / `_writeConfig` getters (≈20 callers), `_setupFolders` (it
assigns the folder names; it calls `kiss._sweepStaleSiblings()`), the staging branch of `close()`.

Reads: `_stagingDir`, `_buildTarget`, `_oldDir`, `_buildSettled`, `_stack`, `_outputs`, `config`,
`logger`. Writes: `_buildSettled`, `_promotedFrom`, `_stagingDir`, `_oldDir`, and every stack
entry's `page.buildDir` / `buildTo` in `_promote` (page-registry's data, mutated in place — noted,
not changed).

Calls out: none. Called by: `complete`, `close`, `_copyAssets`, `_replay`, build-finish.

Displaced comment: the explanation and empty `/** @private */` above `_recordPageFailure`
(≈1231–1234) belong to `_stagedPath` and move with it.

### 2. `lib/asset-copy.js` — the build's asset copy

Moves: `_copyAssets` (≈160 lines) as `copyAssetFolder(kiss, sourceDir, targetDir, watch)` — named
to avoid the imported `copyAssets` from `lib/assets.js`. The public `copyAssets()` stays on `Kiss`
and is unchanged.

Reads/writes: `_assetQueue`, `_defaultAssetCopy`, `_assetManifest`, `_outputs`, `_sassFailures`,
`_failures`, `_restorableAssets`, `_assetCopies`, `_promises`. Calls `kiss._stagedPath`,
`kiss._refreshReport`, `kiss._carry`. Module helpers `assetCopyKey` / `canonical` move here if
`_replay` can import them from here; otherwise they stay exported from a shared place (decided at
the commit, recorded).

### 3. `lib/page-registry.js` — page preparation and identity

Moves: `_preparePage`, `_idIndexFor`, `_lookupPage`, `_stackForRecord`, `_prepareMultiplePages`,
`_page`, the bodies of `scan()` and `viewStats()`; module functions `defaultIdForView`,
`explicitIdOf`, `isAbsoluteHttpUrl`.

Stays on `Kiss`: public `page`, `pages`, `scan`, `viewStats` with their JSDoc; the field
`_registrationDirectories` (moved up into the field block, a declaration move only); the
constructor's `lookupPage: (id) => this._lookupPage(id)` closure.

Reads: `handlebars`, `logger`, `_graph`, `_outputs`, `_stack`, `_idIndex`, `_idNoticed`,
`_replaying`, `_scanning`, `_registrations`, `_promises`, config. Writes: `_stack`, `_idIndex`,
`_idNoticed`, `_failures`, `_promises` (one caught promise per page — the `AIKB/kiss.md` rule),
`_scanned`, `_registrations`, `_registrationDirectories`, `_scanRequested`, `_scanning`,
`_debugWritten`. Calls `kiss._writeRoot`. `_page` captures `_replaying` synchronously before its
async chain — that ordering is preserved exactly.

### 4. `lib/build-finish.js` — the settled build's report, links, audit and redirects

Moves: `_finishBuild`, `_reportInputs`, `_refreshReport`, `_buildAikb`, `_checkLinks`, `_runAudit`,
`_writeRedirects`, `_lastBuildRecord`, `_redirectFindings`.

Reads: report state (`_report`, `_aikbVerdict`, `_finishedAt`, `_startedAt`, `_failures`,
`_checkMode`, `_ownsFolder`, `_debugWritten`), the writers' results (`_sitemapPath`, `_llmsPath`,
`_feedPath`, `_robotsResult`, `_pipelineResults`, `_links`, `_audit`), `_redirects*`, staging's
`_buildTarget` / `_stagingDir` / `_promotedFrom`, `_stack`, `_graph`, `_assetManifest`,
`_outputs`, config, `process.env.KISS_REPORT`. Writes: `_aikbVerdict`, `_redirectsResult`,
`_finishedAt`, `_report`, `_links`, `_audit`, `_redirects*`, `_failures`.

Calls `kiss._writeRoot`, `kiss._writeConfig`, `kiss._reportedPath`, `kiss._stackForRecord`, and its
own siblings through `kiss.` too (rule 1 — uniform, even where no test patches them). Local
variables named `path` (≈1857, 1952, 1959) are renamed.

Displaced comment: ≈1517–1530 explains `_buildAikb` but sits above `_reportInputs`; it moves to
`_buildAikb`.

### 5. `lib/rebuild.js` — the watch session

Moves: `_replay`, `_requestReplay`, `_requestRebuild`, `_runRebuildQueue`, `_rebuild`,
`_handleChange`, `_builtAssetPath`, `_reload`, and the body of `watch()`.

Stays on `Kiss`: public `watch()` with its JSDoc and default parameter; `close()`.

Reads/writes: everything `_replay` resets (≈20 fields), the queue fields `_rebuildInFlight`,
`_pendingReplay`, `_pendingTargets`, `_pendingAssets`, `_closing`, `_helpersReady`, `_watcher`,
`_devServer`. Calls back into every other group, always through `kiss.`. The closures passed to
`createWatcher` keep calling `kiss._handleChange(...)` etc., so a replaced method is seen.
`_runRebuildQueue`'s `finally` re-entry stays `kiss._runRebuildQueue()`.

## What stays in `lib/kiss.js`

Imports; the failure-carrying and `canonical` comments; public `@typedef`s; module helpers
`checkModeRequested`, `aikbRecordRequested`; the field declarations; constructor; `_setupFolders`;
`registerPartials`; `_loadHelpers`; `_pipelineEnv`; `_queuePipeline`; `copyAssets`;
`_recordPageFailure`, `_clearPageFailure`, `_carry`; `_drain`, `_generatePending`, `_settle`,
`_runCallback`, `generate`, `complete`, `report`; `sitemap`, `llms`, `robots`, `feed`;
`getModelByID`; `close`; the delegating methods; the exports (unchanged).

Estimated ≈1,800 lines; measured at the close.

## Amendment — 2026-10-02: the adversarial critique

A fresh-context agent read this contract against `lib/kiss.js` and `test/` before any code moved.
Each item below was re-checked by the main session (grep) before it was folded in. Where this
section and the text above disagree, this section wins.

**Blockers, fixed in the contract:**

- **B1 — three function names collide with their own imports.** `_checkLinks`, `_writeRedirects`
  and `_redirectFindings` call `checkLinks` (`./links.js`), `writeRedirects` and
  `redirectFindings` (`./redirects.js`). Declaring and importing one name is a SyntaxError. The
  module functions are named **`runLinkCheck`**, **`writeAliasRedirects`** and
  **`findRedirectChanges`**. kiss.js drops those imports in commit 4.
- **B2 — `aikbRecordRequested` stays but its only caller moves.** Both env readers
  (`checkModeRequested`, `aikbRecordRequested`) and `CHECK_MODE_OFF` move to **`lib/check.js`** as
  exports, beside the rest of the `kiss-ssg check` / `aikb` protocol that sets those variables.
  kiss.js and build-finish.js both import from there; no module imports kiss.js. `AIKB/kiss.md`
  and `AIKB/check.md` updated. This lands in commit 4.
- **B3 — `_name(...args)` delegators trip `tsc --checkJs` (TS8024: a `@param` with no matching
  parameter).** A delegator declares **the same named parameters as its JSDoc**, with **no
  defaults of its own**, and passes them through. The module function keeps the defaults
  (`directory = process.cwd()`, `watch = false`, `{ quiet = false } = {}`, `fresh = false`).
  Confirmed by `npm run typecheck` after the first commit.

**New rules, added to the six above:**

7. **Rule 1 covers every `Kiss` method, public or private.** `watch.test.js:1740` spies on
   `registerPartials`; `_replay` calls `registerPartials`, `scan`, `copyAssets`, `generate`,
   `sitemap`, `llms`, `feed`, `robots`, `complete` — all as `kiss.x()`. Never import `partials.js`'s
   `registerPartials` into a moved module in place of the method.
8. **Delegators are never `async`.** `_assetQueue` is reassigned in the same tick
   (`watch-failure-lifecycle.test.js:567–571`); `_promote` / `_discardStaging` set
   `_buildSettled` before their first await; `_page` reads `_replaying` synchronously.
9. **`this` returns.** A moved body that ended `return this` ends `return kiss` only where a
   delegator returns its value; the public `page`, `scan`, `viewStats` and `watch` keep their own
   `return this`, so the emitted `@returns {this}` stays true.
10. **Per-commit checks, besides `npm test` and `npm run typecheck`:**
    - `npx eslint lib/kiss.js lib/<m>.js` shows zero warnings (unused imports are `warn` only, so
      the gate would pass dead ones);
    - a code-only grep for `\bthis\b` in `lib/<m>.js` finds nothing (no lint or tsc setting catches
      a stray `this` in a module function);
    - a JSDoc type defined in kiss.js is referenced from a moved module as
      `import('./kiss.js').PageOptions` (type-only, no runtime cycle).

**Changes to the module sections:**

- §1 staging: the sibling-name construction in `_setupFolders` (≈846–855) moves to staging.js as
  `stagingSiblings(target)` → `{ stagingDir, oldDir }`, so the names and `_sweepStaleSiblings`'s
  prefix match live in one file. `_reportedPath` becomes `toReportedPath` (build-report.js already
  exports a different `reportedPath`). Also called by the constructor, via `_setupFolders`.
- §2 asset-copy: settled — `canonical`, `assetCopyKey` and the `canonical` comment (≈86–111) move
  to asset-copy.js; rebuild.js imports them from there. The duplicate first paragraph of that
  comment moves with it, still unchanged.
- §3 page-registry: also reads `verbose` (in `viewStats`).
- §4 build-finish: no `path` renames (the module does not import `node:path`); `_writeRoot` is a
  getter, read not called.
- §5 rebuild: `_replay` also writes `_replaying`, `_registrations`, `_unswept`, and reads
  `_scanned`, `_registrationDirectories`, `_scanRequested`, `_carriedFailures`, `_sassFailures`,
  `_assetCopies`, `_restorableAssets`, `_defaultAssetCopy`, `_assetManifest`, and the four
  `_*Request` fields. The module function for `_replay` is `replaySession` (a local `const replay`
  exists in `_handleChange` and `_runRebuildQueue`).

## Amendment — 2026-10-02: slim delegators (first pulse)

The full-JSDoc delegator in "The shape" cost ≈9 lines a method, projecting `kiss.js` to ≈2,100
rather than ≈1,800. Private members emit into `types/` without signatures, so the doc block only
served readers. Operator's call at the pulse: each module's delegators sit together in one block
under one header comment naming the module and its AIKB doc, each as

```js
/** @private */
_name(a, b) {
  return name(this, a, b)
}
```

The description and `@param` types live once, on the module function. B3 still holds: the
delegator names its parameters (no rest args, no defaults). Applied to staging in the same commit
as this note.

## Found, not changed

- `lib/kiss.js` ≈86–98: the first paragraph of the `canonical` comment is an older version of the
  second (99–111). Outside the moved code; left for the operator.
