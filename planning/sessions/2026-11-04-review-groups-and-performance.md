---
branch: feat/review-groups-and-performance
base: main
status: open
opened: 2026-11-04
---

# Session — 2026-11-04: Review groups, a performance skill, and the carried doc gaps

## Intent (captured at /branch-open)

**Objective:** Let `kiss-site-review` ask which review groups to run, as one multi-select question, add a `kiss-performance` domain skill (with engine audit checks) that takes performance over from `kiss-front-end`, and close the doc gaps and dead paths carried by the last two branches — all on one branch, because the operator wants fewer, larger pull requests.

**Success criteria:**

- [ ] **Review groups.** `kiss-site-review` runs the audit first, then asks one multi-select `AskUserQuestion` with four groups: Content & discovery (writing, IA, SEO), Interface & usability (accessibility, front-end, design), Legal & compliance (legal-and-privacy), Speed & performance (kiss-performance). A group the audit found something in is marked "(Recommended)"; a group not chosen is reported as _not run_; under Codex, which has no `AskUserQuestion`, the same choice is a numbered list in plain text. A `test/unit/skill-coverage.test.js` row pins the prompt.
- [ ] **The performance skill.** `plugins/kiss-ssg/skills/kiss-performance/SKILL.md` has a build mode and a review mode that reports to `kiss-site-review/review-protocol.md` and looks through `browser-pass.md`; `kiss-site-new`, `kiss-page-add` and `kiss-site-review` link to it, and skill-coverage holds them to the link.
- [ ] **One home for performance.** `kiss-front-end` no longer claims "performance" or "layout shift"; its image `width`/`height` and `loading="lazy"` rule lives in `kiss-performance`; `kiss-accessibility`'s "not for performance" pointer names the new skill; every moved sentence is banned in the old file's `CONTRADICTIONS` table.
- [ ] **Engine audit checks.** The performance checks the contract decides on are in `lib/audit.js`, each seen red before it was green, documented in `GUIDE.md` § Launch-readiness audit, indexed in `llms.txt`, given a fix row in `kiss-site-review`'s table, with `AIKB/audit.md` and `types/` updated.
- [ ] **Contract first.** `planning/plans/2026-11-04-kiss-performance.md` (what moves out of front-end, the skill's checks and thresholds, which become audit checks, the slow-site fixture) is written and critiqued by one fresh-context agent before the skill or the checks are built.
- [ ] **Measured, not reviewed.** The same brief, with and without `kiss-performance`, through `scripts/arms.mjs`, on a site that is actually slow; the result written up in `planning/reviews/`. The operator reads the shipped `kiss-performance/SKILL.md` before the close.
- [ ] **Clean room.** A fresh agent given only the packed tarball and the plugin runs `kiss-site-review` on a site, meets the group question, and reaches a report naming the groups it did not run, listing every place it had to guess.
- [ ] **Carried doc gaps.** Documented, each snippet run against the engine: the consent docs say `"type": "module"`; the default folders; how a page gets its id; one page for policy and history; the URL shape under the default `trailingSlash`; which hash keys are settings. The dead paths are fixed — `lib/css-split.js` in `AIKB/html-split.md` and `AIKB/kiss.md`, `examples/_shared/assets/robots.txt` in `AIKB/robots.md` — and `/corpse-collector` finds none.
- [ ] `npm run gates` green; a Codex review of the `lib/` change, focused on the new checks' sites.

**Non-goals / out of scope:** no Lighthouse or other new dependency; no change to the other domain skills beyond the performance pointers; no second question or fifth group in the review prompt.

**Impact surface:** public API — new audit check ids are observable in every site's build report. Minor bump proposed at close.

**Expected shape:** between — the review prompt and the doc gaps are planned; the performance skill's content is settled by the contract and the measurement.

**Delegation convention:** this session briefs, writes the skills and reviews; sub-agents critique the contract, run the arm measurement and the clean room, and may implement inside a named scope. Agents never commit.

**Contract:** `planning/plans/2026-11-04-kiss-performance.md` (to be written; amended in place with dated sections).

**Decisions at the open:**

- The carried doc gaps (in the 2026-11-04 consent-dialog-services and 2026-11-02 kiss-legal-and-privacy Feedback) were put to the operator: **this branch**.
- Claude recommended a skill-only performance branch and a separate branch for the review prompt; the operator chose engine checks and one branch. Reason, in the operator's words: changing the review skill is relatively minor and can go along with the performance skill; too many pull requests and branches are being created, and most of the operator's time goes on running pull requests.

**Inherited feedback held through this branch:** no prose through the shell, `sed -i` included (recurred 11-04 twice); measure before giving a number; pulse after every Codex round that changes `lib/`; the operator reads one Codex fix diff per round (11-03, 11-02); the operator reads the shipped `SKILL.md` before the close (11-02). `/memory-consolidate` is recommended: five logs lack `consolidated:`.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-11-04 — kiss writes cache headers for each host.** The research passes verified nothing on host cache headers, so Claude measured the fleet's live responses (`planning/research/2026-11-04-static-site-performance.md` § Measured). Netlify's default is `max-age=0, must-revalidate` on every asset, two sites cache unhashed images for a year, and only one site's hand-written rules are right, while kiss already knows exactly which files are hashed. The operator chose the engine feature on this branch (Claude's recommendation): kiss writes the host header files beside `redirects.json`, `immutable` for hashed files, revalidation for HTML, a short lifetime for unhashed files. Added criterion: the header files are written, documented in `GUIDE.md`, indexed in `llms.txt`, typed, covered by a unit test seen red, and the fleet's Netlify and Firebase sites build the right headers with the new engine.
- **2026-11-04 — the carried doc gaps were already closed.** Checked before editing: all six are in `GUIDE.md` § Cookie consent, "Where each piece goes" (lines 1074–1079 at `58db954`), and the three dead paths now read as history with no path, both from the `{{embed}}` branch (`137e36c`, criterion 34 of its intent). That branch's Feedback did not say so, so the item kept being carried. The criterion is met by the earlier branch; nothing to change here.
- **2026-11-04 — the contract critique, and three operator decisions.** One fresh-context agent critiqued the contract and found 20 issues, 6 of them blockers. Claude re-checked the code claims before acting on any. The contract's dated section "after the critique" records the result. The operator chose all three recommendations:
  - `config.host`, with per-concern overrides, so `redirects.format` keeps working;
  - kiss appends its block to a site's own `_headers`;
  - the operator runs a Netlify and a Firebase deploy preview, so host behaviour is measured before the docs state it.
- **2026-11-04 — Lighthouse KPIs through `kiss-ssg speed`, with Lighthouse an optional peer dependency.** The operator asked for Lighthouse to run before and after the skill's edits, so the skill yields measurable KPIs. The non-goal "no Lighthouse or other new dependency" was **Claude's**, written into the intent at the open from a guess that it is heavy, and never decided by the operator. Claude said so when the operator asked where it came from, and measured: `lighthouse` 13.6.0 is 19,351,495 bytes unpacked, with 22 direct dependencies and `engines.node >=22.19` (kiss-ssg's floor is 22.12). The operator chose Claude's option 2, which **replaces that non-goal**:
  - `lighthouse` is an optional peer dependency of kiss-ssg (`peerDependencies` plus `peerDependenciesMeta.optional`);
  - a site that wants the KPIs installs it with `npm install -D lighthouse`;
  - `npx kiss-ssg speed` loads it only when it runs, and names the install when it is missing;
  - the skill measures first and last.
  - Added criterion: `kiss-ssg speed` exists with its decisions in a tested `lib/` module, and `kiss-performance` uses it before and after.
- Claude decided the mechanics: patterns on Firebase, no HTML rules on Netlify, `cacheHeaders` appended to the report, the renamed check ids, the `llms.txt` cut, and the skill-rule fixes against `kiss-legal-and-privacy`.
- **2026-11-04: the install instructions offer Lighthouse.** The operator asked whether the docs should change, given that the full kiss experience now needs one more install. The operator chose "offered, not installed" (Claude's recommendation) over installing it at `init`. The changes:
  - the README's optional panel and prompts table (`a927125`);
  - a `speed` script for the starter only, the last of `init`'s next steps, and `AGENTS.md` (`a927125`);
  - every install box on the docs site's home page, and `kiss-performance` on its Skills page, which had missed the skill (`cc91574`).
- **2026-11-04: audit three fleet sites instead of a synthetic slow site.** The operator directed it: "Rather than a synthetic slow site, please audit the existing kiss sites using our new found performance powers (choose 3)". It replaces criterion 6's synthetic fixture and with/without arms. Claude chose three sites on three hosts with likely failures: k9-solutions (Netlify), diploma-msc (Firebase), swan-love (GitHub Pages). On each, the branch engine ran a staged `check` through a junction swap, with the site's tree clean before and after; Lighthouse ran on the live URLs through `kiss-ssg speed`; and the live headers came from the earlier measurement. Write-up: `planning/reviews/2026-11-04-fleet-performance-audit.md`. **What it does not show:** it tests the tools (the audit checks, `speed`, headers) on real sites, not the skill's effect on a site an agent changes. CLAUDE.md's with/without measurement of a domain skill has not been run.
- **2026-11-05: bundling, minification and tree shaking, which the operator asked about from the start.** The operator pointed out that the skill had drifted to caching. Claude said what had happened: both research briefs left tree shaking out because kiss has no bundler, and the caching emphasis came from Claude's own measurement of the fleet's headers. The operator set the rule: "Just because kiss doesn't support something doesn't mean our skills should ignore it… We do what's best for the customer (not kiss)". It is saved as a memory. What followed:
  - a third research pass (`wf_c778cb09-ae6`), and a Chromium coverage measurement of the three live sites, both in `planning/research/`;
  - the operator chose Claude's two recommendations: **`assets.minify`** built into kiss, on by default (`91255d1`), and **pipeline recipes** in the skill for removing unused CSS and JS;
  - the recipes were run through a real kiss build first. Running them found PurgeCSS's exit-0 trap, which `{{asset}}` catches. Measured: Bootstrap 13.4 KB → 3.4 KB after Brotli; one lodash function 3.4 KB;
  - `kiss-performance/SKILL.md` grows to 13.7k, past the contract's 12k budget, which Claude raised rather than cut the rules the operator wanted.
- **2026-11-05: a CSS partitioning rule, audited by `kiss-ssg css`.** The operator proposed the strategy: a site stylesheet; one per `.pages()` type, since a type often has its own styling; and inline CSS for one page. They asked whether Claude agreed. Claude agreed, with conditions: shared components stay site-wide; a type with few rules stays in the site file; inline stays small; a block repeated on two pages moves up a tier; never a stylesheet per page; and a strict CSP blocks inline CSS. The operator asked for the skill "to audit in a reproducible way". By the repo's rule (mechanism in `lib/`, the skill runs it), that became a command, `npx kiss-ssg css <build-folder>`, built by a sub-agent in its own worktree and reviewed here. It is browser-free and deterministic. Run twice on swan-love and diploma-msc, it wrote byte-identical JSON. On diploma-msc it found 17 inline blocks repeated across pages, one of them on all 683.
- **2026-11-05: `assets.purge`, CSS purged against the written pages.** The operator asked whether PurgeCSS could scan the generated pages, and whether that should be a `.treeshake()` method after `.generate()`. Claude recommended against a method, for two reasons. First, a purge after the pages link a hashed name either breaks "the name is the bytes" or rewrites every page anyway. Second, "tree shaking" names JavaScript dead-code removal, which is esbuild's job. Claude proposed a config key run at the settle instead, and recommended measuring template against output scanning first. The operator chose to build it now; the comparison was not run. What was built:
  - PurgeCSS against the written HTML and the build's scripts, first at the settle;
  - re-hashed, with every page rewritten to the new name (`KissPage.replaceInOutput`, which re-derives the page's hash, links and facts), before the link scan, audit, cache headers and report;
  - opt-in by naming the file, off in dev;
  - a failure fails the build;
  - PurgeCSS 8 as a direct dependency (about 136 KB, loaded only when a site purges);
  - the skill's PurgeCSS pipeline recipe replaced by `assets.purge`.
- **2026-11-04: a `soundcloud` embed preset.** The fleet audit's slowest page was a bare SoundCloud iframe, and `{{embed}}` had no preset for it. The operator chose Claude's recommendation to add one on this branch (`6b6ac9f`). Its origins and storage were measured, and its tests were seen red first.
- **2026-11-04: `speed` takes a build folder, not a site script.** The sub-agent found no way to learn `folders.build` without running the build. Claude accepted the folder form rather than adding a config-only mode, and recorded it in the contract.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-04** — after the contract critique and its amendment (`6ec5e5d`).
  - **Met:** criterion 5, the contract (written, critiqued with 20 findings, amended). Criterion 8, the doc gaps: already closed by `137e36c`, re-checked in GUIDE.md lines 1074–1079.
  - **Partial:** criterion 1, the review groups. Step 2 is written and its coverage row was seen red, then green.
  - **Not yet:** criteria 2–4, 6, 7 and 9.
  - `npm test` found one failure from `6b66d95`: the review skill linked `kiss-performance/SKILL.md` before it exists. Fixed in `c17db4f` by removing the bullet until the skill lands, with the check ids renamed to the amended names. Plugin and coverage tests are green.
  - No drift; the impact surface is still public API.
  - **Eyeball: deferred** to `/branch-close`'s eyeball step: step 2 of `kiss-site-review/SKILL.md`.
  - **Offer: overturned.** Claude had the build fail when an unhashed file matches the Firebase hash pattern. The operator chose a warning: "It's an optimisation rather than a critical issue. So a warning will suffice." The contract is updated.
  - Decision: adjust (the link fix), then continue with C, the engine.
- **2026-11-04**: after the engine slice, the speed command and the install docs (`04c3dd0`..`cc91574`, plus the test fix below).
  - **Met:** criteria 1–5 and 8, and the `kiss-ssg speed` Amendment. `npm test` gives 120 files, 3,984 passed, 7 skipped. Every new test was seen red: against the old code, or under mutations of the new.
  - **Partial:** the cache-header Amendment, built and tested, with the operator's deploy previews still to run. Criterion 9: tests are green, the gates and the Codex review are not yet run.
  - **Not yet:** criteria 6 (the measurement) and 7 (the clean room).
  - The pulse's `npm test` found a fault in `cc91574`: `test/unit/home-quickstart.test.js` still forbade optional panels outside Claude Code's box. The test now pins both rules, no Anthropic plugin outside that box and Lighthouse in every box.
  - Drift: the remit grew by the operator's decisions, each recorded in the Amendments, the install docs included. The impact surface is still public API, and a minor is proposed.
  - **Eyeball: looked.** The operator read `plugins/kiss-ssg/skills/kiss-performance/SKILL.md` end to end: "Looked, it's right".
  - **Offer: kept.** kiss writes no HTML cache rule on any host, Firebase included, whose HTML default is an hour. The operator chose "keep, decide after the preview": add a `no-cache` HTML rule for Firebase only if the deploy preview shows it is still served from the edge.
  - Decision: continue with the measurement (criterion 6), then the clean room (7), then the operator's deploy previews.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
