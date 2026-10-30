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

- **2026-10-30 — worktrees join the branch skills (operator's request).** "Sort out the branch skills. Including the worktree capability from internal medicine as well as the merged functionality." Both homes get it, as one design: `branch-open` and `kiss-branch-open` take `worktree` or `here`, a busy checkout always gets a worktree, the start point keeps a local base's unpushed commits, and the path goes in the session file's `worktree:`, which is the only worktree `branch-merged` / `kiss-branch-merged` will remove. It does not change **one open branch at a time** in `CLAUDE.md`: a worktree gives a branch its own folder, not a second open branch. Whether parallel branches should be allowed is the operator's, in his review of the repo's rules.
- **2026-10-30 — `kiss-branch-merged` checks the knowledge base; it does not record it (Claude, from reading `kiss-branch-close`).** The intent said the site version would record `AIKB/` on the merged base. `kiss-branch-close` says recording at close is "the only moment the baseline moves", and recording on the base would mean committing straight to it. So the merged step runs `npx kiss-ssg check` on the updated base and reports any drift from the record the close committed (another branch merged in between, a hand-resolved conflict), and writes nothing.
- **2026-10-30 — `kiss-information-architecture` folded into this branch (operator's request).** Its own session log, `2026-10-30-kiss-information-architecture.md`, is closed and records the skill, example 11's nav fix and the choice to leave the version bump to this branch's close, which therefore bumps once for both. That skill takes the "sixth domain skill" slot this intent gave `kiss-privacy-and-security`, so that skill is the seventh, and it adds itself to the same lists (`llms.txt`, which has 18 characters to spare, the READMEs, `CLAUDE.md`, the plugin and marketplace descriptions, the coverage row that names every domain skill).
- **2026-10-30 — the manifest test reads no link inside code (operator's request).** `plugin-manifests.test.js`'s `brokenLinks` read `](` anywhere, so a regex in a fenced code block failed the check as a broken link. That is how `kiss-information-architecture`'s structure script first failed. `withoutCode` now drops fenced blocks and inline code spans by CommonMark's rules before links are read. One new test was red on the old reader, which misread all six code shapes in it. A second test, that links outside code are still read after a fence or a stray backtick, was seen to fail against a naive span regex that crosses paragraphs. The sibling `src/controllers/guide.js` already skips fenced blocks when it rewrites GUIDE.md's links. It does not skip inline code: GUIDE.md line 125 has a link inside inline code, left alone today only because its target holds a space. It was not changed.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-30 — pulse 1, after the branch skills.** Criteria 1 and 2 drafted: `.claude/skills/branch-merged/SKILL.md` and `plugins/kiss-memory/skills/kiss-branch-merged/SKILL.md` written; `branch-open` and `kiss-branch-open` gain the worktree mode; `branch-close` and `kiss-branch-close` name the next step; `CLAUDE.md` and the kiss-memory README list them. Evidence: `plugin-manifests.test.js` and `skill-coverage.test.js` pass (340). Not yet tried on a real merge or a real worktree. Criterion 3, the research report: the deep-research run's searches and fetches worked, but all 75 verification agents failed on the organisation's monthly spend limit, so its 25 extracted claims are unverified; no rule is written from them until it is resumed and verified. Decision: **continue** — resume the research after the limit resets, then write the skill. — Claude.

- **2026-10-30 — pulse 2, paused on the spend limit.** Criterion 3: the research report is committed (`planning/specs/2026-10-30-privacy-and-security-research.md`): the first pass's 10 privacy findings (25 claims, all verified), and the second pass's 9 security findings on headers and CSP. About 15 security claims (host header syntax, SRI, embeds) are unverified: the second run's verifiers and synthesis failed on the organisation's spend limit; resume run `wf_1fea7226-ca6` to verify them. Criteria 4-9 (the skill, ownership, docs, gates, review, the operator's read) not started. The operator is near his weekly token limit, so the branch is pushed with no PR. Next: resume the research, then write `kiss-privacy-and-security` from the report. Decision: **pause**. — Claude.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
