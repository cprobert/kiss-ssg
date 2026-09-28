---
branch: fix/promote-eperm-stall
base: main
status: open
opened: 2026-09-28
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

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
