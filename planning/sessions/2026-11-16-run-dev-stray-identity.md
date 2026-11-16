---
branch: fix/run-dev-stray-identity
base: main
status: closed
opened: 2026-11-16
consolidated: 2026-11-16
scope: test/integration/run-dev.test.js, test/integration/atomic-build.test.js, AIKB/testing.md, planning/**
---

# Session — 2026-11-16: run-dev's stray check names what it found

## Intent (captured at /branch-open)

**Objective:** Find the cause of the Windows-only CI failure on `main` at `1409d13` (`run-dev.test.js` `afterEach`: `expected [ 8880 ] to deeply equal []`) before 2.18.0 is tagged. Make the stray check identify a leftover by its command line, so a reused pid is neither reported nor killed.

**Success criteria:**

- [ ] The `afterEach` counts a recorded pid as a leftover only when it still runs this suite's `router.js` or `watch.js`, names each one with its command line in the assertion, and never SIGKILLs any other process. If the command lines cannot be read, the check fails rather than passing in silence.
- [ ] `run-dev.test.js` passes, and the full suite passes repeatedly on Windows under load, with any leftover named.
- [ ] CI is green on Windows and Ubuntu for the merged commit, so `/kiss-publish` can run.

**Non-goals / out of scope:** No engine change unless a named leftover shows a real stop defect. That would be an Amendment, and the operator's call. Not the `run-script.test.js` `alive` checks: they look at a pid seconds after recording it, and that test's SIGKILL is POSIX-only on a pid it has just read.

**Impact surface:** tooling & docs (a test). No bump: it ships inside the untagged 2.18.0.

**Expected shape:** between. The fix to the check is planned, and the cause is whatever the named strays show.

**Assumptions:**

- Measured (CI run 43920278382): only `gates (windows-latest)` failed, in this one `afterEach`. The identical tree passed on PR #98's head `235bb09` (`git diff --stat 235bb09 1409d13` is empty). `publish.yml` runs on `ubuntu-latest` only.
- Measured (2026-11-16, this machine): the case passed 30 times out of 30 when run alone.
- Measured (`lib/dev-supervisor.js` `stopChild`, `stop`): each child's `exit` is awaited before the next starts and before `stop()` resolves. So a `pids.txt` pid that answers `kill(pid, 0)` afterwards is a reused pid.
- Inferred: a `watch-pids.txt` pid could be a real leftover (the tree kill goes through `taskkill`) or a reused pid. The named check tells them apart.
- Measured (scratch probe): `Get-CimInstance Win32_Process` returns each running pid's command line, and leaves out a pid that is not running.

**Delegation convention:** none: one session.

### Amendments

- **2026-11-16 — opened from the operator's choice** at `/kiss-publish`, after CI failed on `1409d13`: "Find the cause first". The release waits for this branch.
- **2026-11-16 — the Phase 2 spec author's feedback joins (the operator's choices).**
  - **Item 1, the cause, is a reused pid.** Measured under load while the full suite passed:
    - 58 of 300 freed pids answered again within 10 s.
    - The pipeline watch tool was alive at `close()` in 0 of 200 rounds, and 0 of 200 unloaded.
    - 8880 itself cannot be identified after the fact, so the cause is the best-supported one, not one observed.
    - The advisor found the first identity (`router.js|watch.js`) too loose. Fixed in `aa02b36` with the case's site folder and a per-case tag, plus a positive assertion. It passes on Windows and on Linux in WSL (the `ps` branch).
  - **Item 4's test joins here**, widening the scope to `test/integration/atomic-build.test.js`. Red-first against the pre-fix commit, because `main` already has the fix: `- red-first: test/integration/atomic-build.test.js -t "builds several times in one process" failed at f43dbf0 (f43dbf0), 2026-11-16` (`live: 3` against `0`). The first attempt "failed" on an unrelated `TypeError` (the run state not yet created), which proved nothing. It was fixed with `runState()` and re-run.
  - **Items 2, 3, 5 and item 4's design half** are adopted and written into the roadmap's Phase 3 section.
  - **Item 6 (#90) was withdrawn by its author**: it waits for Phase 4.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Log — 2026-11-16: run-dev's stray check names what it found

**What we shipped:**

- `run-dev.test.js`'s `afterEach` identifies a leftover by its command line: the case's site folder or its per-case tag (`ea8ef7a`, `aa02b36`, `8ee15e7`).
- A test builds three times in one process and checks the run state is back where it started (`7f32d95`).
- The roadmap's Phase 3 carries the four rules the operator adopted, and #90 moves to Phase 4 (`34fe3fe`).

**Supervision:** planned, and the decisive steer was the operator's. At `/kiss-publish`, faced with red CI and an identical tree that had passed, they chose "Find the cause first" over a rerun. Fable's feedback ("find out whether Windows is a timing race in the test or a real leftover process") then set the bar for that answer. Level: **Agentic engineering lead**.

- **Verification was the strong dimension.** The cause rests on three measurements, two of them under load, and is recorded as the best-supported cause, not one observed:
  - 58 of 300 freed pids answered again within 10 s;
  - the pipeline watch tool was alive at `close()` in 0 of 200 rounds, under load and without it;
  - the case alone passed 30 of 30 runs, and the full suite 4 of 4.
- **Each independent read found a real flaw in Claude's code:**
  - the advisor: the first identity, `router.js|watch.js`, matched other test files' processes;
  - Codex: the disconnect case's relative `router.js` was invisible to the new filter.
- **One red-first was wrong at first.** It "failed" on an unrelated `TypeError` (the run state not yet created) and was caught before being recorded.
- **No pulse ran on this branch.** At the close the eyeball was the advisor's read, at the operator's request. It found four wordings in the roadmap block that went beyond what the operator decided, and two of them became operator questions: the meaning of "the fleet on it" (the six sites installed on 2.18.0), and #90's phase (Phase 4).

**Feedback for next time:**

- **Claude — a test's identity of a process is its command line, not its pid.** And the identity must be unique to the case: a file name other test files use in parallel is not one. Prove it with a positive assertion, so a check that never matches cannot pass in silence.
- **Claude — read a red-first failure before recording it.** "It failed at the base" proves the fix only when it failed on the assertion the fix changes.
- **Claude — offer a pulse on a short branch too.** This one went from its first commit to `/branch-close` without one, so the eyeball fell back to the close.
- **Process — a CI failure that an identical tree passed is still a finding.** Rerunning to green would have released 2.18.0 with this check able to SIGKILL an unrelated process on a developer's machine.

**Did we achieve the objective?** **Met.**

- [x] The `afterEach` names each leftover by its command line and kills only the case's own. An unreadable answer fails the check. It is proven positively under the real command and in the disconnect case.
- [x] `run-dev.test.js` passes on Windows and on Linux (WSL), and the full suite passed 4 of 4 under load.
- [ ] CI green on Windows and Ubuntu for the merged commit: due on this PR and on `main` after the merge, before `/kiss-publish`.

The criteria held as written. The amendment added the twice-in-one-process test and the Phase 3 rules, both the operator's choice.
