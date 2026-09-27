---
branch: fix/flaky-discard-staging-test
base: main
status: closed
opened: 2026-09-26
---

# Session — 2026-09-26: Flaky discard-staging ownership test

## Intent (captured at /branch-open)

**Objective:** Make `test/integration/watch.test.js`'s "round two: discarding a staging build clears its output claims" deterministic, by finding out why the staged `file.txt` is sometimes still owned by `asset copy` after `_discardStaging()` (measured 1/6 runs failing on `main`, 2/5 on `feat/agent-first-onboarding`) and fixing the cause, not the symptom.

**Success criteria:**

- [x] Root cause named with evidence: a test-ordering bug, or an engine race between an in-flight asset copy and `_discardStaging()`.
- [x] Reproduced deterministically (a forced ordering that fails every time) before the fix.
- [x] Fixed: the reproduction passes, and the whole `watch.test.js` file passes 30 consecutive runs on this Windows machine (measured).
- [x] If the fix is in `lib/`: the module's `AIKB/` doc updated in the same commit, and a Codex review at close.
- [x] `npm run gates` green.

**Non-goals / out of scope:** Other flaky tests; refactoring watch or staging code beyond the fix; any change a consuming site can observe.

**Impact surface:** tooling & docs if the cause is in the test (no bump); engine internals if it is in `lib/` (patch) — decided by the diagnosis, recorded as an Amendment when known.

**Expected shape:** emergent — the destination depends on whether the race is in the test or the engine.

**Delegation convention:** none: one session implements; the only sub-agent is the Codex review at close if `lib/` changes. Agents never commit.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-09-26 — the versioning rule, settled by the operator (adjacent, absorbed here).** The contradiction `/memory-consolidate` left open — `CLAUDE.md` said breaking changes are major, while 2.5.1, 2.6.0 and 2.6.1 were each chosen smaller — is resolved in the operator's words: "I only change version numbers 2 => 3 when it's a new version of the lib … I won't bump to 3 until it's practically a new project … The little fixes are tiny increments but if it's a bit meatier I don't mind going up a 2.x." `CLAUDE.md` (design philosophy and § Git workflow), `/branch-close` Step 4a's table and `/branch-open`'s Impact surface now say: the major counts generations; a minor is meatier work, including changes sites must adapt to (with an upgrade note); a patch is a small fix or increment; Claude proposes, the operator decides. Unrelated to the flaky test; no code change.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-09-26** — criteria 1–3 met: root cause is the test waiting on `_promises` while `generate()`'s render sits on `_generating`; the write lands in staging mid-removal, `fs.remove` fails `ENOTEMPTY`, `_discardStaging` swallows it before `clearUnder` (probe 32/120, each with a swallowed ENOTEMPTY and `index.html` left). Forced ordering (page writes held 50 ms): old wait left a render in flight 10/10, `_drain()` 0/10 — the root cause is forced; the ENOTEMPTY consequence itself only statistically. Fix `f8ca4a8` (test-only): `watch.test.js` 30/30 on Windows. Criterion 4 n/a (no `lib/` change); 5 is the close's. Impact surface settled: tooling & docs, no bump. **Eyeball: deferred** — the operator's own 10-run re-measure, to be asked again at `/branch-close` Step 5a. **Explained:** fixing the test and not the engine; operator kept the engine out of scope. Follow-up recorded: `_discardStaging` skips `clearUnder` whenever the removal fails, so a transient Windows lock (antivirus, indexer) during a failed build would leave the staging folder and stale claims — not reachable by a concurrent writer after `_drain()`, not fixed here. Decision: ready to close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Log — 2026-09-26: Flaky discard-staging ownership test

**What we shipped:** `f8ca4a8` — the "round two" discard test in `test/integration/watch.test.js` now waits with `kiss._drain()` instead of `Promise.all(kiss._promises)`; `3b081a5` records the gotcha in `AIKB/testing.md`. Riding along: `923508d`, the operator's versioning rule (the major counts generations; a minor is meatier work, including changes sites must adapt to; a patch is a small fix), and `ab61004`, the 2026-09-26 consolidation, which was committed on local `main` and never pushed. No version bump (operator).

**Supervision:** planned-to-emergent as intended — the open named both possible causes (test ordering or an engine race) and wrote criteria that held either. Systematic debugging did the work: a 120-iteration probe tied every failure to a swallowed `ENOTEMPTY` with `index.html` left in staging and `_generating` pending; a forced ordering made the root cause deterministic (render in flight 10/10 under the old wait, 0/10 under `_drain()`); the fix was one line and 30/30 runs passed. One honest limit, stated at the pulse: the root cause was forced, the `ENOTEMPTY` consequence only shown statistically. The pulse ran as the skill, not by hand — the 09-26 feedback applied — and its new "offer one explanation" step surfaced the one real judgment call (fix the test, leave the engine's swallow-and-skip in `_discardStaging` alone), which the operator decided: out of scope, recorded as a follow-up. The operator's strongest contribution was the versioning rule, stated plainly in their own words and written into `CLAUDE.md` and three skills the same hour. Verification stayed with the machine and Codex: the operator's 10-run re-measure was deferred twice, at the pulse and at the close. **Assisted operator**, with a clear decision on the one question that needed a human.

**Feedback for next time:**

- **Operator — run the 10-run re-measure before merging.** It is the deferred eyeball, it takes about a minute, and it is the one check on this branch that is yours rather than an agent's.
- **Claude — commit governance changes where they will be pushed.** `ab61004` sat unpushed on local `main` and only reached a PR because this branch was cut from it; a consolidation on `main` should be pushed (or put on its own branch) in the same sitting, and the close should check `origin/<base>..HEAD` rather than `<base>..HEAD`, which hid it.
- **Process — the `_discardStaging` follow-up needs a home.** A failed removal skips `clearUnder`, so a transient Windows lock during a failed build would leave the staging folder and stale claims. Not reachable by a concurrent writer after `_drain()`; worth a small engine branch with a retry and an unconditional clear.
- **Process — background Codex runs die under memory pressure on this machine.** One was reaped while idle; the foreground run succeeded. Twenty-four orphaned Plaud MCP servers (about 2 GB) were the avoidable part — each Codex and Claude session starts its own and never stops it.

**Did we achieve the objective?** **Met.**

- [x] Root cause named with evidence — the test's wait did not cover `_generating`; 32/120 probe failures, each a swallowed `ENOTEMPTY` with `index.html` left in staging.
- [x] Reproduced deterministically — forced ordering, render in flight 10/10 under the old wait, 0/10 under `_drain()`.
- [x] Fixed — `watch.test.js` 30/30 on Windows.
- [x] `lib/` criterion — not applicable; test-only, confirmed by reading the engine's discard call sites (only after `_settle()`).
- [x] `npm run gates` green at the close (test, lint, typecheck, format, pack).

Open: the operator's 10-run re-measure (PR item); the `_discardStaging` engine follow-up.
