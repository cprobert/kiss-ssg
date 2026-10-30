---
branch: feat/kiss-writing-for-the-web
base: main
status: open
opened: 2026-10-30
---

# Session — 2026-10-30: kiss-writing-for-the-web, the first domain skill

## Intent (captured at /branch-open)

**Objective:** Add the first domain skill, `kiss-writing-for-the-web`, to the `kiss-ssg` plugin, and make `kiss-site-new` and `kiss-site-review` call it instead of restating copy rules, so that each area of web expertise lives in one skill that an expert can review.

**Background.** The skill is ported from a user-level `writing-for-the-web` skill built and tested in an internal-medicine session on 2026-10-30. Its sources: an evidence report (NN/g, GOV.UK, Baymard, W3C/WCAG, Google Search Central, Content Design London) and patterns adapted from the MIT-licensed Humanizer skill (github.com/blader/humanizer). Two rounds of with/without tests there showed one consistent effect: without the skill, the agent invented unbracketed facts in most cases; with it, unknowns became placeholders.

**Operator's decisions, with reasons:**

- **The domain skills go inside the `kiss-ssg` plugin, not a new plugin** (against Claude's recommendation). Reason, in the operator's words: users should not have to install several plugins; "the idea that we provide a set of skills that help you build better websites is the core of what I want to build here". `kiss-memory` stays separate because it does a different job.
- **Separation of concerns:** task skills (`kiss-site-new`, `kiss-site-review` and the rest) do the kiss mechanics and call domain skills for the expertise, so a writing expert can review the writing skill and an SEO expert the SEO skill.
- **Five domain skills are planned:** writing for the web, SEO, accessibility (its own skill, on Claude's recommendation), HTML and technical best practice, and design.
- **Names are plain English, for discoverability** (`kiss-writing-for-the-web`, `kiss-seo`, `kiss-accessibility`, `kiss-html`, `kiss-design`). The operator rejected thing-action for these. Open: `kiss-html` or `kiss-html-and-performance`.
- **Tests use kiss's own examples only.** The repo is public, so the internal-medicine tests on Learna pages stay private.

**Success criteria:**

- [ ] `plugins/kiss-ssg/skills/kiss-writing-for-the-web/` has a `SKILL.md` and references ported from the user skill, with a "where copy lives in a kiss site" section that points at `GUIDE.md` rather than restating it, credit lines for Humanizer (MIT) and the research sources, and no Learna content.
- [ ] The copy rules live once: `kiss-site-new` (invented facts, placeholders) and `kiss-site-review` (demo and scaffold copy) call the skill by name, in build and review mode. `test/unit/skill-coverage.test.js` rows pin this, each seen red before the edit, and `CONTRADICTIONS` rows ban the old sentences.
- [ ] `llms.txt` names the skill and stays at or under 16,000 characters; the plugin README, the root README and the plugin's description list it.
- [ ] `CLAUDE.md` records the naming rule: a task skill is thing-action, a domain skill has a plain name.
- [ ] Tests on kiss's own `examples/`, kept in `test/skills/` outside the shipped plugin folder, run with and without the skill, with the results recorded.
- [ ] The description's triggering is measured, with near-misses against `kiss-site-review` and `kiss-site-new`.
- [ ] Clean room: a fresh agent, given only what ships plus the plugin, builds a small site with `kiss-site-new` in an empty folder. Unknown facts become visible placeholders, `kiss-ssg check` passes, and the agent reports every place it had to guess.
- [ ] `planning/plans/2026-10-30-domain-skills.md` sets out the five-skill structure, the names and the order of the later branches, and a fresh agent critiques it before work depends on it.
- [ ] `npm test` is green, and Codex reviews the branch independently before the close.

**Non-goals / out of scope:** the other four domain skills; moving the accessibility, HTML and design rules out of `kiss-site-review`; any `lib/` change; the README's stance on design; the sites in `C:\code\kiss`, which are test material only and are not changed.

**Impact surface:** tooling & docs — skills, `llms.txt`, README and `CLAUDE.md`; no `lib/` change, so a patch bump.

**Expected shape:** between — the destination is known; the split with `kiss-site-new` and `kiss-site-review` will become clear as the work goes.

**Delegation convention:** this session briefs and reviews. Sub-agents run the tests, the clean-room trial and the plan critique; Codex does the independent review. Agents never commit.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-10-30 — the groundwork joins this branch (operator agreed).** The plan's critique showed criterion 2 cannot be met with the tests as they are: a CONTRADICTIONS ban runs on every shipped file, so it would ban a moved sentence in its new owner too. So this branch also builds, each seen red first: file-scoped CONTRADICTIONS entries; `plugin-manifests.test.js` checking every `.md` in a skill folder, relative links and the real packing rules; the shared `plugins/kiss-ssg/skills/kiss-site-review/review-protocol.md`, cut out of `kiss-site-review`; and a check of the trial case folders. Details: the plan's rules 4, 9 and 10.
- **2026-10-30 — `kiss-page-add` and `kiss-site-import` call the skill too (operator agreed).** One call each: `kiss-page-add` when writing a page's model and view, `kiss-site-import` when lifting copy into models (keep every fact, invent none).
- **2026-10-30 — one floor line for agents without skills.** Measured: `llms.txt` § Building a site well carries none of `kiss-site-new`'s floors, so agents without plugin skills never see the rule against invented facts. This branch proposes one habit line for it, within the `llms.txt` budget (plan rule 7).
- **2026-10-30 — the rules audit, and a lean finish (operator's decisions).** The operator asked whether the repo's rules "haven't slipped in by AI" and whether the branch was following rules that "don't make sense". A read-only agent traced fourteen of them (`planning/specs/2026-10-30-rule-provenance.md`): two are the operator's own decisions (the version policy, architectural elegance), and most of the rest were promoted into `CLAUDE.md` by `/memory-consolidate` with no recorded operator approval. This branch had followed several of them, and had added more of that machinery itself (`allowedIn`, `e64f1a2`). The operator chose:
  - **finish this branch lean:** keep the skill, the review protocol and the task-skill calls; add no more regex coverage rows or CONTRADICTIONS; leave `allowedIn` for the rules review to judge; finish the READMEs, the naming note and one real trial of the skill on a kiss example; skip the AI-derived rituals (the triggering measurement, the clean room, further pulse writing) unless he asks. Criteria 5, 6 and 7 are dropped on that basis, and criterion 9's Codex review stays only if he asks for it;
  - **the rules are reviewed on a later branch, rule by rule, by him:** keep, cut or reword each, and `/memory-consolidate` no longer promotes a lesson into a rule without his explicit yes.
- **2026-10-30 — the HTML skill's name is open.** The operator finds `kiss-html` too generic and proposed `kiss-best-practice`. Claude's concern: every domain skill is best practice, so the name says how good the advice is rather than what it covers, and it would compete with the other four for a match; Claude suggested `kiss-front-end`. Decided on that skill's branch.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-30 — pulse 1, after the plan.** Criterion 8 (the plan, critiqued): written and committed (`c78c5b0`); a fresh Codex session reported 1 blocker, 6 major and 1 minor finding, Claude re-checked the four measured ones against the files (all held) and answered all eight in the plan. Criteria 1–7 and 9: not started. One of Claude's own numbers was wrong and the critique caught it: `llms.txt` is 15,938 characters by the test's measure, not 15,997 (bytes). Decision: **adjust** — the groundwork and the two extra calls are recorded as amendments above; next is the groundwork, starting with file-scoped CONTRADICTIONS. — Claude, with the operator's two answers.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
