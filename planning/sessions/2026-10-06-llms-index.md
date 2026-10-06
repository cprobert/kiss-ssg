---
branch: chore/llms-index
base: main
status: closed
opened: 2026-10-06
---

# Session — 2026-10-06: llms.txt back to an index

## Intent (captured at /branch-open)

**Objective:** Cut `llms.txt` from 130k characters to an index under 16k, so the `@node_modules/kiss-ssg/llms.txt` import that `kiss-ssg init` writes into every site's `CLAUDE.md` stops filling most of Claude Code's 150k instruction-file budget. The detail moves to `GUIDE.md` and the skills, and a test stops the file growing back.

Prompted by a consuming site's warning: "3 instruction files add up to 251.2k chars, over the 150.0k-char total limit · largest: node_modules\kiss-ssg\llms.txt (129.4k)". The file grew from 5.7k (2026-09-02) to 44k (09-08), 97k (09-16) and 130k (10-06, measured with `git show … | wc -c`). It grew because every public API change adds a passage and nothing ever takes one out.

**Success criteria:**

- [ ] `llms.txt` is ≤ 16,000 characters, and a test in `npm test` fails when it exceeds that — seen red against today's file before the pruning lands.
- [ ] Nothing an agent needs is lost, only moved: every section cut from `llms.txt` either has a home in `GUIDE.md` or a shipped skill (`kiss-build-check` for report reading, `kiss-site-migrate` for v1), or is named here as deliberately dropped. `llms.txt` links to those homes.
- [ ] `llms.txt` follows the llmstxt.org shape: H1, a summary blockquote, then sections that are short indexes or lists of links, not reference prose.
- [ ] The tests that pinned passages in `llms.txt` (`skill-coverage.test.js` rows, `CONTRADICTIONS`, the "names every skill" check, and the others found by grepping `test/`) are repointed to where the passage now lives, not deleted. A row that guarded against a stale sentence still guards against it.
- [ ] The CLAUDE.md rule "Public API changes: update `llms.txt`" now says the index line goes in `llms.txt` and the detail goes in `GUIDE.md`, so the rule stops refilling the file.
- [ ] **Clean-room run:** a fresh sub-agent given only the packed tarball starts in an empty folder and builds a site that passes `kiss-ssg check`, reporting every place it had to guess. Run it against the slim `llms.txt` and compare its guesses with the 2026-09-27 run's findings.
- [ ] **Fleet unchanged:** the sites under `C:\Code\kiss` build identically on `main` and on the branch (expected trivially, since no build code changes; checked anyway).
- [ ] `npm run gates` passes.

**Non-goals / out of scope:** Changing what `kiss-ssg init` writes (the `@` import stays: a slim index loaded every session is the point). Pruning `GUIDE.md` or this repo's `CLAUDE.md`. Any change to `lib/` behaviour. The consuming site's own 116.6k `CLAUDE.md` belongs to that site, not this branch.

**Impact surface:** tooling & docs (shipped): `llms.txt` is in the tarball and read by every consuming agent, but no API or config changes and no site has to adapt. A patch bump is proposed; the operator decides at close.

**Expected shape:** planned. The sections and their homes are mapped (see the branch-open conversation). The judgement is in what each index line keeps.

**Delegation convention:** the main session does the pruning itself, because the judgement is in the cutting. Sub-agents only for the clean-room run and an adversarial read of the slim file. Agents never commit.

### Amendments

- **2026-10-06: clean-room findings absorbed (operator's decision).** The clean-room run passed (`ok ./public (check) — 11 pages, 0 failed`, re-run locally, exit 0) and surfaced six documentation gaps. All of them predate the cut: the old 130k `llms.txt` did not answer them either. The operator chose to fix all of them here: the default id keeps `index` (`menu/index.hbs` → `menu/index`, read off `lib/page-registry.js:46`); a pointer to the audit's checks; `registerHelpers(kiss)` receives the instance, and config is read at render time from `options.data.root.config`; a JSON-LD recipe that escapes `</script>` (run against the engine before it was written down); the hand-written-URL rule's second exception, for files another method writes (`/feed.xml`); and two `GUIDE.md` typos. Criterion 7 (fleet) is recorded as met by construction: `git diff main...HEAD -- lib bin types starter package.json` is empty, so the sites would build byte-identical output. It was not run.

## Pulse log

- **2026-10-06** — criteria 1, 3, 4, 5, 8 met (`llms.txt` 12,734 chars, cap test seen red at 129,371; gates green at `352fc28`); 2 partial (the audit's gaps moved into `GUIDE.md`, four minor items left unmoved pending the operator, and the moved text not yet re-checked); 6 (clean-room) and 7 (fleet) not yet. No drift: docs, tests and skills only, inside "shipped docs". **Eyeball: deferred** — reading the new `llms.txt`, especially "Traps nothing reports", is carried to `/branch-close` Step 5a. Explanation offered: "Building a site well" and the tiers sit as `####` under § The build script, after the config table, to avoid a new docs-site page. Decision: continue — clean-room run next, which doubles as the independent check on criterion 2.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-10-06: llms.txt back to an index

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped (2.7.4):**

- `352fc28`: `llms.txt` cut from 130,164 to 12,734 characters, with its detail moved into `GUIDE.md` and a 16k cap in `test/aikb.test.js`.
- `c783ebd`: six documentation gaps the clean-room run found, fixed (13,338 characters after it).
- `423c2a2`: the docs-sweep tooling now describes `llms.txt` as the index.
- `1805233`: corpse-collector's Check 5 skips `GUIDE.md`.
- `0587965`: version 2.7.4.

## Reflect — what the session was

The goal arrived as evidence rather than a request: a screenshot of a consuming site's warning, with `node_modules\kiss-ssg\llms.txt (129.4k)` named as the largest file. Claude measured before proposing anything:

- `lib/init.js:10` `@`-imports the file into every site's `CLAUDE.md`;
- the file grew 5.7k → 130k in five weeks (from `git show … | wc -c` at sampled commits);
- a size per section.

That made the proposal concrete enough for "proceed" to mean something. The shape was **planned**, and stayed so. The open fixed the four real decisions with one `AskUserQuestion`:

- keep the import;
- detail goes to `GUIDE.md`, not a new `llms-full.txt`;
- a 16k cap;
- the clean-room and fleet criteria.

What emerged were two findings, each absorbed by an explicit operator decision. The coverage audit found about a dozen kinds of fact that existed only in `llms.txt`. The clean-room run found six older gaps. Neither re-planned the work.

## Evaluate — how the human supervised the AI

**Problem framing — strong.** The screenshot was the brief, and the open's answers settled everything that would otherwise have been guessed. One answer overruled Claude's first suggestion. Claude had proposed dropping the `@` import (change 1 of three). The operator kept it, which removed the migration, the `lib/init.js` change and the minor bump in one decision. It was the better shape: the index _should_ be always-on.

**Learning engagement — the standout.** Mid-branch the operator asked, unprompted, "you're now using a lookup system … as opposed to loading automatically. Is this correct?" That is the right question at the right moment. The answer ("yes, mostly") surfaced the one design point the change rests on: lookup only works when the agent knows to look. That is why "Traps nothing reports" stays in the always-loaded half. It also led straight to the clean-room run, which tested that claim instead of asserting it.

**Verification & ownership — strong from Claude, absent from the human on the one artefact that matters.**

Claude's checks:

- the cap test was seen red at 129,371;
- the new `CONTRADICTIONS` row was seen red against the stale skill sentences;
- the scanner fix was seen red by extracting the old filter first, so the failure was behavioural rather than "not a function";
- the clean-room agent's `ok` was re-run locally rather than relayed;
- its first guess was checked against `lib/page-registry.js:46`;
- the JSON-LD recipe was executed against the engine, with a `</script>` in the data, before it was written into `GUIDE.md`.

But the eyeball was deferred **twice**: at the pulse, then at the close, to the PR. The artefact is `llms.txt` itself, the 13k every session of every site will now load. Nobody but models has read it. "Nothing lost, only moved" rests on a same-family sub-agent's coverage audit and a same-family clean-room run. Codex's review ("no actionable regressions") is the one different-family read, and it covered the diff only up to `c783ebd`. By `CLAUDE.md`'s own rule that is one opinion held by two Claude agents, not confirmation.

**Iteration discipline — good, and a lesson that stuck.** The 2026-10-03 log told Claude to offer the pulse at the boundary it named, even inside a "proceed". This time Claude stopped after the first slice landed and offered it. The operator took it, and the pulse is where the plan for criterion 2's independent check (the clean-room run) was set.

**Harness leverage — good on both sides.** Claude used sub-agents for the coverage audit and the clean-room run, keeping 130k of file reading out of the main context. The operator typed `/codex:review` before the close. That bought a different-family read, but the four commits after it went unreviewed. Running it at the ritual's Step 7 instead would have covered them.

**Where Claude slipped:**

- **Four minor items left unmoved were _filed_, not asked.** These were the id `getModelByID` gives object models, the `Serving …` timing, `splitDocument`'s option names, and the `subject-hash` block. Claude wrote "say if you want them in" at the bottom of a report. `CLAUDE.md` says a note the operator has to notice has been filed, not raised. They are still undecided.
- **A throwaway script was written with a quoted heredoc** (`repoint.mjs`). The 2026-10-03 log named this, and `retired.md` shows the shell-prose lesson re-routed three times already. Claude flagged the slip itself, but it is a fourth recurrence.

**Intended vs actual supervision.** The operator intended to read `llms.txt`. The pulse asked, and so did the close. In practice the read was deferred onward each time, and the branch closes on Claude's and Codex's reading of it. That is a deliberate, tracked deferral, not a waved-through one, but the PR is now the last stop.

**Competency level: Active supervisor.** The framing, the steer on the import, the understanding check and the taken pulse earn it. The twice-deferred eyeball on the one shipped artefact is what keeps it short of Agentic engineering lead.

## Feedback — recommendations for next session

- **Operator — read `llms.txt` before merging the PR.** About ten minutes; the "Traps nothing reports" section matters most. It is the only text every agent on every site now carries, and no human has read it. If it is wrong, the cap means it is wrong for everyone.
- **Claude — ask, don't file.** A list of undecided items at the bottom of a report is a note, not a question. The four unmoved details should have been one multi-select `AskUserQuestion` at the moment the audit came back. Next time, any "say if you want…" sentence becomes the question itself.
- **Claude — the Write tool for every file, scratch scripts included.** This is a recurrence _after_ three re-routes of the same retired lesson. Before any `cat >` or heredoc that writes a file, stop and use Write. `/memory-consolidate` should see this.
- **Process — when the operator runs `/codex:review` mid-ritual, re-run it at Step 7 if commits followed.** Here four commits after `c783ebd` were never reviewed by anything but the author. The fix is to add one line to `/branch-close` Step 7: a review older than `HEAD` covers only the diff it saw.
- **Both — the site's own 116.6k `CLAUDE.md` is now the budget.** With `llms.txt` at 13.3k the warning's three files total about 135k of 150k (13.3 + 116.6 + 5.2). That is under the limit, but by 15k, and the site's file is the one that grows. It is outside this repo, so it is worth a look on that site.
- **Process — Check 6 flags `config.business` inside `GUIDE.md`'s JSON-LD recipe.** `isTemplateConfigRead` only recognises mustache reads, not a site's own key read in JS. It is one known false positive now. If a second appears, widen the rule to a `GUIDE.md` code-fence exemption.

## Verdict — did we achieve the objective?

**Brief:** cut `llms.txt` to an index under 16k so the `init` import stops filling the instruction-file budget, move the detail to `GUIDE.md` and the skills, and stop it growing back.

**Met**, with one human check deferred to the PR.

- [x] `llms.txt` ≤ 16,000 characters, capped by a test seen red. It is 13,338; the test was red at 129,371.
- [x] Nothing lost, only moved. Evidence: the coverage audit's gaps were moved into `GUIDE.md`, mostly verbatim. The clean-room run's guesses were all older gaps, unanswered in the 130k file too. Four minor details remain unmoved and undecided (see Feedback), and every check here was a model's, the fresh agents Claude too.
- [x] The llmstxt.org shape: H1, a summary blockquote, short sections, links.
- [x] Pinning tests repointed, not deleted. The skill-list minimum went from 2 to 1; one ban was retired because it is now true; a new ban was added and seen red.
- [x] The CLAUDE.md rule rewritten: one index line in `llms.txt`, the rules in `GUIDE.md`.
- [x] Clean-room run. A fresh agent with only the tarball built a ten-page site that passed `check` on its first run (`ok ./public (check) — 11 pages, 0 failed`, re-run locally, exit 0). Its six guesses are now documented.
- [x] Fleet unchanged — **by construction, not measured**. `git diff main...HEAD -- lib bin types starter package.json` is empty except for the version line; the sites were not built.
- [x] `npm run gates` green at `0587965`, with prettier clean over all 28 changed files.

**Impact:** every session on every kiss site loads about 13k of kiss documentation instead of 130k. The site that raised the warning drops from 251k to about 135k of instruction files, under the 150k limit. And the rule that grew the file now sends rules to `GUIDE.md`, behind a test that fails at 16k.

**Still open:**

- the operator's read of `llms.txt` (PR);
- the four unmoved details;
- whether "The tiers, in full" and "Building a site well" deserve their own docs-site page rather than sitting below the config table.
