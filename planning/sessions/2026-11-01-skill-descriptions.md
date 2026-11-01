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

- **2026-11-01** — slice 1 (`4d02934`, `ccc4ae4`). Criterion 1 met: the 400-character cap in `plugin-manifests.test.js` was red for 17 of 18 descriptions and is green; `claude plugin validate` passes both plugins. Criterion 2 met: the two plugins' listing, by `/doctor`'s count, 2,970 → 1,751 est. tokens (−41%). Criterion 3 met: 24 routing runs in plan mode with a turn cap — the 10-31 tasks 12/12 on the new descriptions, six near-misses 6/6 on old and new ($6.81, `planning/reviews/2026-11-01-skill-descriptions-trigger.md`). Criterion 4: skill tests 408 passed; gates not yet run. No drift; real sites untouched. **Eyeball: looked** — the operator read all 18 new descriptions: "they're right". **Offer:** the "kiss-site-new and kiss-page-add call it" clauses dropped from the domain-skill descriptions — operator: keep. Decision: ready to close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
