---
branch: chore/webapp-testing-trial
base: main
status: closed
opened: 2026-10-13
---

# Session — 2026-10-13: Trialling Anthropic's `webapp-testing` skill

## Intent (captured at /branch-open)

**Objective:** Find out whether Anthropic's `webapp-testing` skill makes `kiss-site-review`'s browser pass (step 3), and `kiss-site-import`'s side-by-side check, actually run and find more. If it does, recommend it beside `frontend-design` in the README and on the docs site. Also give this repo a tested screenshot script, so its own browser checks stop being rewritten per session.

**Success criteria:**

- [ ] **The trial is measured on a site with known answers.** Example 11 is copied to the scratchpad and given 3–4 planted defects that only a browser shows, for example:
  - overflow at 320px;
  - a link with no visible hover or press change;
  - an unbroken long string.

  Two fresh sub-agents then run `kiss-site-review` on it, one with `webapp-testing` available and one without. For each run, the record says:
  - whether step 3 ran;
  - which planted defects it found;
  - which skills it called;
  - whether it ever used `file://`;
  - every setup step and friction it hit. Python Playwright was not installed on this machine at the open.

- [ ] **A verdict is recorded with that evidence, and the operator decides** whether to recommend the skill.
- [ ] **If the verdict is yes:**
  - `kiss-site-review` and `kiss-site-import` get a handoff line: when `webapp-testing` is available, serve the build folder as the site root over HTTP, never `file://`. The skill's own decision tree points static HTML at `file://`.
  - Each handoff line gets a `test/unit/skill-coverage.test.js` row.
  - The README's optional-skill paragraph names it. It comes in the same `example-skills` plugin as `frontend-design`, so no new install lines are needed. The paragraph says what it requires (Python, Playwright, Chromium).
  - The docs site gets a short passage on optional companion skills, covering both skills. Its commands have been run for real.
- [ ] **Clean-room check (if yes):** a fresh agent given only what ships, plus `example-skills`, reviews a site, and its browser pass runs over HTTP with the build folder as the root.
- [ ] **A repo screenshot script.** The 2026-10-12 feedback asked for it.
  - It lives in `scripts/`. It serves any build folder on port 0 over HTTP, never `file://`, and shoots the pages, widths and colour schemes it is given.
  - It has a `test/unit/` test.
  - It replaces the per-session scratch copies.
- [ ] `npm run gates` passes.

**Non-goals / out of scope:**

- No `lib/` change.
- `init` does not declare `example-skills`.
- The other example skills are not evaluated.
- No restyle of anything.

**Impact surface:** tooling & docs, patch bump. The changes are skills, README, the docs site and a `scripts/` tool. No API change.

**Expected shape:** between planned and emergent. The trial and the script are planned. What ships in the skills and docs depends on the trial's verdict.

**Delegation convention:**

- The main session briefs and reviews.
- The two trial runs and the clean-room run are fresh sub-agents, which may write only in the scratchpad.
- Agents never commit.

### Amendments

- **2026-10-13 — the trial arms are headless `claude -p` sessions, not sub-agents** (operator's decision at the first pulse). Arm B has to _discover_ `webapp-testing` as an installed skill, and in this session it is not installed. Both arms run in the trial site with `--setting-sources project`, so the operator's user-scope plugins stay out of the run and only the site's own kiss plugins load. Arm B adds the cached `example-skills` plugin with `--plugin-dir`, which loads it for that session only. Nothing is installed and no settings are written, so the 2026-09-27 cache overwrite cannot repeat. A `playwright-core` devDependency for the screenshot script was also the operator's decision.
  - **Correction, as the arms actually ran:** both used `--setting-sources local`, not `project`, and loaded kiss-ssg itself with `--plugin-dir` from this working tree. The working-tree copy is byte-identical to the 2.7.6 cache. So neither the site's declaration nor the user's settings decided what loaded. Both arms also ran with `--no-chrome` and `--strict-mcp-config`.
  - The Bash allow-list leaked: a command beginning `cd … &&` ran whatever followed it (`npm init`, `rm -rf public`, a `cat >` heredoc). Every effect stayed inside the arm's own site copy.
- **2026-10-13 — trial result, and the operator's verdict: recommend it anyway.**
  - **Arm A** (kiss-ssg only) found all four planted defects. It installed `playwright-core` into `review-scratch/` by itself, drove the system Chrome, served `public/` over HTTP and never used `file://`. 25 turns, $1.26.
  - **Arm B** (plus `example-skills`) also found all four. It **never invoked or read `webapp-testing`**: the skill's only appearance in the transcript is the start-up list of skills. It used the Python Playwright installed for this trial, served with `python -m http.server`, and never used `file://`. 31 turns, $1.22.
  - Claude recommended no recommendation, because there was no measured gain. The operator chose to recommend it anyway, which is their call. The trial measured _reviewing_, while the original case for the skill was Playwright helping an agent _build_ sites, and that was not measured.
  - So criteria 3 and 4 are live. The clean-room run becomes an arm C: arm B's setup plus the new handoff lines, checking that a browser pass runs over HTTP with the build folder as root.
- **2026-10-13 — fix the shipped examples' defects the trial found** (operator's decision: "Fix on this branch").
  - **The `.hero p` / `.eyebrow` specificity bug, in all 11 copies of the shared stylesheet.** The 2026-10-12 log says it was fixed with `p:not(.eyebrow)`. A grep finds that selector nowhere in `examples/` or `src/`, so the log's claim was wrong. Arm A measured the bug in Chrome on the trial copy, whose rules for those selectors are unchanged from the shipped file.
  - **The "1 posts" plural** in the tag templates.
  - **The sticky-header band at 548–560px:** the header wraps to 114px against 88px of `scroll-padding-top`.
- **2026-10-13 — `kiss-site-new` gets a handoff line too** (operator's decision). The case for the skill is building, and `kiss-site-new` had no browser step. It now looks at each template at 320, 768 and 1440 before the hand-over, when the skill is available.
- **2026-10-13 — two measured upstream defects shape the handoff lines** (recorded in `AIKB/upstream.md`).
  - `webapp-testing`'s static-HTML route uses `file://`.
  - Its `with_server.py` left `npm run dev` listening on Windows after "Server 1 stopped", two runs out of two. Claude stopped both orphans; they were its own processes.
  - The lines therefore say: serve over HTTP, start and stop the server yourself, and read the site's own port.
- **2026-10-13 — the docs home page overflowed at 320px, on `main` too.** Found while measuring the new band.
  - The cause was the import prompt's unbroken artifact URL in `.prompts__text`, pinned by hiding sections one at a time. It is fixed with `overflow-wrap: anywhere`.
  - **Also found:** a shot of `docs/` is styled by the _live_ site's CSS, because the production build links its assets absolutely. So the fix measured "still 42px" until `.preview/` was shot under `node docs --dev`. The screenshot script's header and `CLAUDE.md` now say so.
- **2026-10-13 — the wording says what was measured** (operator's decision, after arm C). In three runs `webapp-testing` was never invoked, even with `kiss-site-review` naming it; the browser came from Playwright itself. So the README, the docs copy and the `kiss-site-review`/`kiss-site-import` lines call it a Playwright recipe and say the installed browser is what matters. They no longer say the skill "gives the agent a browser".
- **2026-10-13 — the docs copy moved into setup** (operator's eyeball). It is no longer a band of its own. It is a collapsed `<details>` inside the Claude Code box in step 1, headed "Optional Anthropic skills for design and testing", and only in that box, because it is a Claude Code plugin. The box's Copy still copies only its six setup lines, and the test pins that.

## Pulse log

- **2026-10-13** — Criterion 1 is **partial**.
  - The planted site (`scratchpad/trial-site`, example 11 from the packed 2.7.6 tarball, plus `init`) has four defects, each measured in Chromium:
    - D1: the post page overflows by 352px at 320px wide, from an unbreakable URL;
    - D2: nav hover changes only `text-decoration-thickness` on a link that has no underline;
    - D3: dark-mode meta text is 2.45:1 (it was 7.10:1);
    - D4: `/blog/tags/` overflows by 36px at 320px wide.
  - Shipped example 11 is clean on all four. `check` and the audit catch none of them.
  - The agent runs are not yet done.
- Criterion 5 is **partial**. `scripts/screenshot.mjs` passes its 19 tests, the traversal test was seen red, and the script was used for real on two sites. Hover and contrast still needed a scratch script.
- Criteria 2–4 depend on the verdict. Criterion 6 (gates) is left to the close.
- No drift.
- **Eyeball: looked** — "overflow visible" on `trial-shots/blog_grind-size-is-the-dial--320-light.png`.
- **Explained:** D1 is findable only in a browser, because the stylesheet comment still says URLs break. The operator chose "Keep it", so D1 is scored as "did a browser run" and D2–D4 as judgement.
- Decision: **record amendment, then continue** to the two trial arms.
- **2026-10-13 (second pulse)** — Criteria 1–5 are **met**. Criterion 6 is left to the close.
  - Arms A and B: 4/4 each.
  - Arm C, the clean-room run with the handoff lines plus `example-skills`, found 4/4.
    - It served `public/` over HTTP with `python -m http.server`, never used `file://`, stopped its server and confirmed nothing was listening, and checksummed the site's 34 files as unchanged. 27 turns, $1.31.
    - It did **not** invoke `webapp-testing`: "I wrote my own Playwright script, following the review skill's guidance". So the wording was changed; see the Amendments.
    - It independently found the three example bugs already fixed on this branch (its copy predates the fixes).
  - Both documented install lines were run in a scratch folder: a session listed `example-skills:webapp-testing`, and `uninstall --scope project` removed the registry entry. The marketplace step said "already on disk", because the operator had added it at user level, so nothing was cloned.
  - `npm test`: 2282 passed. Lint is clean.
  - **Drift:** the docs move and the wording change were both the operator's calls, recorded as Amendments. The impact surface is unchanged (tooling & docs; skills, README and examples ship, with no API change): **patch**.
  - **Eyeball: looked** at the band on the live preview: "optional should be under 1b … in the Claude Code white box, but collapsible". After the move: "much better, but the text should say 'optional anthropic skills for design and testing'". Done.
  - Decision: **ready to close**.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-10-13: Trialling `webapp-testing`, and what the trial found instead

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** 2.7.7, 17 commits on `chore/webapp-testing-trial`.

- `476b553` — a tested browser harness, `scripts/screenshot.mjs`.
- `81bd5a7` — three fixes to the shipped examples.
- `b24a660` and `fc5f67d` — `webapp-testing` recommended, with handoff lines in three skills and its two defects recorded in `AIKB/upstream.md`.
- `3402927` — the docs home page's 320px overflow fixed.
- `a3a6c6b` — `npm run dev` for the docs preview.
- `55c8689` — the version bump.

## Reflect — what the session was

**The framing.** The operator came in with a claim and a question: "we should also recommend the webapp testing skill … Do you agree". Claude's first answer, from reading the repo and the skill, corrected two of its premises before any work started:

- the docs site did not recommend `frontend-design` at all; only the README did;
- `webapp-testing` already ships in the `example-skills` plugin that the README tells people to install.

That turned "add a line" into "find out whether it helps", which is what `/branch-open` then captured. The criteria named a measurable trial, and the operator chose its shape: a planted site with known answers, Playwright installed on the machine, and the screenshot harness pulled into scope.

**The shape:** between planned and emergent, as declared, and the shape served the work. The trial was planned and ran as planned. Everything after it was emergent, and it was more valuable than the question that started it:

- the trial's own agents found three real defects in the examples;
- measuring the new docs band found a fourth, on the live docs home;
- measuring `with_server.py` found an upstream defect on Windows.

Each was recorded as an Amendment before it was built.

## Evaluate — how the human supervised the AI

**Pushback & steering** was the operator's strongest dimension, and twice it went _against_ Claude's recommendation.

- **"Recommend it anyway."** The trial measured no gain: 4/4 in both arms, and the skill was never invoked. Claude recommended no recommendation. The operator overruled, with a reason Claude had to infer: the case for the skill is _building_, and the trial measured _reviewing_. That was a legitimate call, and the session then made the most of it.
- **The docs placement.** At the pulse look the operator said "optional should be under 1b … in the Claude Code white box, but collapsible". A separate band Claude had built and screenshotted became a collapsed `<details>` in setup step 1. Then the heading wording was corrected.

Both are the human steering from judgement Claude did not have. The first is also a decision whose evidence Claude kept in front of the operator rather than burying:

- Arm C's result ("I wrote my own Playwright script") was raised as an `AskUserQuestion` before the close;
- the operator's answer, "say what was measured", changed the README, the docs copy and two skills to stop claiming the skill "gives the agent a browser".

**Verification & ownership** was strong, and mostly carried by evidence rather than by Claude's say-so:

- Every planted defect was measured in Chromium against a clean control before any agent ran (`verify-d2-d3.mjs`: 2.45:1 against 7.10:1).
- Every coverage row and the new home test were seen red before green.
- The traversal test was seen red against a naive server, which showed that the first draft, using `fetch`, could never have failed.
- The operator looked twice at pulses: the 320px shot, then the live preview.

The weak spot was Claude's own. It wrote "kiss's dev server binds 127.0.0.1:3001" into its first `with_server.py` probe without checking example 11's port, which is 3011. The run "failed", and only a follow-up probe caught the orphan the run had left. The same pattern appeared twice more, each caught by measurement rather than by care:

- the default output folder would have shipped inside `examples/`;
- `docs/` was being measured against the live site's CSS.

**Iteration discipline:** good. There were two pulses, the first at the slice boundary promised at the open, with the operator's look and an explanation offer. Each scope expansion became an Amendment at the moment it happened, which answers the 2026-10-12 feedback ("an Amendment that adds work also adds a pulse"). The second pulse came only after four Amendments, though: the docs band, the upstream finding, the docs overflow and the wording change all landed between the two.

**Harness leverage:** the session's distinctive feature. Headless `claude -p` runs in isolated copies made the trial real:

- `--setting-sources local`, `--plugin-dir`, `--no-chrome` and `--strict-mcp-config`, so the only variable was the skill;
- stream-json transcripts, summarised by a script.

This was the 2026-09-27 lesson applied: name the machine-wide effects (`--plugin-dir` is session-only) before asking. One miss, which Claude found itself and reported: the Bash allow-list leaked through `cd … &&`. It did no harm, but the sandbox was weaker than Claude had told the operator.

**Learning engagement** was light, which is normal for a branch this operational. The operator took one offered explanation (the D1 plant) and engaged with the decision, not with the code.

**Intended against actual supervision:** they matched. The operator meant to decide the verdict, the placement and the version, and did all three, each through a question. The one checkpoint Claude's momentum could have carried past was the recommendation wording after Arm C, and it was raised instead.

**Competency level: Active supervisor**, edging toward agentic engineering lead on the workflow side. The trial design (planted defects, a control, isolated arms) and the screenshot script are reusable system improvements, but they were Claude's proposals that the operator approved, not designs the operator drove.

## Feedback — recommendations for next session

- **Operator — when you overrule a measured result, say the reason in a sentence.** "Recommend it anyway" was right, but Claude had to infer _why_ (building, not reviewing) and wrote that inference into the log and the changelog. Had the reason been different, three files would carry the wrong rationale.
- **Claude — read a port, a path or a stylesheet's source before measuring through it, not after the measurement looks wrong.** Three times this branch a measurement first answered a different question:
  - `with_server.py` on 3001 against a site on 3011;
  - `docs/` loading the live CSS;
  - the element-rect scan missing text overflow.

  Each was caught, but by a second probe. The rule "a conclusion needs its exit code and stderr" has a sibling: a measurement needs its target confirmed.

- **Claude — check a scratch allow-list before vouching for it.** The trial's `--allowedTools` patterns were described as a sandbox, and `cd … &&` walked through them. Next time, run one disallowed command through the pattern first, or describe it as best-effort.
- **Process — `kiss-ssg init` leaves an existing `"type": "commonjs"` alone,** so a folder set up with `npm init -y` builds nothing until someone edits it. That was found setting up the trial site (2026-09-27 found the same from the skill side). It is worth a branch: `init` could warn, or set it when it owns the build script.
- **Process — the trial harness is reusable.** That is `run-arm.sh`, `summarise-arm.mjs`, the planted-site recipe and the probe prompt, all in this session's scratchpad. Any skill trial ("does skill X change what an agent does?") could start from it rather than rebuild it. If a third trial happens, promote it to `scripts/`.
- **Both — three runs, zero invocations is a finding about skills in general, not only this one.** A named third-party skill was ignored when the kiss skill already said enough. Before recommending another companion skill, ask whether its value is the skill text or what it installs.

## Verdict — did we achieve the objective?

**The brief:** find out whether `webapp-testing` makes `kiss-site-review`'s browser pass and `kiss-site-import`'s side-by-side check run and find more. If it does, recommend it beside `frontend-design`. Also give the repo a tested screenshot script.

**Verdict: met, with the objective moved by the operator, and that was good drift.** The trial's answer was "it does not find more, and it is not invoked". The operator recommended it anyway, for building. Every recommendation now says what was measured, and the trial's by-products (four real defects, one upstream defect) are worth more than the recommendation.

- [x] **The trial is measured on a site with known answers.**
  - 4 planted defects, each measured in Chromium against a clean control.
  - Arms A and B: 4/4 each. B never invoked or read `webapp-testing`.
- [x] **A verdict is recorded with that evidence, and the operator decides.** Claude recommended "no recommendation", and the operator chose "recommend it anyway" (Amendments).
- [x] **If yes: the handoff lines, coverage rows, README and docs site.**
  - `kiss-site-review`, `kiss-site-import` and `kiss-site-new` (the last added by the operator) have their lines, with 3 coverage rows seen red.
  - The README has a paragraph with the pip lines.
  - The docs home has a collapsed section in the Claude Code box, with a test that ties its commands to the README.
  - The install lines were run in a scratch folder and uninstalled.
- [x] **Clean-room check:** arm C used only what ships plus `example-skills`.
  - It found 4/4, served `public/` over HTTP and never used `file://`.
  - It stopped its server and confirmed it was stopped, and its checksum showed the site unchanged.
  - (It also did not invoke the skill.)
- [x] **A repo screenshot script:** `scripts/screenshot.mjs`, with 19 tests. It replaced the scratch copies for status and overflow. Hover and contrast still took scratch scripts, so it does not cover everything a review needs.
- [x] **`npm run gates`** passed: test, lint, typecheck, format (54 files), pack (312 files).

**What is concretely better:**

- Every example's eyebrow renders as designed. The 2026-10-12 log claimed a fix that was never in the code.
- No example lands an anchor jump under a two-row header.
- The docs home no longer scrolls sideways on a phone.
- Agents on consuming sites are told the three ways `webapp-testing`'s defaults break a kiss site.
- This repo has one tested browser harness.

**Still open:**

- the `init` / `"type": "commonjs"` gap;
- a screenshot-script mode for computed styles (hover, contrast), so the next review needs no scratch script;
- the 2026-10-12 log's false "fixed" claim stays as written. It is a dated record, corrected here, not edited.

**Independent review:** none. No `lib/` or `bin/` changed, so the Codex review was skipped by the ritual's rule. The checks were the gates and three clean-room agent runs, which are evidence about behaviour, not a review of the diff.
