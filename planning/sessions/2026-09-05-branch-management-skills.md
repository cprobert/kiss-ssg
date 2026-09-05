---
branch: claude/kiss-ssg-skills-8umyo8
base: v2
status: open
opened: 2026-09-05
---

# Session — 2026-09-05: Branch-management skills for kiss-ssg

## Intent (captured at /branch-open)

_Inferred retrospectively — the harness auto-created this branch, so intent was captured after work began rather than at a clean starting line._

**Objective:** Port the branch-management skill set from the Quark repo into kiss-ssg, adapted to a published npm library with no CI, so a branch here runs the same Frame → Steer → Verify loop.

**Success criteria:**

- [ ] `/branch-open`, `/branch-pulse` and `/branch-close` exist and read one committed session artefact per branch, under `planning/sessions/` (not `docs/`, which `docs.js` empties).
- [ ] Every skill `/branch-close` invokes exists here too: `/secrets-scan`, `/docs-sweep`, `/corpse-collector`, `/test-coverage-check`, `/retrospective` (+ its rubric).
- [ ] Nothing hard-codes `main` — the base branch resolves so the loop keeps working when v2 lands.
- [ ] `npm run gates` exists and passes: test, lint, format, pack.
- [ ] The two scanner skills produce a clean report on the current tree, so a real finding is visible rather than buried in known noise.
- [ ] Every new module in `scripts/` ships a `test/unit/` test in the same commit.
- [ ] `CLAUDE.md` documents the workflow, the commands and the `planning/sessions/` location.

**Non-goals / out of scope:** No GitHub Actions workflow (deliberate — the operator chose the local gate script alone). No engine changes: `lib/` is untouched. No `CHANGELOG.md` seeded with invented history — `/branch-close` creates it on the first real bump.

**Impact surface:** tooling & docs — `lib/`, the config shape and the published API are all unchanged, so this is a patch-level branch.

**Expected shape:** between — the destination was clear (port these skills), the route was emergent: each adaptation had to be re-derived from what kiss-ssg actually is, and the scanners needed several tightening passes against real output.

### Amendments

- **2026-09-05** — `scripts/base-branch.mjs` and `scripts/gates.mjs` were not in the original ask. Both turned out to be load-bearing: without a resolver every skill would hard-code `main` and silently diff against the wrong base while v2 is the line of development, and `/branch-close` had no gate to run. Absorbed on this branch as tooling, in surface with the rest.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->
