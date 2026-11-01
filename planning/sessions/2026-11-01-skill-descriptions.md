---
branch: chore/skill-descriptions
base: main
status: open
opened: 2026-11-01
---

# Session — 2026-11-01: kiss skill descriptions to one budget

## Intent (captured at /branch-open)

**Objective:** Shorten every kiss-ssg and kiss-memory skill description to one budget — what it does, its trigger phrases, what it is not for — so the skill list every session on a kiss site loads costs less and stays inside the listing budget, without losing routing (from `/doctor`, 2026-11-01: 18 descriptions, about 2,970 est. tokens on a site, five over 750 characters).

**Success criteria:**

- [ ] Every `plugins/*/skills/*/SKILL.md` description is at or under one character cap, and a test in `test/unit/` holds them to it (seen red against today's descriptions).
- [ ] The total listing cost of the two plugins drops by at least a third, measured by the same count `/doctor` used.
- [ ] Routing kept: the 2026-10-31 trigger tasks (review, SEO, page, keyboard; on a1k9training, pro-plumbing, k9-solutions) re-run headless with a turn cap against the trimmed plugin pick the same top-level skill as before, 12 of 12; plus a few near-miss prompts for the domain skills (one per domain) that should route to it. Results recorded with costs, one run per prompt, as a signal.
- [ ] No trigger phrase that `test/unit/skill-coverage.test.js` or a task skill depends on is lost; gates green.

**Non-goals / out of scope:** the repo's own `.claude/skills` descriptions; skill bodies; `CLAUDE.md`'s trim; any engine change.

**Impact surface:** tooling & docs — shipped skill frontmatter only; a patch.

**Expected shape:** planned — one cap, eighteen rewrites, a test, one measurement.

**Delegation convention:** none for the edits: one session. Headless arms only for the trigger runs, in sterilised copies with each copy's source commit recorded; agents never commit or touch a real site's tracked files.

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
