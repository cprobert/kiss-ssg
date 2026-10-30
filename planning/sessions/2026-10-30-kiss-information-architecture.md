---
branch: ccr-f6af9894-zy0ccy
base: main
status: open
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

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-30, after the first slice.** The skill (`SKILL.md`, 137 lines; `references/measure-structure.md`; `references/sources.md`) is written. `kiss-site-new`, `kiss-site-review` and `kiss-page-add` call it. The roster row in `skill-coverage.test.js` was red on both task skills before their edit (2 failed, 229 passed) and green after. `llms.txt` is 15,982 characters, net zero: 33 added for the name and 33 cut from the same paragraph. The structure script was run as extracted from the shipped Markdown against examples 4, 6 (relative links) and 11 (`extensionLess`), and against a copy of 11's build with a planted page nothing links to, which came first with `0`. The manifest test then caught the script's first regex being read as a Markdown link, so the regex now uses a backreference, and the output was the same on all three examples. `npm run gates`: all five passed. Not run: a trial of the skill on an example and a measurement of its triggering, both optional under the plan's lean amendment. Decision: continue to commit and push; no PR until asked.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
