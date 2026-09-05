---
branch: review/v2-critical-friend
base: main
status: open
opened: 2026-09-05
---

# Session — 2026-09-05: Independent review of the v2 engine, then implement what survives triage

## Intent (captured at /branch-open)

**Objective:** Give the v2 engine and its gate tooling the independent critical-friend review they never had before 2.0.0 is cut, hand every verified finding to the operator to triage, then implement what they choose on this same branch — plus a design spec, no code, for a watch-mode dependency graph.

**Success criteria:**

- [ ] Every `lib/` module and every `scripts/` module is covered by exactly one review lane (A lifecycle, B watch/replay, C paths, D helpers/contract, E gate tooling).
- [ ] Every finding carries a repro script or a named test that demonstrates it, or is explicitly labelled reasoning-only.
- [ ] Every finding is verified by the orchestrator with a recorded verdict (CONFIRMED / PLAUSIBLE-UNVERIFIED / REJECTED) before the operator sees it.
- [ ] The review report is committed to `planning/reviews/2026-09-05-v2-engine-review.md`.
- [ ] The four open items from the previous branch's retrospective (`_registrations` aliasing, `handlebars-helpers` coverage, docs-site built in dev mode, cutting 2.0.0) appear in the backlog, each with a recommendation.
- [ ] The dependency-graph design spec exists at `planning/specs/2026-09-05-watch-dependency-graph-design.md`, mirrors the v2 spec's sections, states the sync-render invariant, and proposes characterisation tests before any optimisation.
- [ ] Every triaged fix lands with a regression test confirmed to fail on the unfixed code, and `npm run gates` is green after each commit.

**Non-goals / out of scope:** No engine changes during the review phase. No implementation of the dependency graph. No `/branch-close`, no PR, no publish. Skills and prose docs are not code-reviewed. Backfilling historical tags is the operator's task, outside this branch.

**Impact surface:** engine internals — the review touches nothing; the fixes will touch `lib/` and `scripts/` with the public API unchanged unless triage says otherwise, in which case this line is amended.

**Expected shape:** emergent — the findings decide the second half of the branch.

**Delegation convention for this branch** (from `planning/specs/2026-09-02-v2-solid-refactor-design.md` § Model delegation): Fable writes briefs and specs and verifies; Opus reviews and implements; Sonnet does mechanical work. Lifecycle fixes are briefed and reviewed by Fable and implemented by Opus; Fable authors code only where a fix is cross-cutting enough that the brief would be longer than the diff.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-09-05** — criteria 1–6 met: every `lib/`/`scripts/` module lane-covered once the in-context addendum F swept `controller-resolver.js` and `logger.js` (report `506e33d`); every row has a repro path or a "reasoning only" label; verdict ledger in the appendix; report committed; four carried-over items each carry a recommendation; spec at `dd64029` mirrors the v2 spec's sections, states the sync-render invariant (marker in the render seam, after critique) and puts characterisation tests first. Criterion 7 not yet — blocked on operator triage (3 P1, 22 P2, 19 P3). Trajectory is three `planning/` files, no engine change, impact surface unchanged, no drift. Decision: continue — hand the backlog to the operator.

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->
