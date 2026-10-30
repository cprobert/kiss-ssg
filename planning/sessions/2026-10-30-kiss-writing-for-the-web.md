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

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
