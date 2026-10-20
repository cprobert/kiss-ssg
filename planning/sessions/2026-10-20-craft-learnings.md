---
branch: ccr-d677d579-ay3if6
base: main
status: open
opened: 2026-10-20
---

# Session — 2026-10-20: Design and usability learnings from six skill repos, brought into kiss

## Intent (captured at /branch-open)

**Objective:** Fold the checkable lessons from six third-party design-skill repos into kiss, so that existing kiss sites get both a usability and best-practice audit and a design lift from one review, and new sites are built to the same floors. The repos are emilkowalski, garden-skills, elayadesign, MengTo, jakubkrehel and Owl-Listener; the evaluation is cited below. kiss takes the lessons, not the skills, and recommends no new companion.

The lessons go to three places:

- **the build audit:** facts, automatic on every `kiss-ssg check`;
- **`kiss-site-review`:** judgement and the browser;
- **`kiss-site-new`:** prevention.

**Source.** The evaluation, written in this session before the branch opened and committed with this log as `planning/specs/2026-10-20-design-skills-evaluation.md`. In short:

- **mine for rules:** jakubkrehel (the best), emilkowalski (`mobile-native`), MengTo (`no-ai-design-slop`, `audit-ai-design-slop`) and garden (`web-design-engineer`);
- **ignore:** elayadesign (it invents data), MengTo's `build-awwwards-quality-sites` (GSAP house style) and Owl-Listener (textbook content, with a wrong WCAG threshold);
- **licence:** all six are MIT.

Rules are adapted, not copied.

**Success criteria:**

- [ ] **A plan, critiqued before code.**
  - `planning/plans/2026-10-20-craft-learnings.md` names each rule, where it lands (audit / review / new), how it is measured, and which repo or repos it came from.
  - A fresh-context agent reads the plan adversarially before any `lib/` or skill edit. Its findings are answered in the plan.
- [ ] **Two new audit checks, advisory like the other fifteen.**
  - **`viewport-zoom-lock`:** the written viewport meta carries `user-scalable=no` or `maximum-scale` below 2.
  - **A fragment check:** a bare `href="#"`, or a `#fragment` whose target id is in neither the page it points at nor any page the build wrote. It covers in-page and internal cross-page links, which closes the `#` skip in `lib/links.js` (`:141`, `:206`) for the class, not only `href="#"`.

  Each check:
  - can be ignored through `config.audit.ignore`;
  - has a regression test seen red against the unfixed code, then green;
  - lands in the same commit as its docs: `AIKB/audit.md` (and `AIKB/links.md` if `links.js` changes), `GUIDE.md`, one `llms.txt` index line (within the 16,000-character cap), `README.md` if it lists the checks, the `kiss-build-check` skill's list, and regenerated `types/`.

- [ ] **Every example still builds, and any new finding on one is accounted for.** Each finding is either fixed or recorded here with the reason. Examples whose `AIKB/` records change are re-recorded.
- [ ] **`kiss-site-review` runs as two named passes.**
  - **A usability and best-practice audit.** The craft pass grows from 9 checks to about 18. Each new check:
    - says how it is measured (stylesheet, templates or browser);
    - is built and looked at on a real page before its wording ships. That is the 2026-10-12 feedback: measure a rendering claim before writing it into a skill.

    The report table gains a P0–P3 priority and groups repeated instances into one systemic finding.

  - **A design lift.** In this order:
    1. recorded decisions first;
    2. a one-line design read (the audience, and how bold to go);
    3. two or three proposals with before-and-after screenshots, of which the operator picks;
    4. a protected contract: anchor ids, form field names and URLs do not change silently, and a moved URL gets `aliases`.

    When `frontend-design` is absent, it says so rather than attempting the lift.

- [ ] **`kiss-site-new` builds to the floors.** It lists the build-time subset briefly and points at `kiss-site-review` for the full text, so the two cannot drift. That subset is the focus style, skip link, `aria-current` from `{{isActive}}`, inputs at 16px or more with `autocomplete`, an `svh` hero, named transition properties, hover kept off touch, content visible without JS, and lists checked at 0 and 1 items.
- [ ] **Tests pin the new text.**
  - Every new section or rule gets a `test/unit/skill-coverage.test.js` row, seen red before the text and green after.
  - Any old instruction this branch makes _wrong_ is banned in `CONTRADICTIONS`: for example, check 8's `100dvh` advice for every case, now `svh` for a hero.
- [ ] **The pilot on Pro Plumbing** (`Probert-Family/pro-plumbing`), on a pilot branch there, with kiss packed from this branch.
  - The new `kiss-site-review` runs end to end: both passes, served over HTTP.
  - Its findings table and screenshots are put in front of the operator.
  - The record counts every finding that would have undone a recorded decision, and the wording is adjusted until there are none.
  - Fixes are pushed only to that pilot branch, on the operator's picks. The operator's look, and what was kept, are recorded here. Nothing merges there without them.
- [ ] **Clean room, twice.** Each run uses fresh agents given only the packed tarball, in empty folders, and reports every place it had to guess.
  - **(a)** It runs `kiss-site-review` on a built example: the third clean-room run on that skill, as the 2026-10-12 feedback asked.
  - **(b)** It builds a site from the README's brief, exercising `kiss-site-new`'s floors (the first such run). The result passes `kiss-ssg check`.
- [ ] **A minor bump (2.8.0) with an upgrade note.**
  - The `CHANGELOG.md` entry and `kiss-site-migrate` both say that sites on `^2` will see the two new audit findings, and how to ignore one with a reason.
- [ ] **`npm run gates` is green, and `lib/` gets an independent review.** If no independent reviewer is available in this environment, the close says the branch has none, rather than letting a same-family sub-agent stand in for one.

**Non-goals / out of scope:**

- No companion skill is recommended. The README and docs keep `frontend-design` (and `webapp-testing`) as they are.
- No `skip-link-missing` or `aria-current` audit check. Both stay skill checks, because what counts as one is a judgement.
- No restyle of the examples or of the docs site. The examples' cream-and-clay look is a recorded decision (addendum to the 2026-10-12 log).
- No runnable contrast and target-size checker. The parked control-quality idea stays parked, though this branch covers most of its checkable rules in the skills.
- No changes to the operator's other kiss sites. They roll out after release by migrate, then check, then review.
- Pro Plumbing changes live only on its pilot branch.
- `/memory-consolidate` is not run here (see the inherited feedback below).

**Impact surface:** public API. Audit check ids are public vocabulary (`config.audit.ignore`, the report's `check` field), so two new ones mean a minor bump. Shipped skills change too.

**Expected shape:** planned. The rules and where they land are known; the pilot is expected to amend wording, not direction.

**Delegation convention:** one session writes the engine and skill changes. Fresh sub-agents only:

- critique the plan;
- run the clean-room runs;
- review at the close.

Agents never commit. The operator's look at the pilot is the checkpoint for the design lift.

**Inherited feedback carried in:**

- **Open the branch when the work changes kind** (2026-09-30, 10-12, 10-17: three logs, which triggers a `/memory-consolidate` recommendation, deferred to between branches). This branch was opened at the moment the evaluation turned into a build.
- **Measure a rendering claim before writing it into a skill** (10-12). This is written into the review criterion.
- **Run a third clean-room pass on `kiss-site-review` and a first on `kiss-site-new`'s floors** (10-12). This is written into the clean-room criterion.
- **Ask whether a companion skill's value is its text or what it installs** (10-13). Answered: the text, so the rules come in and no skill is recommended.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-10-20 — three audit ids, not two.** The fragment check is split into `href-hash` (a bare `href="#"`) and `fragment-missing` (a `#fragment` with no matching id). That lets a site that uses `href="#"` on purpose ignore that one shape with a reason and keep the skip-link coverage. With `viewport-zoom-lock`, that makes three ids. Wherever the criteria say "two new audit checks" or "two new audit findings", read three. The critique also raised that `audit.ignore` works per check only. The operator chose **accept and document** over a new per-fragment key.
- **2026-10-20 — craft fixes to the shipped examples, at the operator's choice ("Fix them here").** The new checks, measured, found:
  - no skip link in examples 4 and 12, and no `id` on example 12's `<main>`;
  - blog post body text at 115 characters per line at 1440px wide. The shared stylesheet's `$measure` is the page width (64rem), not a line length, and that file is byte-identical in 11 of the 12 examples.

  The fixes are a skip link with a `<main id>` in 4 and 12, and a `max-width` in `ch` on the post body text in all 11 stylesheet copies, which stay identical. This reverses the non-goal "no restyle of the examples" only for these craft fixes. The cream-and-clay look is untouched.

- **2026-10-20 — baseline, before any change.** `npm test` on the untouched branch: 1 failed of 2,285. The failure is `test/integration/watch.test.js` › "preserves all registered auxiliary outputs when static copies disappear". The same test passed 3 runs out of 3 on its own. That makes it a watch-only failure under the full suite's parallel load, on `main`, and outside this branch's surface. It is recorded for the Known knowns register (`AIKB/rebuild.md`) and not chased, per the dev-watcher rule.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-20, pulse 1 (after the engine).**
  - **Met:**
    - **The plan and its critique:** `afa2f96`, 15 items answered.
    - **The audit checks:** `d1f927b`. Tests were seen red first (23 unit, 1 integration), then green. `npm test`: 2,305 passed; the 1 failure is the baseline watch test. Lint, typecheck and format pass. `llms.txt` is 14,027 characters.
  - **Partial:**
    - **The examples.** Every example and `check docs.js` report no new findings; example 8 exits 1 by design. On the docs build, removing `#host-url-policy` from its page produced 3 findings, two of them relative `../urls/#…` links under the `/kiss-ssg/` prefix and `extensionLess`. The examples' craft fixes are not done yet.
    - **2.8.0.** Only the draft entry and migrate § 0e exist.
  - **Not yet:** skills, pins, pilot, clean rooms.
  - **Drift:** none beyond the two Amendments.
  - **Eyeball: deferred to the pilot.** The operator works from the cloud session and can see only links or screenshots, so Claude gave GitHub links to `GUIDE.md` L1045–1091 and the fix table at `d1f927b`. The operator chose to judge the wording at the pilot, with screenshots. That is where it is tracked.
  - **Offered explanation:** the fragment check names only pages this build wrote (`exists: () => false`). If that is wrong, a fragment on a page from an earlier build or a sibling instance goes unchecked: a missed finding, never a false one. Not taken up.
  - **Lesson for this branch:** anything the operator is asked to look at comes with a link or a screenshot.
  - **Decision:** continue.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
