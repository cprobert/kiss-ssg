---
branch: fix/promote-eperm-stall
base: main
status: closed
opened: 2026-09-28
consolidated: 2026-10-01
---

# Session — 2026-09-28: A locked build folder fails the promote fast and clearly

## Intent (captured at /branch-open)

**Objective:** When another program holds the build folder open (an editor, a preview server such as VS Code Live Server, antivirus), an `'atomic'` build's promote should retry briefly and then fail with a message naming the folder and the likely cause.

Today it stalls silently for one to two minutes. `_promote()` in `lib/kiss.js` renames through `fs-extra`, whose `graceful-fs` 4.2.11 retries a Windows `rename` for up to 60 s on `EPERM`/`EACCES`/`EBUSY` (`node_modules/graceful-fs/polyfills.js:97-123`; read, not yet measured). Then its catch-all `fs.move` fallback probably waits again. It was found on the launch-readiness branch as example 7's 60 s test timeout under Live Server (`AIKB/testing.md` § Gotchas).

**Success criteria:**

- [ ] **Measured first.** A Windows-only test that holds a file open inside the build folder shows `complete()` not settling for a long time on the current code. It is seen red, and the stall is timed and recorded.
- [ ] **After the fix, it fails fast.** Under that lock, `complete()` rejects within a few seconds, and the message names the folder and the likely cause. The previous output is left in place: if it was renamed aside, it is restored.
- [ ] **The copy fallback runs only for its real case.** `fs.move` is used only when the rename fails `EXDEV` (a cross-drive build folder), never for a lock. A unit-level test shows `EPERM` does not reach it.
- [ ] **Normal atomic builds are unchanged.** Every existing atomic and check test stays green.
- [ ] **Docs:**
  - `AIKB/kiss.md` describes the promote's retry and failure.
  - `AIKB/upstream.md` records the `graceful-fs` 60 s Windows rename retry: the version observed, how to re-check it, and why kiss bypasses it for this one call.
  - `AIKB/testing.md`'s gotcha is updated: the build no longer hangs.
- [ ] **Operator eyeball.** With Live Server running on the repo, example 7 fails within seconds, with a message the operator can act on.
- [ ] **Close checks.** `npm run gates` is green; Codex review at the close (the branch changes `lib/`).

**Non-goals / out of scope:**

- Making a build succeed despite a lock.
- Identifying which process holds it.
- Changing any other `fs-extra`/`graceful-fs` call in the engine; `_removeStaging` already uses native `fs.rm` with `maxRetries`.
- Non-atomic builds.

**Impact surface:** engine internals. The API is unchanged; a locked promote now fails in seconds rather than minutes. That points to a patch.

**Expected shape:** planned. The cause is identified in the code, and the work is one function and its tests.

**Delegation convention:** none: one session. No sub-agents implement; Codex reviews at the close.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-09-28 — a failed promote removes its staging folder at once.** The Live Server check on example 7 (failed in 2.4 s, correct message) showed each locked run leaving `public/test.kiss-staging-*` behind, swept only by the next build. The staging folder was left for `close()`, which a one-shot build script never calls. The existing tests only checked for leftovers after `close()`. Under a real lock the rename that fails is the one that moves the published folder aside, which was outside the `try`. The fix: `_swapIn()` holds the swap, and `_promote()` removes the staging folder through `_abandonStaging()` (shared with `_discardStaging()`) on any throw. Four tests now check for leftovers before `close()`, one of them new: it simulates a lock on the rename-aside. All four were seen red on the unfixed code. The operator chose to fix it on this branch rather than note it. Pre-existing, not a regression of this branch.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-09-28: A locked build folder fails the promote fast and clearly

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** `dbbff12` (the promote renames through `node:fs/promises` with a ~1.5 s retry and an actionable error, bypassing graceful-fs's 60 s Windows retry), `b6d1016` (a failed promote removes its staging folder at once), `ac158d8` (GUIDE.md and llms.txt say what a locked swap does), `dce843c` (2.6.5).

## Reflect — what the session was

The branch was **planned**, and the plan held: the cause had been read in `node_modules/graceful-fs/polyfills.js` before the branch opened, and the Intent named one function and its tests. The work ran across **two session windows**. The first crashed after committing `dbbff12`. The second resumed from this file and `git log`, not from memory. **What happened inside the first window is not known to this reflection.** That includes how the 60136 ms stall was measured, whether the Windows test was seen red, and what the operator checked. It is recorded only in the commit and the AIKB text. The resume worked because the Intent was written down and every step up to the crash was committed. That is the concrete payoff of `/branch-open`'s artefact: the crash cost one window's conversation and none of its work.

The second window added one piece of emergent scope. The operator's own run of example 7 under Live Server showed a staging folder being swept at every start ("Removed leftovers of an interrupted build"). Reading `_promote()` found that the failure path left staging for `close()`. A one-shot build script never calls `close()`, and the existing tests only asserted after `close()`, so they could not see it. Under a real lock, the rename that fails is the **rename-aside of the published folder**, which sat outside the `try`. The test that simulated a lock failed the other rename, so the fix had to cover both.

## Evaluate — how the human supervised the AI

- **Verification & ownership: the standout, and it produced the finding.** The success criteria asked for an operator eyeball, and the operator did it: they started Live Server and ran `npm run eg7`, then pasted their own output when Claude's run matched it. That pasted output is what exposed the leftover staging folder. It was visible in the same log as the fix's message, one line above it. The sum beat the parts: the operator's real run supplied the evidence, and Claude read the pattern ("each run removes the previous run's copy") and the code path behind it. Neither the tests nor the message alone would have shown it.
- **Pushback & steering: a decision point was offered and taken.** The leftover was pre-existing, not a regression, so "note it" was a defensible answer. It was raised as an `AskUserQuestion` rather than a footnote, and the operator chose to fix it on the branch. It is recorded as an Amendment.
- **Iteration discipline: weak.** The branch was **never pulsed**. The `## Pulse log` is empty, and this close did the verification cold. The crash is part of why, but not all of it: `dbbff12` was committed with no checkpoint recorded before it.
- **The eyeball after the fix did not happen with the lock held.** Claude's re-run of example 7 after `b6d1016` built cleanly in 737 ms because Live Server was no longer holding the folder. Claude reported that as not demonstrating the locked case rather than as confirmation. The operator recorded the eyeball as "looked: pre-fix run only". The cleanup rests on four tests, all seen red first, one of them simulating the lock on the rename-aside.
- **Independent review:** Codex ran and found nothing, but read-only, four commands, no tests run. It counts as an independent review, a light one.

**Competency level: Active supervisor.** The operator framed the branch in full, including a manual verification criterion, and then acted on it. The run they did is what found the only defect fixed in this window, and the scope decision was theirs, made explicitly. It falls short of the level above because there was no mid-branch cadence (no pulse) and no re-check with the lock held after the fix.

## Feedback — recommendations for next session

- **Operator — re-run the eyeball after any fix it prompts.** A check that finds a defect needs repeating once the fix lands. Here the cleanup was confirmed only by tests, because the second run happened without Live Server. When a manual check produces a code change, keep the condition it needed (the lock) in place for one more run.
- **Claude — a test that asserts after `close()` cannot see a one-shot script's behaviour.** Four atomic tests checked for leftovers only after `close()`, which no real `router.js` calls. When a test's teardown does work the production path never does, assert the state **before** the teardown too.
- **Claude — simulate the failure the real world produces first.** The simulated lock failed the staging rename, but a real lock fails the rename-aside of the published folder first. When mocking a failure, check which call a real lock actually fails before choosing the one the mock breaks.
- **Both — pulse before a crash can take the reasoning with it.** The committed work survived the crash; the reasoning behind `dbbff12` did not, except where it was written into AIKB. A `/branch-pulse` line after the first commit would have kept the measurement and the red test on record here.
- **Process — `git commit -F -` does not read a PowerShell here-string.** A docs commit failed that way this session. It failed loudly, since git treated the message as a pathspec, and was redone from a file. In PowerShell, write the message to a file and pass `-F <file>`.

## Verdict — did we achieve the objective?

**Brief:** a locked build folder fails an `'atomic'` build's promote fast and clearly, rather than stalling silently.

- [x] **Measured first.** The stall was 60136 ms, recorded in `AIKB/upstream.md` and the Windows test. Whether that test was seen red happened in the crashed window and cannot be re-verified here.
- [x] **Fails fast after the fix.** Example 7 failed under Live Server in 2.4 s with a message naming the folder, the likely cause and what to do. The previous output is restored (tests), and the staging copy is now removed too (`b6d1016`, four tests seen red).
- [x] **Copy fallback only for `EXDEV`.** `never falls back to copying when the swap fails on a lock` asserts that `fs.move` is not called.
- [x] **Normal atomic builds unchanged.** The full suite passes, and example 7 built cleanly without the lock.
- [x] **Docs.** `AIKB/kiss.md`, `upstream.md` and `testing.md` are updated, plus `GUIDE.md` and `llms.txt` for site authors.
- [x] **Operator eyeball.** Done on the fix's message. The staging cleanup was not checked with the lock held.
- [x] **Close checks.** `npm run gates` passes, and the Codex review found nothing.

**Met**, with one piece of good drift: the staging cleanup, recorded as an Amendment and chosen by the operator. The concrete gain is that a Windows author with a preview server open now waits about 2 s, not 60+, is told what to close, and is left with no copy of the site beside their build folder. **Open:** a hand check of the cleanup with the lock held.
