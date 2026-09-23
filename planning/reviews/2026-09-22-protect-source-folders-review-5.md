# Review, round 5: `codex/protect-source-folders` at `321693c` (2026-09-23)

**Reviewer:** Claude (Fable 5.1), the same session as rounds 1 to 4.
**Scope:** commit `321693c` ("Restore build performance and asset ownership handoffs"), Codex's corrective pass for round 4, reviewed at high effort.
**Method:** a recall pass by a subagent, then every finding re-derived by the reviewing session against the code at `321693c`. Codex's own claims for the commit were re-run here rather than taken from its summary.

## Verification of Codex's claims, executed here

| Claim                   | Result                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests pass              | `npm test`: 71 files, 1669 passed, 0 failed (Codex's 1,667 plus two that are platform-skipped elsewhere)                                                                                                  |
| Performance restored    | bench against the same main baseline as round 4: scan @ 2000 build +0.3%, fanout @ 2000 build −5%, scan @ 500 +4%, fanout @ 500 +16% (min run +7%; noise-level at this size, and no scaling term remains) |
| Fleet unaffected        | four-site harness: a1k9training 20, pro-plumbing 7, swan-love 11, metacarpus 0 pages, every pairwise diff unchanged, registry copies restored, git clean                                                  |
| Watch fast paths intact | example-4 browser check: all thirteen steps pass, Sass swap in place with page state kept                                                                                                                 |

Round 4's merge blocker is closed by measurement.

## Findings

Ten came back from the subagent. One is confirmed and worth fixing (1). One did not survive re-derivation (2). The rest are small or design notes.

### 1. The link recheck after an asset restore is a no-op

**Where:** `lib/kiss.js:3063` (`if (restore.size) await this._checkLinks()`), `lib/kiss.js:1566-1568` (`_checkLinks` returns the cached `this._links`, and `null` under `config.dev`), `lib/kiss.js:2534` (set by `complete()` earlier in the same replay)
**Status:** confirmed by reading.

`_replay` clears `_links` in its reset block, `complete()` recomputes and caches it, then the sweep restores an asset and calls `_checkLinks()` again, which returns the cached verdict. So a link to a file that the restore just put back is still reported broken, and under dev the call returns `null` regardless. One line: clear `_links` before the recheck. The trailing `_refreshReport()` already picks the new result up.

### 2. Not confirmed: "a copy that errored returns before `_restorableAssets` is updated"

**Where:** `lib/kiss.js:1100` (`if (!source || !result.sass) return result`), `lib/assets.js:289-332`
**Status:** the premise does not hold. `copyAssets` compiles Sass before its `try`, so the error return at line 332 carries `sass`, and the wrapper does not return early on a copy error; the restore entry is set or deleted as usual. The early return fires only for a copy with no source or target, which has nothing to restore. If a failure could ever precede compilation, the previous entry stays in the map rather than being dropped, so restoration would still find it.

### 3. Watch, replay and restore copies log absolute paths and get a different id from the constructor copy

**Where:** `lib/kiss.js:665-670` (`_defaultAssetCopy` stores resolved paths), `lib/kiss.js:736` (the constructor passes the configured strings), `lib/kiss.js:2946-2948,3056,3112` (the others pass the resolved ones), `lib/kiss.js:1095` (`display` is whatever was passed)
**Status:** confirmed by reading.

The first build logs `Copied assets: ./src/assets to ./public`; a replay logs the absolute spelling, and because the copy's `id` is a hash of the shown pair, the replay's result carries a different id. The comment above the `display` line says this must not happen. Keep the configured strings on `_defaultAssetCopy` and pass them as `display`.

### 4. `_restorableAssets` and the registry's producer records grow for a copy that never runs again

**Where:** `lib/kiss.js:1171-1176`, `lib/output-registry.js:113-117` (`hasProducer` scans every record)
**Status:** confirmed by reading. Low.

Every `(source, target)` pair that ever wrote anything keeps an entry, and its producer records stay alive because nothing releases an owner that never copies again. A long-lived process copying into a new folder per run (a per-cohort export) accumulates one entry and one set of records per run. The comment a few lines below explains that `_assetCopies` was pruned for exactly this reason. Prune when the owner's last producer record goes, or release an owner's records when its target is no longer under the build folder.

### 5. Two maps describe one copy

**Where:** `lib/kiss.js:491` (`_restorableAssets`, keyed by owner, pruned on producer absence), `lib/kiss.js:1128` (`_assetCopies`, keyed by canonical key, pruned on success)
**Status:** design note. The replay reads one at `2974` and the other at `3056`. A single registration per copy keyed by owner, carrying its failure set, would replace both and the `hasProducer` scan. Codex has already deferred the registry refactor; this belongs in that same pass.

### 6. Restoring one shadowed asset can copy the whole asset root a third time in a batch

**Where:** `lib/kiss.js:3054-3057`
**Status:** confirmed by reading. Low; the trigger is deleting a page that shadowed an asset, which is rare, and the cost is one extra copy.

The restore re-runs the affected copy in full. In a batch that also carried an asset event and a pipeline replay, that copy already ran once or twice. Skip the restore for an owner whose copy already ran in this batch, or restore only the released files.

### 7. Three anchors for one watched path

**Where:** `lib/watcher.js:146` (chokidar watches the raw configured folder and emits relative paths), `lib/kiss.js:3207` (`_handleChange` resolves against the cwd at event time), `lib/kiss.js:3412-3414` (`_builtAssetPath` now resolves against the constructor cwd)
**Status:** confirmed by reading. Only a `chdir` between construction and `watch()` exposes it, and the new test passes an absolute path so the relative case is unexercised. Resolve the watched folders once, in `Kiss` before `createWatcher`, so every consumer sees one form.

### 8. `real()` is three nested `reportedPath` calls

**Where:** `lib/build-report.js:229-240`
**Status:** confirmed. A reduce over `[stagingDir, resolvedStaging, resolvedBuild]` says it once. No behaviour change today.

### 9. `assetOwners` and `hasProducer` have no unit test

**Where:** `lib/output-registry.js:106-117`; `test/unit/output-registry.test.js` has no reference to either
**Status:** confirmed by grep. Restoration depends on `release()` keeping a record whose remaining producers are all assets, and only the integration tests exercise that ordering. A unit test pinning "after the page producer is released, `assetOwners` still names the asset" protects the plausible tidy-up that would break it.

### 10. The working-tree `CLAUDE.md` edit and the untracked bench skill

Operator's, unchanged. Noted for the sweep.

## Notes for the pass

- Finding 1 is one line plus a test: a replay that restores an asset reports its link as not broken.
- Findings 3, 6, 7, 8 and 9 are each a few lines. 4 and 5 belong with the deferred registry refactor Codex already named.
- Finding 2 should not be acted on; it is recorded so the subagent's version does not resurface.
- Nothing here changes the fleet or the browser result, which were re-run at this head.
