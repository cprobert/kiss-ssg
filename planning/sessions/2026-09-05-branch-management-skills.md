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

- **2026-09-05** — CI (`.github/workflows/ci.yml`) and a pre-commit format hook were added at the operator's direction, reversing the earlier "local gate only" decision once `npm run gates` existed and was green. Adding the hook's npm `prepare` script broke the pack gate (npm runs lifecycle scripts during `npm pack`, and the banner polluted the JSON the gate parsed) — caught because the gate reported a silent skip, which has since been changed to a hard failure.
- **2026-09-05** — Dependency modernisation absorbed onto this branch at the operator's direction: glob 7 → current (deprecated upstream, and its v7 path/ordering quirks are worked around in `lib/partials.js` and `test/helpers/site.js`), fs-extra 9 → 11, chokidar 3 → 5, serve-static 1 → 2, plus the dev toolchain. This moves the branch's impact surface from "tooling & docs" to **engine internals** — the public API is unchanged, but `lib/` is. Recorded rather than split because the operator authorised it explicitly; it is the one thing on this branch that could change runtime behaviour.
- **2026-09-05** — `scripts/base-branch.mjs` and `scripts/gates.mjs` were not in the original ask. Both turned out to be load-bearing: without a resolver every skill would hard-code `main` and silently diff against the wrong base while v2 is the line of development, and `/branch-close` had no gate to run. Absorbed on this branch as tooling, in surface with the rest.

## Findings surfaced, not acted on

- **2026-09-05 — `.pages()` fan-out shares one mutated options object.** `Kiss._prepareMultiplePages` reuses a single `options` object across the loop (`options.slug = …; options.model = model`) and `_preparePage` stores that reference (`kissPage.options = options`, `lib/kiss.js:122`) rather than a copy. `{{model.x}}` renders correctly because the model is re-read per page, but a page option derived from the model — `title` is the one observed — is fixed at the first item's value for every page in the fan-out. Reproduced on a stock-config site: three models, three output files, all rendering the first model's title. **Not a regression from this branch's dependency upgrade** — it reproduces identically on a pristine `origin/v2` worktree with glob 7 installed. The existing `pages()` characterization tests miss it because they all assert `{{model.name}}`, never a model-derived option. Left for the operator to schedule: it is engine behaviour, outside this branch's remit, and fixing it needs a decision about whether `_preparePage` should snapshot its options.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->
