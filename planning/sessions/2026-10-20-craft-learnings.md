---
branch: ccr-d677d579-ay3if6
base: main
status: closed
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

- **2026-10-21, pulse 2 (after the examples and the skills).**
  - **Met:**
    - **The examples.** Commit `aa02959`:
      - **Skip links in examples 4 and 12, measured.** The first Tab focuses a visible "Skip to content" at 375 and 1440, and the jump lands `<main>` clear of the sticky header.
      - **Example 12's `compare.mjs`** declares the skip link in a new `ADDED` list. It was seen to fail without the declaration.
      - **Line length, measured.** 70ch gave 97 characters a line, so the cap is 54ch, which gives 60–71. The operator saw before-and-after screenshots and chose "keep the cap as shown".
      - Examples 9 and 11 are unchanged against their records.
    - **The two-pass review and the floors.** Commit `ee31dee`:
      - **Coverage rows:** red 7 of 186, then green. The 2.8.0 migrate row's text is absent at `afa2f96`, so it would have been red there.
      - **`{{isActive}}` snippet:** run against the engine, after the drafted `page` argument proved wrong (it is `this`, or `..`).
      - **Dropped by measurement:** `min-width: 0` and `minmax(0, 1fr)`.
    - **The docs.** Regenerated in `ba6ed9e`.
    - **The suite.** `npm test` 2,314 passed. Lint and format are clean.
  - **In flight:**
    - the pilot: a fresh agent runs the new review on a scratch copy of Pro Plumbing's `pilot/craft-review` branch;
    - clean room (b): a fresh agent builds the README bakery brief.
  - **Found on the way: the repo's screenshot harness does not run in the cloud container.** `scripts/screenshot.mjs` launches `playwright-core` 1.64's own Chromium, and the container has only `/opt/pw-browsers/chromium-1194`. Every browser measurement on this branch therefore ran through scratch scripts with `executablePath`. A `--chromium=<path>` option, or honouring `CHROME_PATH` the way Pro Plumbing's `design-review.mjs` does, would close it. That is not done here; it is recorded for the reflection.
  - **Pro Plumbing's check:** it passes with no findings from the three new checks. Its pages read as changed against its record, but that is the stylesheet hash, because the record dates from kiss 2.7.0.
  - **Drift:** none beyond the Amendments.
  - **Eyeball:** the line-length screenshots, looked at. The operator chose to keep the cap.
  - **Decision:** continue to the pilot.

- **2026-10-21, the pilot and the clean rooms.**
  - **Pilot (`Probert-Family/pro-plumbing`, `pilot/craft-review`).** A fresh agent ran the new review from the skill text alone, on a scratch copy, with kiss packed from this branch.
    - **Audit:** clean, including the three new checks.
    - **Findings:** 17 (P0 0, P1 4, P2 8, P3 5).
    - **Recorded decisions:** 13 candidates were dropped as recorded, each record named, and two came back marked "ask". So **no finding would have undone a recorded decision**, which meets that part of the pilot criterion.
    - **Re-derived by Claude:** the headline contrasts (2.78, 2.75, 1.38).
    - **The agent's wording guesses became fixes in `6487748`:**
      - **the big one:** checks 7 and 10 assumed a top header, while the site's sticky bar is at the bottom, where a forward Tab hides controls. Read literally, the old wording would have passed the site;
      - **check 20 at 0:** the agent reported that an empty model fails the build. Re-derived locally, an empty model folder builds; what fails is a page that `{{link}}`s a removed item.
    - **The fixes.** The operator saw the report and the screenshots, then picked 1–14 and 16 plus both lifts. The pilot agent applied them; Claude reviewed the diff and re-measured.
      - **Corrected by that measurement:** the Google card edge. `slate-400` passes on white but is 2.95:1 on the `slate-50` card it sits on on three pages, so it is `slate-500`.
      - **Added by Claude:** a README line, because the unconfirmed privacy line now blocks launch.
      - Pushed to the pilot branch only, in Pro Plumbing's `5f0635e`. Nothing on `main` changes.
  - **Clean room (b), the bakery brief.** `check` ok, exit 0, and every applicable floor met. Two guesses on this branch's wording were fixed in `3389920`: news versus placeholder slots (old sentence banned), and "a singular".
    - **Reported, not chased:** an empty fan-out folder logs a red `Invalid model` while the build passes. That is misleading output; it is recorded for a later branch.
  - **Clean room (a), example 11 from the tarball.** It found this branch's formatting defect: checks 11–20 had been folded into one 5,800-character line, which every gate passed. Fixed in `117dda8`, with a row requiring each check to start a line.
    - **It also re-measured the line length:** 69–79, not the 60–71 recorded. Claude measured all six posts at 60–79 (median 70) and corrected the record.
    - **Still to decide, in example 11 itself:** no empty states (check 20), hand-typed counts ("Four tags"), the alias paragraph at 155 characters a line, the hero paragraph at 74–84, and no hover change on the current nav link. Put to the operator.
    - **Decided: the operator chose "Fix them here".**
      - **Empty states and counts:** measured at 0 and at 1 post in scratch copies.
      - **Counts:** they come from `countOf`.
      - **Line length:** the cap is widened to all running text in `<main>`; post pages now top out at 79.
      - **Current nav link:** it gains an underline on hover and press.
      - **Example 11:** re-recorded.
      - **The suite:** 2,319 passed.
  - **Pro Plumbing merged to `main` (operator's decision, "merge everything as is", markers and all).**
    - **Verified first:** with the site's lockfile kiss (2.7.0, which Netlify installs), `check` was ok with no findings.
    - **Merged:** fast-forward to `5f0635e`.
    - **Re-recorded:** `AIKB/` re-recorded and committed as `49c4fca`, per the site's own `CLAUDE.md`.
    - **Deploy:** Netlify deploys `main` on push, so the fixes, both lifts and the marked privacy line are live once that build finishes. The deploy itself was not observed from here.
  - **Where the branch stands.** Every criterion has evidence except the close itself: the gates, an independent review of `lib/`, and the version number. The operator will ask for `/branch-close`.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-10-21: design and usability learnings, brought into kiss

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** kiss-ssg 2.8.0 on `ccr-d677d579-ay3if6`. The branch is 19 commits, from `5fc254e` to `5adb6ed`:

- three audit checks, `viewport-zoom-lock`, `href-hash` and `fragment-missing` (`d1f927b`, hardened in `5adb6ed`);
- `kiss-site-review` as two passes: a usability and best-practice audit with 20 measured craft checks and P0–P3, then a design lift (`ee31dee`, `6487748`, `117dda8`);
- `kiss-site-new` floors (`3389920`);
- craft fixes to the examples (`aa02959`, `4a11ced`).

Separately, Pro Plumbing's `main` gained the operator's picked fixes and both lifts (`5f0635e`, `49c4fca` in that repo).

## Reflect — what the session was

It began as a question: "evaluate these six skill repos". It turned into a build two turns later, when the operator asked how the learnings would come into kiss. The branch was opened at that moment, before any edit. That is the "open the branch when the work changes kind" lesson, which had recurred in three earlier logs, finally applied at the right point.

The shape was **planned**:

- a plan, then a fresh-context critique;
- the engine;
- the skills;
- a pilot on a real site;
- clean rooms;
- the close.

Each stage amended the plan's _wording_, as the intent predicted, and never its direction. The planned shape served the work. Every Amendment came from evidence:

- the critique split one check into two ids;
- measurement caught the examples' gaps;
- the pilot and the clean rooms found wording defects.

## Evaluate — how the human supervised the AI

**Problem framing, strong.** The operator supplied the scope decisions that shaped everything, each one in a word:

- take the learnings, not the skills;
- the two hook points (the operator remembered "new or review", and Claude added the audit as a third);
- skills and engine together;
- no companion skill;
- Pro Plumbing as the pilot.

It took three structured questions at the open, and each answer removed a branch of work.

**Verification & ownership: the operator verified what was shown, and that shaped the rule this session leaves behind.** The first pulse asked the operator to look at GUIDE wording. Their answer, "It's in a cloud environment so you can have to provide a link or screenshot", was the session's most useful correction. From then on every look came with a link or a screenshot:

- **line length:** before and after;
- **the Pro Plumbing report:** the findings table plus the lift shots;
- **the final home page:** before the merge.

Each was answered in a sentence and changed what shipped. The operator kept the cap, picked all 14 fixes and both lifts, and chose to merge with the privacy markers visible. The GUIDE wording was deferred to the pilot and then called "Settled" without a look, because Pro Plumbing triggered none of the new checks. That is honest, but it means the three new GUIDE rows were never read by a human.

**Pushback & steering: Claude's own claims were corrected by measurement more often than by the operator.** The operator's steering was by choice, not by challenge: every `AskUserQuestion` was answered, usually with the recommended option. Corrections came from the evidence loop the branch was built around:

- The critique found five blockers, including the `resolveTarget` directory bug, before any code existed.
- Measurement overturned three drafted claims:
  - forward Tab "never hides" focus, which is true only for top bars;
  - `min-width: 0` as a fix;
  - `70ch` as about 70 characters (it measured 97).
- The pilot found the top-header-only wording, which would have passed Pro Plumbing. The clean room found checks 11–20 folded into one line, which every gate passed.
- Re-measuring found that the recorded "60–71" was one paragraph; the true range is 60–79.

Twice Claude verified a peer's relayed claim and found it **wrong**: the "empty model fails the build" claim and the cream-and-clay addendum. That is the CLAUDE.md rule on peer claims working as written.

**Harness leverage, high.** Parallel read-only agents evaluated the six repos. Fresh agents did:

- the plan critique;
- the pilot (and then applied the picked fixes in the real repo);
- two clean rooms;
- the close's review.

`AskUserQuestion` was used at every fork. The cost was real: three worker restarts mid-session, survived through the committed session log and an early commit habit.

**Where the human intended to supervise, versus where they did.** The operator intended to supervise the look and the scope, and did, through screenshots. The **independent review** is the checkpoint nobody held. Codex is not installed in this container, so the branch's only `lib/` review was a same-family agent. It found four real false positives. The fix for them (`5adb6ed`) was then reviewed by no one but its author.

**Competency level: Active supervisor.** The operator framed scope precisely, decided every fork, verified every artefact they were shown, and steered by evidence. They stopped short of agentic engineering lead because they did not challenge Claude's reasoning directly or ask for an explanation, and the independent review gap was accepted rather than closed.

## Feedback — recommendations for next session

- **Operator — read the three new GUIDE rows before publishing 2.8.0.** They are what every site meets when the audit fires, and no human has read them. GUIDE.md § Checking a build, "What `fragment-missing` can and cannot see".
- **Operator — get an independent review of `lib/audit.js` before the publish**, from Codex on your machine (`/codex:review` against `main`). The unreviewed range is `5adb6ed`, plus everything a same-family agent reviewed. Four false positives in a reviewed diff is a signal that a second reader finds things.
- **Claude — in the cloud harness, every "look at this" is a link or a screenshot, from the first ask.** A request to "look at GUIDE.md" cost a round trip. Send a GitHub permalink at a commit with line anchors, or a `SendUserFile` screenshot.
- **Claude — measure across every page of a template, not one sample.** "54ch gives 60–71" was written from one paragraph and was wrong at 79. Check 19 now says so. Apply the same rule to any range written into a doc or a comment.
- **Process — `scripts/screenshot.mjs` cannot run in the cloud container.** It wants `playwright-core` 1.64's Chromium; the container has `/opt/pw-browsers/chromium-1194`. This branch wrote five scratch measurement scripts as a result, the duplication that script exists to end. Honour `CHROME_PATH` (as Pro Plumbing's `design-review.mjs` does) or add `--chromium=<path>`, with a test.
- **Process — run `/memory-consolidate` before the next branch.** Two triggers are at or near firing:
  - "open the branch when the work changes kind" recurred in three logs (2026-09-30, 10-12, 10-17);
  - four logs now lack `consolidated:`.
- **Process — an empty model folder logs a red `Invalid model` while the build passes.** Both a clean room and the pilot read it as a failure. Make the message say the fan-out built zero pages, on a later branch.

## Verdict — did we achieve the objective?

**The brief:** fold the checkable lessons from six design-skill repos into kiss, in three places (the audit, `kiss-site-review` and `kiss-site-new`), with no new companion skill, piloted on Pro Plumbing. **Met.** The objective moved twice, both times on the operator's call and recorded as Amendments: three ids instead of two, and the examples' craft fixes. Both were good drift.

- [x] **A plan, critiqued before code.**
  - `afa2f96`: 15 items, the blockers re-derived and answered.
- [x] **The audit checks.**
  - Three ids, each seen red before green.
  - Docs, `llms.txt` (14,027 / 16,000) and `types/` in the same commit, `d1f927b`. Hardened in `5adb6ed`.
- [x] **Every example still builds, and new findings are accounted for.**
  - No new audit findings on any example or the docs site.
  - The craft gaps found by measuring were fixed on the operator's choice.
  - Example 11 was re-recorded; example 9 is unchanged.
- [x] **`kiss-site-review` in two passes.**
  - 20 checks, each rendering claim measured, or stated as not measurable here.
  - P0–P3 and one row per cause.
  - The lift: decisions first, the read, preserve mode, a scratch copy, the protected contract.
- [x] **`kiss-site-new` floors**, pointing at the review.
- [x] **Tests pin the new text.**
  - Rows seen red: 7 for the skill text, 3 for the pilot's fixes, 1 each for the folded list and the news rule.
  - Three `CONTRADICTIONS` bans.
- [x] **The pilot on Pro Plumbing.**
  - 17 findings, none that would have undone a recorded decision.
  - The operator saw the report and the screenshots and picked the fixes, which were applied and re-measured.
  - Merged to its `main` at the operator's request.
- [x] **Clean room, twice.**
  - (a) Example 11 from the tarball found the folded list and the line-length record.
  - (b) The bakery brief passed `check` and every floor that applies.
  - Their guesses were fixed.
- [x] **2.8.0 with an upgrade note.** `60e7734`; CHANGELOG and `kiss-site-migrate` § 0e.
- [ ] **An independent review of `lib/`.**
  - `npm run gates` is green.
  - No independent review: Codex is not installed here. A same-family agent reviewed `lib/` and its four findings are fixed in `5adb6ed`, which no one else has reviewed.

**What is concretely better.**

- **For every kiss site on `^2`,** after upgrading:
  - a zoom lock, a dead `#` link or a broken skip link is reported on every build;
  - a review now measures 20 usability checks and offers a lift that cannot rewrite the owner's content.
- **For Pro Plumbing, live:** its focus ring, control edges and call-bar focus pass WCAG, and it has the two lifts.

**Still open:**

- the independent review;
- Greg's privacy-line answer;
- the screenshot-script gap;
- `/memory-consolidate`.
