# Review, round 6: `codex/protect-source-folders` at `e01c6c5` (2026-09-23)

**Reviewer:** Claude (Fable 5.1), the same session as rounds 1 to 5.
**Scope:** commit `e01c6c5` ("Refresh link findings after replay asset restoration"): three lines in `_replay()`'s closing block, two tests, one doc bullet. Reviewed at high effort.
**Method:** a recall pass by a subagent, then every finding re-derived by the reviewing session against the code at `e01c6c5`. Codex's "regression observed failing before the fix" is its own claim, recorded in the session log, not re-run here. The full suite was run here: 71 files, 1671 passed, 0 failed. The fleet and browser checks were not re-run; the change is confined to a replay's link recheck, which one-shot builds never reach and dev mode short-circuits.

Seven findings came back. One is the round-5 fix generalised and is worth doing (1). One is a pre-existing latch worth knowing about (3). The rest are small.

### 1. The link verdict goes stale on every replay that removes a page, not only when an asset is restored

**Where:** `lib/kiss.js:2534` (`complete()` scans links), `lib/kiss.js:3041-3050` (the orphan sweep runs afterwards, in the `finally`), `lib/kiss.js:3062-3065` (the rescan is gated on `restore.size`), `lib/links.js:246,319` (references resolve with `fs.existsSync`)
**Status:** confirmed by reading. Pre-existing: `main` had the same order. The round-5 fix is the special case of a general gap.

Under a non-dev `.watch()` with `links.check`, the replay's `complete()` scans links while the previous build's outputs are still on disk, so a link to a page the author just deleted resolves. The sweep then unlinks that file, and nothing rescans unless an asset was restored. The report says no broken links for a site now serving a 404. The general fix is to rescan after the sweep and restoration on every replay in that configuration, which subsumes the `restore.size` case. `.watch()` is not gated on `dev`, so the configuration is reachable.

### 2. The rescan re-emits the link log lines

**Where:** `lib/kiss.js:1590-1600`, `lib/kiss.js:3064`
**Status:** confirmed. One replay can print a `broken link:` notice and then `Links: … none broken`, or the `Links:` line twice. The `_checkLinks` comment promises the log and the report say the same thing. Log from the final scan only, or have the rescan run quietly.

### 3. After one failed atomic build, a non-dev watch session writes into a staging folder nothing will promote

**Where:** `lib/kiss.js:1288` (`_promote` returns early on `_buildSettled`), `lib/kiss.js:1795` (`_discardStaging` sets it), no reset anywhere (`grep '_buildSettled = '` finds only the two `true`s and the field)
**Status:** confirmed by reading. Pre-existing on `main`; this branch touched `_discardStaging` for the registry but not the latch.

`cleanBuild: 'atomic'` under a non-dev `.watch()`: the first build fails, staging is removed but `_stagingDir` is kept by design, the author fixes the page, and every later replay writes into a recreated staging folder, scans links there, reports ok, and never promotes. Dev mode is unaffected because atomic degrades to a plain clean there. Either reset `_buildSettled` when a replay begins, or have the constructor notice cover this configuration too.

### 4. `retain` is documented twice with two conditions

**Where:** `AIKB/output-registry.md:14,17`
**Status:** confirmed. Line 14 says it retires producers "when their sources disappear"; line 17 says "absent from the copy's current attempted outputs, including refused writes". The code matches line 17. Fold the new lifecycle sentence into the existing bullet.

### 5. The round-five test drives a private replay on an instance that neither watches nor runs in dev

**Where:** `test/integration/watch.test.js:66-77`
**Status:** confirmed. That is the file's convention for the other lifecycle tests too, so it is consistent, but none of them reach the recheck through the watcher. One test set up as `links.test.js` does it, a non-dev instance with `watch({ entry: null })`, would pin the configuration the feature serves.

### 6. The rescan runs when nothing was restored

**Where:** `lib/kiss.js:3054-3065`
**Status:** confirmed. `restore` is non-empty whenever a removed page had an asset owner, but a copy runs only when `_restorableAssets` still has an entry. Gate the rescan on a copy having run, or simply rescan on every replay per finding 1 and drop the gate.

### 7. Two lines that hand-roll a "force" against a synchronous, latched method

**Where:** `lib/kiss.js:3063-3064`, `lib/kiss.js:2910`
**Status:** confirmed. `_checkLinks` is synchronous; `await` on it is a no-op, and the latch is now reset in two places. A `_recheckLinks()` that owns the reset keeps the contract in one place. Finding 1's fix removes the second site anyway.

## Notes for the pass

- Findings 1, 2, 6 and 7 collapse into one change: rescan links after the sweep and restoration on every replay where links run, log once, and drop the `restore.size` gate.
- Finding 3 is older than the branch and only reachable under a non-dev atomic watch. It is worth a decision rather than a patch: either support that configuration or say it is unsupported the way the dev notice does.
- Findings 4 and 5 are a doc edit and a test setup.
- Codex kept the extra restoration copy deliberately, on the grounds that skipping it could leave assets missing. That is the right side to err on, and the report's round-5 item is closed.
