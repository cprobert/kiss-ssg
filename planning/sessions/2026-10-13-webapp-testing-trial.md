---
branch: chore/webapp-testing-trial
base: main
status: open
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
