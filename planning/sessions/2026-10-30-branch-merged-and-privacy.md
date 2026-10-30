---
branch: feat/branch-merged-and-privacy
base: main
status: open
opened: 2026-10-30
---

# Session — 2026-10-30: branch-merged in both homes, and kiss-privacy-and-security

## Intent (captured at /branch-open)

**Objective:** Complete the branch loop with a merged step — in kiss-ssg's own development ritual and in the `kiss-memory` plugin that sites use — and add a sixth domain skill, `kiss-privacy-and-security`, written from a cited research report.

**Background.** After PR #46 merged, the clean-up was done by hand from another repository's `branch-merged` skill, because kiss-ssg has none: neither in `.claude/skills/` (`branch-open`, `branch-pulse`, `branch-close` only) nor in `plugins/kiss-memory/skills/` (`kiss-branch-open`, `-pulse`, `-close` only). The previous branch's close named privacy and security as the clearest gap in the domain skills: a site with a form, analytics or an embed has legal duties (UK GDPR, PECR) and a security surface (headers, third-party scripts, form abuse), and no skill covers them.

**Operator's decisions:**

- `branch-merged` in **both homes**, one design.
- One domain skill, **`kiss-privacy-and-security`**, not two.
- The domain skill is written **from a research report first**, as `kiss-writing-for-the-web` was; `kiss-seo`, written mostly from memory, was the one the reviews questioned most.

**Success criteria:**

- [ ] `.claude/skills/branch-merged/SKILL.md`: confirms with `gh` that the PR is merged before deleting anything (a squash merge leaves the branch's commits out of `main`, so git cannot tell); brings the base up to date with `--ff-only`; deletes the local branch and prunes; removes only a worktree the session file names, and only when it is clean; never deletes the remote branch, resets the base or force-pushes. `branch-close` points at it as the next step.
- [ ] `plugins/kiss-memory/skills/kiss-branch-merged/SKILL.md`: the same for a site, plus recording the knowledge base on the merged base (`npx kiss-ssg aikb`), as `llms.txt`'s habit asks when work closes. `kiss-branch-close` points at it; the plugin's README lists it; the plugin tests pass.
- [ ] A research report on privacy and security for small static sites in `planning/specs/`, from primary sources (the ICO, PECR, UK GDPR, OWASP, MDN, the hosts' header docs), with every rule the skill states traceable to a source in it — written before the skill.
- [ ] `plugins/kiss-ssg/skills/kiss-privacy-and-security/SKILL.md` to the domain-skill contract: build and review modes, the shared review protocol and browser pass, a kiss section that points at `GUIDE.md`. It never gives legal advice: it flags for the owner, as the writing skill does with facts.
- [ ] One owner per rule: the writing skill's personal-details line, and any privacy or security text now in other skills, has one owner, with pointers left behind. The task skills call the new skill.
- [ ] `llms.txt` names it within 16,000 characters; the READMEs, `CLAUDE.md` and the plugin descriptions list it.
- [ ] `npm run gates` green, and one independent review of the branch.
- [ ] The operator reads `kiss-privacy-and-security` end to end before the close (the previous branch deferred its read to the PR).
- [ ] A pulse after each slice: branch-merged, the report, the skill.

**Non-goals / out of scope:** performance, information architecture and `kiss-site-deploy` (later branches); any change to `lib/` (an engine feature this work shows a need for, such as writing a host's headers file, is recorded as a candidate, not built); legal advice; the operator's review of the repo's rules (`planning/specs/2026-10-30-rule-provenance.md`) — so this branch adds no new regex coverage rows or CONTRADICTIONS unless he asks.

**Impact surface:** tooling & docs — skills, `llms.txt`, README, `CLAUDE.md`; no `lib/` change.

**Expected shape:** between — the merged step is planned (it mirrors a working skill); the privacy and security skill's content comes from the research and will show its shape as it goes.

**Delegation convention:** this session briefs and reviews. Sub-agents may do the source research and an independent review. Agents never commit.

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
