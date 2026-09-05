---
branch: claude/kiss-ssg-skills-8umyo8
base: v2
status: closed
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

_(The `.pages()` finding below was subsequently fixed at the operator's direction — kept here as the record of how it was found.)_

- **2026-09-05 — `.pages()` fan-out shares one mutated options object.** `Kiss._prepareMultiplePages` reuses a single `options` object across the loop (`options.slug = …; options.model = model`) and `_preparePage` stores that reference (`kissPage.options = options`, `lib/kiss.js:122`) rather than a copy. `{{model.x}}` renders correctly because the model is re-read per page, but a page option derived from the model — `title` is the one observed — is fixed at the first item's value for every page in the fan-out. Reproduced on a stock-config site: three models, three output files, all rendering the first model's title. **Not a regression from this branch's dependency upgrade** — it reproduces identically on a pristine `origin/v2` worktree with glob 7 installed. The existing `pages()` characterization tests miss it because they all assert `{{model.name}}`, never a model-derived option. **Fixed 2026-09-05** at the operator's direction: `_prepareMultiplePages` now builds a fresh options object per fanned-out page, and `applyController`'s title fallback returns a new object instead of assigning onto the one it was handed. Regression tests added at both levels (`test/unit/controller-resolver.test.js`, `test/integration/characterization.test.js`); both were confirmed to fail against the unfixed `lib/` before being accepted.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-09-05: Branch-management skills for kiss-ssg

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** ten commits on `claude/kiss-ssg-skills-8umyo8` (`6248cd8`…`46fa56f` + the version bump), taking the branch from "port some skills" to a repo with a working dev loop, two automated nets, a current dependency tree and one fewer engine bug. Version `2.0.0-alpha.1`.

## Reflect — what the session was

The objective was clear from the first sentence; the route was not. This was **emergent**, and legitimately so — four separate scope expansions, each an operator decision taken at a checkpoint rather than anything a plan foresaw: full skill port over the recommended minimal set, a `gates.mjs` script over inline commands, CI plus a pre-commit hook (reversing their own earlier "local only" call), the dependency modernisation absorbed here rather than deferred, and the `.pages()` bug fixed rather than scheduled. The branch's impact surface moved from _tooling & docs_ to _engine internals_, recorded as two dated Amendments.

The shape served the work. Each expansion was cheap to judge because the previous one had landed and been verified, and several only became sensible _because_ of what preceded them — CI was the right call once `npm run gates` existed and was green, which was not true when it was first declined. One caveat on framing: intent was captured **retrospectively**, because the harness auto-created the branch. The brief was reconstructed at the first checkpoint rather than written at a clean starting line.

## Evaluate — how the human supervised the AI

**Pushback & steering — strong, and the defining dimension.** The operator overrode a recommendation four times out of five, each with a reason, and took the recommendation the fifth time (`.hbs` left unformatted). That asymmetry is the evidence that these were judgements rather than reflexes. The reversal on CI is the best single moment: having chosen "local gate only" earlier, they re-opened it once the evidence changed. Reversing your own decision when the facts move is harder than holding it.

**Learning engagement — one exchange did real work.** "Is the issue with prettier and `{{> "partial"}}` a version issue? Would a newer version or an exception rule fix it?" refused to accept a stated constraint at face value. It forced three empirical tests instead of an assertion from memory, and produced a genuinely better answer than the one it questioned: not a version issue (Prettier's `.hbs` support is Ember's Glimmer parser, which has no partials), an html-parser override _does_ work on all 25 templates, but it silently mis-indents a tag split across a block helper. The decision to leave `.hbs` alone was then made on evidence rather than on my say-so. This is the exchange where the sum beat the parts.

**Verification & ownership — the weak dimension, and worth naming plainly.** Every check in this session was run by Claude and read by the operator. The suite, the smoke builds, the pristine-`v2` worktree comparison, the gates — all mine. The engine diff (110 lines across `lib/`) was never independently reviewed, and "all gates passed" was accepted on assertion. That is fine for tooling; it is thinner ground for the engine of a published package, and it is the gap between this session and the level above.

**Iteration discipline — high, but self-imposed.** Verification was dense and it paid twice. The 177-test suite went green after the glob upgrade; only building a real stock-config site revealed that partials registered under wrong names and Sass compiled back into `src/` — because the test helper builds absolute-pathed sites and every `config.folders` default starts with `./`. Shipping on a green suite there would have broken every consumer using default config. Likewise, the `.pages()` bug was only safely attributable after standing up a pristine `origin/v2` worktree to prove it pre-dated the branch. But none of this cadence came from the human, and the `## Pulse log` above is **empty**: a branch that built a three-beat loop used exactly one beat of it.

**Harness leverage — a shared miss.** `/branch-close` was reached for at the end, correctly. `/branch-pulse` — the beat this very branch created — went unused across ten commits and four scope reversals. The operator did not call it and **Claude never offered it**, which is the half that matters more: the skill's own text says Claude should surface force-multipliers proactively rather than wait to be asked.

Where Claude over-reached or needed the steer:

- I reported "**All gates passed**" for two commits while the `pack` gate was silently skipping. My own tolerant fallback turned "cannot read the tarball" into a pass. I caught it by reading output closely; nothing structural would have. The durable fix — a gate that cannot see its subject now **fails** — is the most valuable line of code on this branch.
- Two scripted `python` string-replaces silently no-op'd after Prettier reformatted their target files, leaving the format gate scoped to code behind a comment asserting the docs "predate any prettier pass" — false by then. Caught by re-reading, not by process.

**Competency level: active supervisor.** Earned by the repeated reasoned overrides, the evidence-driven reversal, and the Prettier question that interrogated a constraint rather than accepting it. Not _agentic engineering lead_: that level designs the workflow **and holds its checkpoints**, and here the workflow was built but never exercised mid-flight, with verification wholly delegated.

Intended versus actual supervision, plainly: the branch shipped a loop for catching drift early and then ran the whole branch without it. `/branch-close` running now is the first time the ritual has ever executed against a real branch.

## Feedback — recommendations for next session

**For the operator**

1. **Run `/branch-pulse`.** This branch is its own argument: ten commits, four scope reversals, zero mid-branch checkpoints. The natural moment was straight after the dependency upgrade — the point where you would have looked at the smoke-build output yourself instead of reading my summary of it.
2. **Ask for the diff, not the report.** `git diff origin/v2...HEAD -- lib/` is 110 lines. That is small enough to read, and it is the engine of a published package. Every green result this session was my assertion about my own work.
3. **Keep making the Prettier move.** Asking whether a stated constraint is actually real, rather than routing around it, changed the quality of that answer. Do it to more of my constraints.

**For Claude**

1. **Offer the pulse.** I built the beat, documented that Claude should surface it, and then never suggested it across a ten-commit branch.
2. **A fallback that converts "cannot check" into "pass" is a defect, not caution.** I wrote it, and it hid a dead gate for two commits while I reported success.
3. **Verify every scripted edit landed.** Two silent no-ops, both caught by luck. Prefer `Edit` over blind string replacement on a file that formatting may have moved under me.

## Verdict — did we achieve the objective?

**Met, and the objective moved — good drift, recorded twice as Amendments rather than absorbed silently.**

- [x] `/branch-open`, `/branch-pulse`, `/branch-close` exist, reading one artefact per branch under `planning/sessions/` — this file is that artefact, written by the flow it describes.
- [x] Every skill `/branch-close` invokes exists here: `/secrets-scan`, `/docs-sweep`, `/corpse-collector`, `/test-coverage-check`, `/retrospective` (+ `rubric.md`). All eight ran in this close.
- [x] Nothing hard-codes `main` — `scripts/base-branch.mjs` resolved `origin/v2` at every step of this ritual, and will resolve `main` unchanged once v2 lands.
- [x] `npm run gates` exists and passes: test, lint, format, pack — green on the final state.
- [x] Both scanners report cleanly: docs-sweep found two real staleness items (fixed this pass), corpse-collector zero P1/P2/P3.
- [x] Every added `scripts/` module ships a `test/unit/` test — the gate confirmed all three.
- [x] `CLAUDE.md` documents the workflow, the commands and `planning/sessions/`.

**Concretely better now:** the repo has automated formatting, CI, a pre-commit hook and a publish gate where it had none; a current, non-deprecated dependency tree ahead of the 2.0.0 release; deterministic build ordering; and two real bugs fixed — one found by the existing suite (chokidar's silently-dead `ignored` glob) and one that predated the branch (`.pages()` fan-out sharing an options object).

**Still open:**

- CI has never actually run. It fires on PRs to `main`/`v2` and pushes to those branches, so this PR is its first real execution. `npm ci` sync, YAML shape and local gate parity were verified; nothing else can be until it runs.
- The same aliasing family is open one level up: `AIKB/kiss.md` documents that `_registrations` holds a shallow copy, so a controller mutating `options.model` in place accumulates across watch rebuilds. Documented as a contract ("keep controllers idempotent") rather than enforced.
- `handlebars-helpers.js` is the thinnest coverage at 67% branch, and it is public API.
- `docs.js` builds the published docs site in dev mode, so the committed `docs/index.html` carries a `localhost:35729` livereload `<script>` tag that every visitor's browser tries to load. Pre-existing, harmless, sloppy.
