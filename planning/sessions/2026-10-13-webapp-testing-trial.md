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

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
