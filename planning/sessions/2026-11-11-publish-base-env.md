---
branch: fix/publish-base-env
base: main
status: open
opened: 2026-11-11
scope: planning/sessions/2026-11-11-publish-base-env.md, .github/workflows/publish.yml, test/unit/base-branch.test.js, test/unit/docs-sweep-scope.test.js, test/**, CHANGELOG.md, planning/reviews/2026-11-11-phase-0-exit.md
---

# Session — 2026-11-11: The release gates fail on publish.yml's KISS_BASE_BRANCH

## Intent (captured at /branch-open)

**Objective:** Make the `v2.15.0` release run pass its gates, so 2.15.0 can be re-tagged and staged: `publish.yml` stops setting `KISS_BASE_BRANCH`, and the tests that assert on `base-branch.mjs`'s exact output stop depending on the caller's environment.

**Success criteria:**

- [ ] `KISS_BASE_BRANCH=main npx vitest run test/unit/base-branch.test.js test/unit/docs-sweep-scope.test.js` fails 4 tests before the fix and passes after it (the class: no test of `base-branch.mjs`'s output inherits the variable from whoever runs it).
- [ ] The full suite passes with `KISS_BASE_BRANCH=main` set, and without it.
- [ ] `publish.yml` no longer sets `KISS_BASE_BRANCH`; its gates job is the `ci.yml` gates step it was before the hardening.
- [ ] `npm run gates` passes; both CI legs pass on the PR.
- [ ] After the merge (the operator's acts): the tag `v2.15.0` moves to the merged commit, and the publish run stages 2.15.0.

**Non-goals / out of scope:** any other change to `publish.yml` (the two-job split and the uncached install stay); changing `base-branch.mjs`'s output; a version bump (the operator chose to re-tag 2.15.0).

**Impact surface:** tooling & docs — a workflow and tests; no `lib/` change, nothing a site observes.

**Expected shape:** planned — the cause was reproduced locally: the four failures appear only with the variable set.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- 2026-11-11 — Carried from `chore/phase-0`: the operator merged PR #84 with the Ubuntu leg red (three reruns failed on the runners' DNS, the same image passing the day before). Asked for a one-sentence reason before recording it; none came, so: **no reason given**. The `main` CI after the merge passed on both legs.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
