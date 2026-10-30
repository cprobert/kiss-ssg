---
branch: feat/kiss-writing-for-the-web
base: main
status: closed
opened: 2026-10-30
---

# Session — 2026-10-30: kiss-writing-for-the-web, the first domain skill

## Intent (captured at /branch-open)

**Objective:** Add the first domain skill, `kiss-writing-for-the-web`, to the `kiss-ssg` plugin, and make `kiss-site-new` and `kiss-site-review` call it instead of restating copy rules, so that each area of web expertise lives in one skill that an expert can review.

**Background.** The skill is ported from a user-level `writing-for-the-web` skill built and tested in an internal-medicine session on 2026-10-30. Its sources: an evidence report (NN/g, GOV.UK, Baymard, W3C/WCAG, Google Search Central, Content Design London) and patterns adapted from the MIT-licensed Humanizer skill (github.com/blader/humanizer). Two rounds of with/without tests there showed one consistent effect: without the skill, the agent invented unbracketed facts in most cases; with it, unknowns became placeholders.

**Operator's decisions, with reasons:**

- **The domain skills go inside the `kiss-ssg` plugin, not a new plugin** (against Claude's recommendation). Reason, in the operator's words: users should not have to install several plugins; "the idea that we provide a set of skills that help you build better websites is the core of what I want to build here". `kiss-memory` stays separate because it does a different job.
- **Separation of concerns:** task skills (`kiss-site-new`, `kiss-site-review` and the rest) do the kiss mechanics and call domain skills for the expertise, so a writing expert can review the writing skill and an SEO expert the SEO skill.
- **Five domain skills are planned:** writing for the web, SEO, accessibility (its own skill, on Claude's recommendation), HTML and technical best practice, and design.
- **Names are plain English, for discoverability** (`kiss-writing-for-the-web`, `kiss-seo`, `kiss-accessibility`, `kiss-html`, `kiss-design`). The operator rejected thing-action for these. Open: `kiss-html` or `kiss-html-and-performance`.
- **Tests use kiss's own examples only.** The repo is public, so the internal-medicine tests on Learna pages stay private.

**Success criteria:**

- [ ] `plugins/kiss-ssg/skills/kiss-writing-for-the-web/` has a `SKILL.md` and references ported from the user skill, with a "where copy lives in a kiss site" section that points at `GUIDE.md` rather than restating it, credit lines for Humanizer (MIT) and the research sources, and no Learna content.
- [ ] The copy rules live once: `kiss-site-new` (invented facts, placeholders) and `kiss-site-review` (demo and scaffold copy) call the skill by name, in build and review mode. `test/unit/skill-coverage.test.js` rows pin this, each seen red before the edit, and `CONTRADICTIONS` rows ban the old sentences.
- [ ] `llms.txt` names the skill and stays at or under 16,000 characters; the plugin README, the root README and the plugin's description list it.
- [ ] `CLAUDE.md` records the naming rule: a task skill is thing-action, a domain skill has a plain name.
- [ ] Tests on kiss's own `examples/`, kept in `test/skills/` outside the shipped plugin folder, run with and without the skill, with the results recorded.
- [ ] The description's triggering is measured, with near-misses against `kiss-site-review` and `kiss-site-new`.
- [ ] Clean room: a fresh agent, given only what ships plus the plugin, builds a small site with `kiss-site-new` in an empty folder. Unknown facts become visible placeholders, `kiss-ssg check` passes, and the agent reports every place it had to guess.
- [ ] `planning/plans/2026-10-30-domain-skills.md` sets out the five-skill structure, the names and the order of the later branches, and a fresh agent critiques it before work depends on it.
- [ ] `npm test` is green, and Codex reviews the branch independently before the close.

**Non-goals / out of scope:** the other four domain skills; moving the accessibility, HTML and design rules out of `kiss-site-review`; any `lib/` change; the README's stance on design; the sites in `C:\code\kiss`, which are test material only and are not changed.

**Impact surface:** tooling & docs — skills, `llms.txt`, README and `CLAUDE.md`; no `lib/` change, so a patch bump.

**Expected shape:** between — the destination is known; the split with `kiss-site-new` and `kiss-site-review` will become clear as the work goes.

**Delegation convention:** this session briefs and reviews. Sub-agents run the tests, the clean-room trial and the plan critique; Codex does the independent review. Agents never commit.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-10-30 — the groundwork joins this branch (operator agreed).** The plan's critique showed criterion 2 cannot be met with the tests as they are: a CONTRADICTIONS ban runs on every shipped file, so it would ban a moved sentence in its new owner too. So this branch also builds, each seen red first: file-scoped CONTRADICTIONS entries; `plugin-manifests.test.js` checking every `.md` in a skill folder, relative links and the real packing rules; the shared `plugins/kiss-ssg/skills/kiss-site-review/review-protocol.md`, cut out of `kiss-site-review`; and a check of the trial case folders. Details: the plan's rules 4, 9 and 10.
- **2026-10-30 — `kiss-page-add` and `kiss-site-import` call the skill too (operator agreed).** One call each: `kiss-page-add` when writing a page's model and view, `kiss-site-import` when lifting copy into models (keep every fact, invent none).
- **2026-10-30 — one floor line for agents without skills.** Measured: `llms.txt` § Building a site well carries none of `kiss-site-new`'s floors, so agents without plugin skills never see the rule against invented facts. This branch proposes one habit line for it, within the `llms.txt` budget (plan rule 7).
- **2026-10-30 — the rules audit, and a lean finish (operator's decisions).** The operator asked whether the repo's rules "haven't slipped in by AI" and whether the branch was following rules that "don't make sense". A read-only agent traced fourteen of them (`planning/specs/2026-10-30-rule-provenance.md`): two are the operator's own decisions (the version policy, architectural elegance), and most of the rest were promoted into `CLAUDE.md` by `/memory-consolidate` with no recorded operator approval. This branch had followed several of them, and had added more of that machinery itself (`allowedIn`, `e64f1a2`). The operator chose:
  - **finish this branch lean:** keep the skill, the review protocol and the task-skill calls; add no more regex coverage rows or CONTRADICTIONS; leave `allowedIn` for the rules review to judge; finish the READMEs, the naming note and one real trial of the skill on a kiss example; skip the AI-derived rituals (the triggering measurement, the clean room, further pulse writing) unless he asks. Criteria 5, 6 and 7 are dropped on that basis, and criterion 9's Codex review stays only if he asks for it;
  - **the rules are reviewed on a later branch, rule by rule, by him:** keep, cut or reword each, and `/memory-consolidate` no longer promotes a lesson into a rule without his explicit yes.
- **2026-10-30 — one shared browser pass (operator's call: "very much in the scope of everything we've been working towards").** How to look at a built kiss site in a browser (build it, serve the build folder as the root over HTTP, the widths, the three `webapp-testing` defaults that are wrong for kiss, and saying when no browser ran) was written in both `kiss-site-new` and `kiss-site-review`. It now lives once, in `plugins/kiss-ssg/skills/kiss-site-review/browser-pass.md`, beside the review protocol, and both skills link it. Two existing coverage rows point at the new file and `kiss-site-new` leaves a third; no rows were added. The operator's aim, in his words: knowledge "encapsulated into DRY, solid principles", so the universal skills stay thin and call in specialist skills.
- **2026-10-30 — the HTML skill's name is open.** The operator finds `kiss-html` too generic and proposed `kiss-best-practice`. Claude's concern: every domain skill is best practice, so the name says how good the advice is rather than what it covers, and it would compete with the other four for a match; Claude suggested `kiss-front-end`. Decided on that skill's branch.
- **2026-10-30 — all five domain skills on this branch (operator's decision).** "Don't give up. Keep pushing. I would like the skills to encapsulate domain knowledge so that our front-end skills act like thin handlers. I don't want to do this again on a later branch. I want to do it here and now." The operator chose `kiss-front-end` for the HTML skill. So this branch also builds `kiss-accessibility`, `kiss-front-end`, `kiss-design` and `kiss-seo`, moves every domain rule out of `kiss-site-new` and `kiss-site-review`, and leaves those two as thin handlers (`kiss-site-review` 5,295 words at the branch's start, 1,769 now; `kiss-site-new` 4,105, now 3,425). How the text moved, and why `kiss-seo` is mostly new, is the plan's amendment of the same date.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-30 — pulse 1, after the plan.** Criterion 8 (the plan, critiqued): written and committed (`c78c5b0`); a fresh Codex session reported 1 blocker, 6 major and 1 minor finding, Claude re-checked the four measured ones against the files (all held) and answered all eight in the plan. Criteria 1–7 and 9: not started. One of Claude's own numbers was wrong and the critique caught it: `llms.txt` is 15,938 characters by the test's measure, not 15,997 (bytes). Decision: **adjust** — the groundwork and the two extra calls are recorded as amendments above; next is the groundwork, starting with file-scoped CONTRADICTIONS. — Claude, with the operator's two answers.
- **2026-10-30 — the trial, and ready to close.** One review of example 12's copy, with and without the skill, by two read-only agents writing outside the repo. Both found the copy's real contradictions (the minimum order said three ways, "on your bar by Friday" against fortnightly and monthly deliveries, one free sample under three names) and the form that posts to `#`. Without the skill the agent also caught "roster" for "roaster"; with it the review came as one prioritised table, ran the audit, traced every fact to the original, marked the example's recorded choices **ask**, and put the missing privacy line first. So on this page the skill added discipline and a consistent report, not more discoveries, as the internal-medicine trials found. It also showed two gaps, fixed in `b431687`: no mapping of copy findings onto P0–P3, and a Markdown copy read on a build without `.llms()`. One finding outside this branch, for the operator: the agent reported that `npx kiss-ssg check` writes a `public.kiss-staging-*` folder inside the site while it runs, so a review that must leave a folder untouched has to copy the site first. Not checked by Claude. Gates: `npm test` green (2,735) at `bf4b9d3`. Criteria 1–4 and 8 met; 5–7 dropped and 9's Codex review left to the operator, by his lean-finish decision. Decision: **ready to close**. — Claude.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-10-30: Five domain skills, and the task skills as thin handlers

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** 19 commits, `90d1321`..`41d6437`, as 2.8.3. Five domain skills in the `kiss-ssg` plugin (`kiss-writing-for-the-web` `215be56`; `kiss-accessibility`, `kiss-front-end`, `kiss-design`, `kiss-seo` `7140f84`); `kiss-site-new`, `kiss-site-review` and `kiss-page-add` reduced to thin handlers; the shared `review-protocol.md` (`8a91d64`) and `browser-pass.md` (`d990506`); test groundwork (`e64f1a2`, `98eed07`); a `GUIDE.md` § .page() correction (`65b21d0`); the plan (`c78c5b0`) and the rule-provenance audit (`c16abc8`).

## Reflect — what the session was

Between, leaning emergent. The work began outside this repo: a user-level writing skill was built and tested in an internal-medicine session, then the operator asked to port it here. The intent named one skill. It grew by six recorded amendments, each agreed: the test groundwork, two more calls, a lean finish after the rules audit, a shared browser pass, all four remaining domain skills ("I want to do it here and now"), and the review's seven fixes. The destination moved from "add a writing skill" to "the task skills are thin handlers over five domains". The plan document (`planning/plans/2026-10-30-domain-skills.md`) carried the design throughout and was amended in place, so the shape held even as the scope grew. The shape served the work: the operator discovered what he wanted — DRY skills with one owner per rule — by seeing the first one built.

## Evaluate — how the human supervised the AI

**Pushback & steering** discriminated this session most, and it was strong. The operator rejected Claude's naming twice (thing-action, then the shared-suffix options) for plain English, on the grounds of discoverability; rejected `kiss-html` and then took `kiss-front-end` over his own `kiss-best-practice` once the competition with the other four skills was named; and stopped the branch mid-flight to ask whether the repo's own rules "haven't slipped in by AI". That question changed the branch: the provenance audit found most testing rituals were promoted by `/memory-consolidate` with no recorded operator decision, and the branch stopped adding that machinery. He also refused to defer the remaining domains to four later branches.

**Harness leverage** was strong on both sides. The operator invoked `/codex:adversarial-review` with a focused question ("how D.R.Y. are our skills?"), which found a real contradiction that started in `GUIDE.md` itself (title is not a model field — `lib/controller-resolver.js:129` says otherwise) and an overreaching stale-facts rule. Claude used fresh-context agents for the plan critique (Codex, 1 blocker and 6 majors before any work depended on the plan), the provenance trace, the two trials on example 12 and a branch review (7 findings, none high). One miss was shared: `/code-review`, typed in this session, ran in the session's own repo (internal-medicine), not in kiss-ssg, because the session lived there. Claude did not warn that repo-scoped commands would target the wrong folder; it caught the result afterwards.

**Verification & ownership** is where the supervision was thin, on the human side. Everything was verified — by tests (2,766), a sentence-by-sentence search for every moved line, a cross-reference grep, mutation checks of new test rows, three independent reviews — but by agents. No person read a domain skill end to end before the close; the operator deferred the look to the PR. The skill most in need of that look is `kiss-seo`, the one written mostly fresh rather than moved.

**Iteration discipline** was mixed. The groundwork landed in small, red-first commits. But the largest change — about 3,500 words moved across seven files by one script (`7140f84`) — was verified mechanically, in one step, with one pulse on the whole branch. The checks that followed found what the move had broken: two coverage rows that could never fail, a renumbering slip, a lost 404 check, three owners for alt text.

**Where the human intended to supervise, versus where he did:** he intended to steer the shape, and did, decisively. He did not intend to hand the final judgement of the skills' content to agents, but the deferred eyeball means that is what happened at the close.

Claude's own errors, each caught: `llms.txt` measured in bytes (15,997) not characters (15,938), caught by the plan critique; overclaims ("every rule here was measured", "rankings"), caught on re-reading; doubled backslashes from a scripted row change; the writing skill's "copy belongs in the model", which contradicted `kiss-page-add`; and a prose file written through a shell heredoc.

**Competency level: Active supervisor**, with the workflow habits of an agentic engineering lead — independent reviews by choice, a provenance audit of the repo's own rules, durable guidance changed rather than worked around. The human verification at the close is what keeps it from the higher level.

## Feedback — recommendations for next session

- **Operator — read `kiss-seo` end to end on the PR before merging.** It is the least evidenced of the five and the one no move protected; then one other domain skill, as its domain's expert would.
- **Operator — run repo-scoped commands from a session opened in that repo.** `/code-review` here reviewed internal-medicine's last commit. Open a session in `C:\code\kiss-ssg` for its close-out work, or name the repo in the command.
- **Claude — when the session's folder is not the repo being changed, say so before a repo-scoped command runs** (`/branch-open`, `/branch-close`, `/code-review`), and route it to the right repo's skill. This session did it for the rituals but not for `/code-review`.
- **Claude — after a scripted move or row change, mutate one target and watch the test fail before trusting it.** Two "five checks" rows passed against the wrong lists until a reviewer found them; one changed heading would have shown it.
- **Both — a branch whose scope grows by amendment needs a pulse after each growth, not one at the start.** Six amendments and one pulse left the big move verified only at the close.
- **Process — review the repo's rules (`planning/specs/2026-10-30-rule-provenance.md`) before the next domain branch**, and start each new domain (performance, privacy and security, information architecture were named as gaps) from a research report, as the writing skill was.

## Verdict — did we achieve the objective?

The brief was one domain skill, called by the task skills instead of restated. **The objective moved, and it was good drift:** every amendment was the operator's, recorded with his reason, and the result is the structure he described — five domain skills with one owner per rule, and task skills that hold only kiss mechanics.

- [x] `kiss-writing-for-the-web` with a kiss section, credits (Humanizer's MIT licence reproduced) and no Learna content — `215be56`.
- [x] The copy rules live once; the task skills call the skill; the rows were seen red first — `89f0b48`, `e64f1a2`.
- [x] `llms.txt` names the skills within the cap (15,982 of 16,000); the READMEs and the plugin description list them — `bf4b9d3`, `7140f84`.
- [x] `CLAUDE.md` records the two kinds of skill — `bf4b9d3`, `7140f84`.
- [ ] Trials kept in `test/skills/` — dropped by the operator's lean-finish decision; two recorded trials on example 12 stood in.
- [ ] Triggering measured — dropped by the same decision.
- [ ] Clean-room build — dropped by the same decision.
- [x] The plan, critiqued before work depended on it — `c78c5b0`.
- [x] Gates green (test, lint, typecheck, format, pack) and an independent review — Codex up to `f0fa3be`, a fresh review up to `65b21d0`. `e170790..41d6437` (the review's fixes, the version bump and the CHANGELOG) was reviewed by the author only.

**Measurably better:** `kiss-site-review` went from 5,295 to 1,769 words and `kiss-site-new` from 4,105 to 3,425, with no rule dropped; each area of expertise is one file an expert can review; `GUIDE.md` now states the title order the engine has always used.

**Still open:** the operator's eyeball on the PR; the rules review; the domains not yet covered; whether `kiss-site-review` should run all five reviews every time; and the unchecked report that `npx kiss-ssg check` writes a staging folder inside the site while it runs.
