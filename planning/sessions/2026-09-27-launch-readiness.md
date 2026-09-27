---
branch: feat/launch-readiness
base: main
status: open
opened: 2026-09-27
---

# Session — 2026-09-27: Launch readiness — audit findings in the report, and a review skill that reads them

## Intent (captured at /branch-open)

**Objective:** Give every kiss build a set of advisory launch-readiness findings, decided from the written HTML and the build folder, so the checks a "does this site look finished?" review would make run on every build and every `kiss-ssg check`. Then ship a `kiss-site-review` plugin skill that reads those findings and does the judgement pass only an agent with a browser can do. The idea came from a "make it not look vibe-coded" prompt the operator found online, adapted for a static site: the SPA-only concerns are dropped (loading states, bundle size), and so is the "hide how it was built" framing.

**Success criteria:**

- [ ] **Head metadata** reported per page: `<title>` and meta description missing, or duplicated across pages; `og:image` missing; and site-wide, no favicon (no `<link rel="icon">` and no `favicon.ico` in the build).
- [ ] **Content structure** reported per page: an `<img>` with no `alt` attribute (`alt=""` counts as present, because it marks a decorative image); not exactly one `<h1>`; a skipped heading level.
- [ ] **Site-level** reported: no `404.html` in the build; the site url is left at localhost or a preview host.
- [ ] **Output hygiene** reported: files in the build that should not ship (source maps, `.env`, `.DS_Store`, logs, dotfiles); `console.log` left in shipped `.js`.
- [ ] Every finding is **advisory**: it appears in `kiss.report()` and the printed summary and never fails the build. **Each check can be switched off individually** under one config key, and the whole audit can be switched off too. All checks default to on. Skipped in dev, like `links`.
- [ ] Each finding is tested, and the test is seen red for the right reason (the failure message is read, not just counted) before the implementation lands.
- [ ] A site with none of the problems gets a clean audit. Every example's findings are looked at and either fixed (what ships is an example) or justified in the example.
- [ ] Public API obligations: `llms.txt`, `README.md`/`GUIDE.md`, `types/` regenerated, a new `AIKB/` doc and a row in the CLAUDE.md table, and `test/unit/skill-coverage.test.js` rows.
- [ ] `kiss-site-review` skill in `plugins/kiss-ssg/skills/`. It runs `kiss-ssg check`, reads the audit findings, then does the judgement pass: responsive widths, long text, visual consistency across pages, clickable things that do nothing, and whether the 404 is useful. It reports first and fixes only what the operator picks.
- [ ] **Clean-room:** a fresh sub-agent with only the packed tarball and the shipped skill reviews a deliberately flawed small site in an empty folder, and finds the planted problems. It reports every place it had to guess.
- [ ] Contract critiqued adversarially by a fresh-context agent before any workstream builds against it.
- [ ] `npm run gates` green; Codex review at close (`lib/` changes).

**Non-goals / out of scope:** Failing the build on any finding. An HTML parser dependency (the tolerant-regex approach of `lib/links.js` stands). Performance budgets and JavaScript bundle size. Accessibility beyond alt and headings (contrast, ARIA, focus order). Fixing the fleet sites under `C:\Code\kiss`: the skill will be run against them after this branch, not in it.

**Impact surface:** public API — a new report field and new config keys that a consuming site can observe. That points to a minor (2.7.0), to be decided at close.

**Expected shape:** planned. Two workstreams with a known destination. The design detail (the report shape, where extraction happens) is settled in the contract before any code is written.

**Delegation convention:** the main session writes the contract, briefs and reviews. Sub-agents implement inside the scope the contract names (engine workstream, then skill workstream). Agents never commit: the main session reviews every diff and commits.

**Contract:** `planning/plans/2026-09-27-launch-readiness.md`

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
