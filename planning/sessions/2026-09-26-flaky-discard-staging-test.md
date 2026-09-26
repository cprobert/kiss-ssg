---
branch: fix/flaky-discard-staging-test
base: main
status: open
opened: 2026-09-26
---

# Session — 2026-09-26: Flaky discard-staging ownership test

## Intent (captured at /branch-open)

**Objective:** Make `test/integration/watch.test.js`'s "round two: discarding a staging build clears its output claims" deterministic, by finding out why the staged `file.txt` is sometimes still owned by `asset copy` after `_discardStaging()` (measured 1/6 runs failing on `main`, 2/5 on `feat/agent-first-onboarding`) and fixing the cause, not the symptom.

**Success criteria:**

- [ ] Root cause named with evidence: a test-ordering bug, or an engine race between an in-flight asset copy and `_discardStaging()`.
- [ ] Reproduced deterministically (a forced ordering that fails every time) before the fix.
- [ ] Fixed: the reproduction passes, and the whole `watch.test.js` file passes 30 consecutive runs on this Windows machine (measured).
- [ ] If the fix is in `lib/`: the module's `AIKB/` doc updated in the same commit, and a Codex review at close.
- [ ] `npm run gates` green.

**Non-goals / out of scope:** Other flaky tests; refactoring watch or staging code beyond the fix; any change a consuming site can observe.

**Impact surface:** tooling & docs if the cause is in the test (no bump); engine internals if it is in `lib/` (patch) — decided by the diagnosis, recorded as an Amendment when known.

**Expected shape:** emergent — the destination depends on whether the race is in the test or the engine.

**Delegation convention:** none: one session implements; the only sub-agent is the Codex review at close if `lib/` changes. Agents never commit.

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
