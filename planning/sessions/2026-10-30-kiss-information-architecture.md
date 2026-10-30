---
branch: ccr-f6af9894-zy0ccy
base: main
status: closed
opened: 2026-10-30
---

# Session — 2026-10-30: kiss-information-architecture, the sixth domain skill

## Intent (captured at /branch-open)

**Objective:** Add a sixth domain skill, `kiss-information-architecture`, to the `kiss-ssg` plugin. It holds how a site is structured: which pages exist, how they are grouped and named, the navigation layers, the URL scheme, breadcrumbs, taxonomy and the 404 as a way back in. The task skills call it the same way they call the other five.

**Background.** The source is a deep research report on information architecture for web design that the operator supplied on 2026-10-30. It covers task-first structure, breadth against depth, navigation layers, label writing, URLs, breadcrumbs, taxonomy, search and facets, page types, accessibility, SEO, research methods and governance. Its sources are NN/g, GOV.UK, W3C/WCAG 2.2, Google Search Central and Baymard. Its citation markers did not survive export, so `references/sources.md` names the guidance it cites rather than the report's links. Its worked examples were in one subject area; the skill uses neutral examples.

This session ran in a cloud container on its designated branch, so the intent was written onto that branch rather than a new one being created (`/branch-open` Step 1, adopting a branch).

**Operator's decisions, with reasons:**

- **Name: `kiss-information-architecture`**, Claude's recommendation: it is the domain's own name, and the words people use for it.
- **IA owns the structure and points at the other skills for the rest** (Claude's recommendation). This skill owns which pages exist, grouping, the navigation layers, the URL scheme, breadcrumbs, taxonomy and the 404 as a recovery route. Wording stays with `kiss-writing-for-the-web`, `aria-current` and landmarks with `kiss-accessibility`, and search with `kiss-seo` (one purpose per page, canonical copies, moved URLs). Nothing moves out of those skills.
- **The report's research and governance material is left out** (against Claude's recommendation of a short "when to ask for research" note): card sorting, tree testing, analytics and search logs, and owners for taxonomy and URLs. The operator's reason: agents can't act on it.

**Success criteria:**

- [ ] `plugins/kiss-ssg/skills/kiss-information-architecture/SKILL.md` follows the domain-skill contract (`planning/plans/2026-10-30-domain-skills.md`): its description says what it is for and which sibling covers what it is not for; it has an "in a kiss site" section that points at `GUIDE.md` and `llms.txt` rather than restating them, a build mode and a review mode in that order, and review mode reports to `review-protocol.md`. It stays under 250 lines.
- [ ] `references/sources.md` credits the guidance behind the rules.
- [ ] No research-method or governance section, and no example from the operator's own business.
- [ ] `kiss-site-new`, `kiss-site-review` and `kiss-page-add` call it, each with a one-line floor, and the existing coverage row that names every domain skill names it too, seen red before the edit.
- [ ] `llms.txt` names it on the roster line and stays at or under 16,000 characters, cutting at least as much as it adds. The root README, the plugin README, the plugin and marketplace descriptions and `CLAUDE.md`'s list of domain skills name it.
- [ ] Every shell snippet the skill ships has been run against a built kiss example.
- [ ] `npm run gates` is green.

**Non-goals / out of scope:** moving any rule out of the other five domain skills; research methods and governance; any `lib/` change; a breadcrumb helper or any other engine feature; changing the examples; the version bump and changelog entry, which are `/branch-close`'s.

**Impact surface:** tooling & docs: a shipped skill and the docs that list the skills. No `lib/` change, so a patch bump at close.

**Expected shape:** planned. The skill's shape is fixed by the domain-skill contract, and the content comes from the report.

**Delegation convention:** none: one session.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-10-30 — `feat/branch-merged-and-privacy` merged into this branch (operator's request: "I've got related code on there").** It brings the `branch-merged` step in both homes, `branch-open`'s worktree option, and the privacy and security research (`planning/specs/2026-10-30-privacy-and-security-research.md`). The merge was clean (`CLAUDE.md` auto-merged), and all five gates pass on the result. That branch's intent also calls its planned `kiss-privacy-and-security` "a sixth domain skill" and lists information architecture as a later branch. That skill is not written yet, so nothing conflicts today, but whichever lands second adds itself to the roster lines this branch edited (`llms.txt`, the READMEs, `CLAUDE.md`, the plugin descriptions, the coverage row) and to the plan's count.
- **2026-10-30 — example 11's nav fixed (operator's request).** The nav called the home page "The journal" and the post listing "All posts", while the listing's `<h1>`, title and in-content links called it "The journal". The tags page was "Tags" in the nav and "Every tag" on the page. That breaks this skill's "one concept, one name" rule, in a shipped example. All three nav items now match their pages: Home, The journal and Tags, and the in-content links to those pages use the same names. The example's recorded knowledge base was current before the edit (`check`: 15 unchanged), so it was re-recorded with `kiss-ssg aikb`; only page hashes moved, and `check` reads 15 unchanged again.
- **2026-10-30 — finalised into `feat/branch-merged-and-privacy`, with no version bump (operator's choice, on Claude's recommendation).** This branch closes its log here, and its commits fast-forward `feat/branch-merged-and-privacy`, which is still open. The version bump and changelog entry are left to that branch's `/branch-close`, so both pieces of work ship as one version with one entry. No PR.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-30, after the first slice.** The skill (`SKILL.md`, 137 lines; `references/measure-structure.md`; `references/sources.md`) is written. `kiss-site-new`, `kiss-site-review` and `kiss-page-add` call it. The roster row in `skill-coverage.test.js` was red on both task skills before their edit (2 failed, 229 passed) and green after. `llms.txt` is 15,982 characters, net zero: 33 added for the name and 33 cut from the same paragraph. The structure script was run as extracted from the shipped Markdown against examples 4, 6 (relative links) and 11 (`extensionLess`), and against a copy of 11's build with a planted page nothing links to, which came first with `0`. The manifest test then caught the script's first regex being read as a Markdown link, so the regex now uses a backreference, and the output was the same on all three examples. `npm run gates`: all five passed. Not run: a trial of the skill on an example and a measurement of its triggering, both optional under the plan's lean amendment. Decision: continue to commit and push; no PR until asked.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Log — 2026-10-30: kiss-information-architecture, the sixth domain skill

**What we shipped:** `plugins/kiss-ssg/skills/kiss-information-architecture/` (`SKILL.md`, `references/measure-structure.md`, `references/sources.md`), called by `kiss-site-new`, `kiss-page-add` and `kiss-site-review` and listed everywhere the domain skills are listed (`dacf9b7`). Then the merge of `feat/branch-merged-and-privacy` (`60cf63e`), and example 11's nav made to match its pages. Folded into `feat/branch-merged-and-privacy` rather than closed with a PR.

**Supervision:** Planned. The domain-skill contract fixed the shape, and the operator's research report fixed the content. **Assisted operator.** The operator's strongest dimension was problem framing. Before any edit they made four decisions: the name, ownership of the overlaps, leaving out research and governance (against the recommendation, with a reason given when asked), and the intent log. They steered twice more: pulling in a related branch, and acting on a finding (example 11) rather than leaving it in a report. Verification of the artefact was delegated. The skill's text was accepted on Claude's summary and the gates, with no read of `SKILL.md` and no trial of it on an example, so no one but its author has checked the rules against the report. Claude's own checks were real but self-checks. The shipped script was run against examples 4, 6 and 11 and a planted orphan. The manifest test caught a regex that read as a Markdown link, and the coverage row was seen red first. The branch has no independent review.

**Feedback for next time:**

- **Operator — read the skill before the branch it now lives on closes.** `kiss-information-architecture/SKILL.md` is 137 lines. `feat/branch-merged-and-privacy` already asks for an end-to-end operator read of its own domain skill; give this one the same read at that close, since nothing but its author has checked it against the report.
- **Process — `/branch-open` cannot see a sibling feature branch.** It lists open session logs on the base, so it missed `feat/branch-merged-and-privacy`, which also claimed the "sixth domain skill" slot and the same roster lines. When adopting a branch, also list the remote feature branches (`git branch -r --no-merged origin/main`) and read their session logs' intent.
- **Claude — Step 2a was skipped on adoption.** The intent was written without reading back earlier logs' Feedback or counting recurring lessons. Adopting a harness branch skips only Step 4, branch creation; run the read-back anyway.
- **Claude — a scratch file was written with `printf` into a redirect,** against `CLAUDE.md`'s rule that text landing in a file goes through Write. It was harmless this time, but the rule's own history says that is how it recurs.
- **Both — decide the manifest test's code-block blind spot.** `plugin-manifests.test.js`'s `brokenLinks` reads code inside fenced blocks as Markdown links. This branch fixed the case (a backreference regex) and not the class, so the next skill that ships `](` in a code block fails the same way.

**Did we achieve the objective?** Met, with the review gap above.

- [x] `SKILL.md` to the contract: a description with its triggers and the siblings it is not for, the kiss section pointing at `GUIDE.md` and `llms.txt`, build mode then review mode, review reporting to `review-protocol.md`; 137 lines.
- [x] `references/sources.md` credits NN/g, GOV.UK, WCAG 2.2, Google Search Central and Baymard. Its sources are named rather than linked, because the report's links did not survive export.
- [x] No research-method or governance section; neutral examples only.
- [x] The three task skills call it; the coverage row was red on both pinned task skills (2 failed, 229 passed) before the edit and green after. `kiss-page-add`'s call is not pinned by a row.
- [x] `llms.txt` names it at 15,982 characters, net zero; the READMEs, plugin and marketplace descriptions and `CLAUDE.md` list it.
- [x] The shipped script was run, as extracted from the Markdown, on examples 4, 6 and 11 and a planted orphan.
- [x] `npm run gates` green on the skill, on the merge and on the example fix.

Still open: an operator read of the skill, a trial on an example, the code-block blind spot, and the roster and count clash with `kiss-privacy-and-security` when that skill is written.
