---
branch: chore/skills-on-fleet-sites
base: main
status: open
opened: 2026-10-31
---

# Session — 2026-10-31: Testing the kiss-ssg skills on the real fleet sites

## Intent (captured at /branch-open)

**Objective:** Test the shipped kiss-ssg skills on real sites under `C:\Code\kiss\`, so the domain skills are judged by the sites they produce rather than by reading them, and fix in this repo what the sites show to be wrong or missing.

**Success criteria:**

- [ ] Each in-scope site (a1k9training, pro-plumbing, k9-solutions, swan-love) is wired to this working tree's engine and plugin, builds with `kiss-ssg check`, and its git tree is clean again afterwards (`git status` with exit code shown, and `safe.directory` where the memory says plain status lies).
- [ ] **Review pass:** `kiss-site-review` has run on each in-scope site, and each finding is graded true, false or unclear, with the site defects it missed listed beside it.
- [ ] **Trigger test:** a fresh agent, given an ordinary task on a site and not told the skills exist, is observed to invoke (or not invoke) the relevant skill. The count of runs and invocations is recorded per skill, measured from the transcripts, not inferred.
- [ ] **With-and-without:** at least one domain skill is measured by building the same brief on a site with the skill and without it, and the two results are compared on the page, not on the agent's account of it. `kiss-seo` is the first candidate, as the least evidenced of the domain skills.
- [ ] Every skill change made on the branch traces to a recorded finding, and the failing run that prompted it is re-run against the changed skill and seen to change.
- [ ] A findings report under `planning/reviews/` records, per site and per skill, what was run, what it found, and what was changed or deliberately left.
- [ ] The operator has read at least one changed skill end to end before close.

**Non-goals / out of scope:** Fixing the sites themselves; their defects are recorded in the report, never committed to their repos. Engine (`lib/`) changes; a finding that needs one is recorded for a later branch. Upgrading the sites' declared kiss-ssg version. metacarpus (no CMS data, builds zero pages), medulla (1.x, its router writes `.env`) and the three sites with no `package.json`. `kiss-page-add`, `kiss-site-migrate` and `kiss-build-check` as tasks in their own right, except where the trigger or with/without runs reach them.

**Impact surface:** tooling & docs — the skills under `plugins/kiss-ssg/skills/` and a report in `planning/`. Patch bump at most.

**Expected shape:** emergent — the findings decide which skills change.

**Delegation convention:** This session briefs, compares the results and edits the skills. Fresh sub-agents run the trigger and with/without tests, because a session that has discussed the skills cannot test whether an agent finds them. Agents never commit, never change a site's tracked files, and never run repo-scoped commands (`/branch-*`, `/code-review`) in a site folder. Each brief gives Windows paths with forward slashes, quoted.

### Inherited feedback carried into this branch

- Pulse at every slice boundary and after each amendment, not once (five logs, 2026-09-21 to 2026-10-30). Each site is a slice.
- Run repo-scoped commands from the repo they change; this branch works inside site folders and edits kiss-ssg (2026-10-30).
- Read a changed skill end to end before close (2026-10-30, twice).
- Zero invocations in three runs is a finding about skills in general (2026-10-13); its trial harness is reusable.
- `/memory-consolidate` is recommended after this branch: the pulse lesson has recurred in five logs past its retirement.

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
