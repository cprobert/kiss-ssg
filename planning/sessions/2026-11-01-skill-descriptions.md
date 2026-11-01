---
branch: chore/skill-descriptions
base: main
status: closed
opened: 2026-11-01
consolidated: 2026-11-01
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

# Session Log — 2026-11-01: kiss skill descriptions to one budget

**What we shipped:** 2.8.7. Every kiss-ssg and kiss-memory skill description at most 400 characters, held by `test/unit/plugin-manifests.test.js` (`4d02934`); the two plugins' skill listing on a site about 2,970 → 1,751 est. tokens (−41%); routing re-measured in 24 runs (`ccc4ae4`); `AIKB/testing.md` names the cap (`cafc80f`).

**Supervision:** Planned, and it ran as planned: one slice, one pulse, no amendments. The work came from `/doctor`, which the operator ran on the kiss skills; the operator chose the wider scope (every skill, one budget, a test) and the routing measurement over tests alone, both recommended. **Active supervisor**: the operator read all eighteen new descriptions at the pulse ("they're right") and kept the one decision offered. Verification was real on Claude's side too — the cap test seen red on 17 of 18 before the rewrite, `claude plugin validate` on both plugins, the YAML hazards (`: `, ` #`) refused by the rewrite script before it wrote anything, and routing measured rather than assumed. The measurement was made cheap by design: plan mode and a turn cap measure the first skill picked, at about $0.28 a run instead of the $1–8 of a full arm. No independent review: no `lib/` or `bin/` change.

**Feedback for next time:**

- **Claude — keep measuring routing with plan mode and a turn cap.** It answers "which skill did it pick" for a few dollars; promote `run-trigger.sh` and `tally-trigger.mjs` with the rest of the arm harness when that branch comes.
- **Process — a prompt between two skills is the routing test not yet run.** Every prompt here named its domain plainly. A wording question about a nav label (information architecture or writing?), and a site with many other skills installed, are where a shorter listing should matter.
- **Process — the kiss-memory skills' routing is unmeasured;** none of the runs loaded that plugin.

**Did we achieve the objective?** Met.

- [x] Every description at or under 400 characters; the test was red for 17 of 18 first.
- [x] The listing cost dropped by at least a third: −41%.
- [x] Routing kept: the 2026-10-31 tasks 12/12, near-misses 6/6 on old and new descriptions.
- [x] No trigger phrase a test or task skill depends on was lost; gates green on `7ad9786`.
