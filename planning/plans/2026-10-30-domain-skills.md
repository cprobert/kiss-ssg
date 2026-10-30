# Domain skills: expertise in one place, called by the task skills

**Date:** 2026-10-30. **Session:** `planning/sessions/2026-10-30-kiss-writing-for-the-web.md`. **Status:** the contract for the five branches below. Amend it in place, with a dated section; never fork it.

## Why

Today the `kiss-ssg` plugin's six skills are **task skills**: each one does a job (build a site, add a page, review a site). The expertise a professional site needs sits inside them as rules:

- `kiss-site-new` holds the rules against invented facts, the form rules, image sizing and ten usability floors.
- `kiss-site-review` holds 20 craft checks, the external-links rule, the copy checks and the design lift.

The same rule is often written twice, once as a floor in `kiss-site-new` and once as a check in `kiss-site-review`. No one person can review a domain, because a domain is spread across files. And some domains have no home at all: nothing in kiss says how to write the words on a page.

The operator's aim (2026-10-30): kiss is a set of skills that help an agent build better websites, and each area of expertise must be solid enough for an expert in it to review. So the expertise moves into **domain skills**, and the task skills call them.

## The shape

| Kind             | Skills                                                                                                            | Job                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Task skill**   | `kiss-site-new`, `kiss-site-import`, `kiss-page-add`, `kiss-site-migrate`, `kiss-build-check`, `kiss-site-review` | The kiss mechanics: the build script, models, views, the check, the audit. At set steps it calls the domain skills it needs. |
| **Domain skill** | `kiss-writing-for-the-web`, `kiss-seo`, `kiss-accessibility`, `kiss-html`, `kiss-design`                          | One area of expertise: its rules, its checks and where its concern lives in a kiss site.                                     |

All eleven stay in the one `kiss-ssg` plugin, so a site installs one plugin to get them. The operator's reason: users should not have to install several plugins, and helping agents build better websites is the core of kiss. `kiss-memory` stays a separate plugin because it does a different job.

**Names.** A task skill is named thing-action (the 2026-09-12 rename). A domain skill has the plain name of its domain, prefixed `kiss-`, because the operator wants the names as easy as possible for an agent to find and match. This rule goes into `CLAUDE.md` on the first branch.

## What a domain skill is: the contract

Every domain skill keeps to these rules. The first branch builds the first one to them, and a later branch that finds a rule wrong amends it here first.

1. **One folder:** `plugins/kiss-ssg/skills/<name>/`, with `SKILL.md` and, where the material is long, `references/`. `name:` in the frontmatter equals the folder name (`test/unit/plugin-manifests.test.js`).
2. **A description that triggers.** It says what the skill does and lists the words people use for it. It also says what it is **not** for, naming the sibling skill that is, so that two domain skills do not both fire on one request. Its triggering is measured before the branch closes, with near-misses from the other domain skills and the task skills.
3. **Two modes, in this order in the file:**
   - **Build mode:** the rules to follow while writing a site or a page. `kiss-site-new`, `kiss-page-add` and `kiss-site-import` use this.
   - **Review mode:** the checks, each with how to measure it, reported to the shared review protocol (rule 10), so the review can merge every domain's findings into one table.
4. **A section on where its concern lives in a kiss site.** It points at the shipped docs (`node_modules/kiss-ssg/GUIDE.md` and `llms.txt` sections) and never restates the API. Every package path it cites must exist and be packed. **Today `plugin-manifests.test.js` checks this for `SKILL.md` only** (it lists each skill's `SKILL.md`, reads inline-code paths only, and checks packing by top-level whitelist entry, ignoring `!` exclusions). Branch 1 extends it to every `.md` in the skill folder, to relative links between plugin files, and to the real packing rules, each seen red first.
5. **It works alone.** A person can invoke a domain skill directly ("check the copy on this page") without a task skill.
6. **Shared rules have one owner,** and the other skills point at it:
   - **No invented facts:** `kiss-writing-for-the-web` owns it. Today `kiss-site-new` owns it and `kiss-site-review`'s design lift points there.
   - **Look for the decision** (a recorded choice is not a finding, with its **ask** exception): the shared review protocol owns it (rule 10).
   - **Sticky bars:** `kiss-accessibility` owns the measurement and the fix that keeps focus visible (`scroll-padding-top` and `-bottom`, WCAG 2.4.11, checks 7 and 10 today). `kiss-design` owns how much of a phone screen a bar takes, and points at `kiss-accessibility` for the padding.
7. **Floors, and who they reach.** A task skill keeps a **one-line floor** for each non-negotiable rule it hands over (for example "never invent a fact about the business; `kiss-writing-for-the-web` has the rule in full"), for an agent that runs the task skill but does not load the domain skill. The floor is a pointer, not a second copy. **Agents with no plugin skills** (Cursor, Copilot) read only `llms.txt` and the `AGENTS.md` that `init` writes, which points at `llms.txt` and the examples (`lib/init.js`). Measured on 2026-10-30: `llms.txt` § Building a site well has five habits and none of these floors, so **today the rules in `kiss-site-new` do not reach those agents at all**. Each branch decides whether its domain's most important rule earns one habit line in `llms.txt`, within the budget below. Branch 1 proposes one: never invent a fact about the business; mark what is missing.
8. **Sources are credited.** A `references/sources.md` names the evidence behind the rules. Third-party material keeps its licence notice (the Humanizer patterns are MIT; kiss is Apache-2.0).
9. **Tested on kiss's own material, in two kinds.**
   - **Automated, in `npm test`:** the `skill-coverage.test.js` rows, the CONTRADICTIONS bans and `plugin-manifests.test.js`. Vitest runs only `test/**/*.test.js`.
   - **Agent trials, recorded, not gated:** cases in `test/skills/<name>/<case>/`, outside the plugin folder so they do not install with it, in the layout `claude plugin eval` reads (`prompt.md`, `case.yaml`, `graders/`, `files/`). They use `examples/` content only, never a real business's pages, because the repo is public. Each case runs with and without the skill; the grades and timings go in `planning/skill-trials/<name>/<date>/`. A branch passes when the skill wins or ties on every discriminating assertion and adds no unbracketed fact. A small vitest test checks that each case folder has the files the layout needs.
   - **Moving a rule moves its coverage.** Several rows are compound and span future owners (`skill-coverage.test.js` around lines 323–344, 364–369, 389–394, 407–412 and 421–431, including the "twenty numbered checks" assertion). Before a branch moves a rule, it splits the rows it touches by owner, so the task skill keeps assertions for its calls and floors, and the domain skill gets assertions for the rule.
   - **CONTRADICTIONS cannot be file-scoped today:** every pattern runs against every shipped file, so banning a moved sentence would also ban it in its new owner. Branch 1 first adds an optional scope to an entry (the files it applies to), with a test showing the sentence passes in its owner and fails in the file it left.
10. **One review protocol, shared.** The rules for reporting live in one file, `plugins/kiss-ssg/skills/kiss-site-review/review-protocol.md`, and every domain skill's review mode points at it by relative path, so a domain skill run alone reports the same way:
    - report every finding before editing anything;
    - the table (Priority, Where, What, Measured, Why it matters, Proposed fix), one row per cause, and the P0–P3 definitions;
    - look for the decision: a recorded choice is not a finding, **except** a record whose own reason a measurement now contradicts, which is reported and marked **ask**;
    - the operator picks what is fixed, and the check runs again after each fix.

## How the task skills call them

| Task skill         | Step                                                             | Calls                                                                      |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `kiss-site-new`    | Step 5, "Whatever the look, keep these" and the usability floors | Each domain skill's build mode                                             |
| `kiss-page-add`    | Writing the page's view and model                                | `kiss-writing-for-the-web`, `kiss-accessibility`, `kiss-html` (build mode) |
| `kiss-site-import` | Lifting the copy into models                                     | `kiss-writing-for-the-web` (build mode: keep every fact, invent none)      |
| `kiss-site-review` | Step 3, the browser pass and craft pass                          | Each domain skill's review mode; their rows merge into step 4's table      |
| `kiss-site-review` | Step 5, the design lift                                          | `kiss-design`                                                              |

`kiss-site-review` keeps what is about kiss rather than a domain: running `check`, reading `audit` and `links`, serving the build folder, `audit.ignore`, and the shared `review-protocol.md` (rule 10), which holds the report table, its priorities and the "look for the decision" rule.

## Where today's rules go

Measured by reading `kiss-site-new` and `kiss-site-review` on 2026-10-30. Check numbers are `kiss-site-review`'s craft pass.

| Rule today                                                                                                                                                                                                                                                                                             | Owner                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Never invent a fact; visible placeholders; the business name read off a domain is a guess (`kiss-site-new` step 5)                                                                                                                                                                                     | `kiss-writing-for-the-web`. The kiss mechanics stay in `kiss-site-new`: a placeholder goes in the model; a fan-out section gets no placeholder item, because it would publish a URL into the sitemap and the feed |
| Placeholder, demo and scaffold copy (`kiss-site-review` step 3)                                                                                                                                                                                                                                        | `kiss-writing-for-the-web` (review mode)                                                                                                                                                                          |
| Check 9: a form that collects personal details says what happens to them                                                                                                                                                                                                                               | `kiss-writing-for-the-web` (the words, marked for the owner to confirm), with `kiss-accessibility` for where the line sits                                                                                        |
| The 404 page helps someone who is lost (step 3)                                                                                                                                                                                                                                                        | `kiss-writing-for-the-web` for the words; `ignoreSitemap` stays in `kiss-site-review`                                                                                                                             |
| Check 20's empty-state line and correct singular                                                                                                                                                                                                                                                       | `kiss-writing-for-the-web` for the words; building the 0 and 1 cases stays in `kiss-site-review`                                                                                                                  |
| The audit's `title-*` and `description-*` fixes                                                                                                                                                                                                                                                        | The layout fix stays in `kiss-site-review`; what a good title and description say goes to `kiss-seo`                                                                                                              |
| Checks 1, 2, 10, 11, 12, 13, 16, 18; check 5's `prefers-reduced-motion` half; visible labels; an error message below its field (its words go to `kiss-writing-for-the-web`); no positive `tabindex`; the viewport zoom floor; 16px inputs and `autocomplete`; the sticky-bar padding (checks 7 and 10) | `kiss-accessibility`                                                                                                                                                                                              |
| Image `width`/`height` and `loading="lazy"`; the interactivity ladder (platform, then Alpine's CSP build); checks 8, 14, 15, 17; `overflow-wrap: anywhere`; the external-links rule                                                                                                                    | `kiss-html`                                                                                                                                                                                                       |
| Checks 3, 4, 6, 19; check 5's visible hover-and-press half; check 7's share of the screen; consistency across templates; things that look clickable and are not; the design lift (step 5); the `frontend-design` guidance                                                                              | `kiss-design`                                                                                                                                                                                                     |
| `<main>` and `<nav>` for the Markdown copies; `{{link}}`; `.robots()`, `.feed()`, `aliases`, `links.*`                                                                                                                                                                                                 | Stay in the task skills: these are kiss mechanics. `kiss-seo` points at them                                                                                                                                      |

## Branches, in order

One branch at a time, each opened with `/branch-open`.

1. **`kiss-writing-for-the-web`** (this branch). First the groundwork every later branch needs, each change seen red before it is green:
   - file-scoped CONTRADICTIONS entries (rule 9);
   - `plugin-manifests.test.js` checking every `.md` in a skill folder, relative links and the real packing rules (rule 4);
   - the shared `review-protocol.md` (rule 10), cut out of `kiss-site-review`, which then points at it;
   - the case-folder check and the trial layout (rule 9).

   Then the skill: port the user-level skill, add the kiss section and the trials, split the coverage rows it touches by owner, move the copy rules in the table above out of `kiss-site-new` and `kiss-site-review` with one-line floors left behind, and add the naming rule to `CLAUDE.md`. `kiss-page-add` and `kiss-site-import` get their one call each if the operator agrees (it widens the branch's recorded intent). Writing goes first because it is mostly new material and moves the fewest rules.

2. **`kiss-accessibility`.** It takes the largest share of the craft checks, so it proves the review-mode merge at scale.
3. **`kiss-html`.**
4. **`kiss-seo`.** Much of SEO is already in the engine (the audit, `.sitemap()`, `.robots()`, `.llms()`, `canonical`), so this skill is about the content side: search intent, titles, descriptions, the reader's own words. It must not repeat what the audit reports.
5. **`kiss-design`.** It changes the README's stance ("kiss decides how a site is built, not what it looks like") and must decide whether `frontend-design` stays a complement or is replaced.

Each branch is done when its domain's rules live only in its skill (with floors and pointers left behind), its tests are green, its triggering is measured and a clean-room agent has used it.

## Budgets

- **`llms.txt`:** 15,938 of 16,000 characters on 2026-10-30, measured as `test/aikb.test.js` measures it (JavaScript string length; 15,997 is its size in bytes). `skill-coverage.test.js` requires **every** `kiss-ssg` skill on **each line that names both `kiss-site-new` and `kiss-page-add`**, so the roster stays one line, or the test's parser changes first. Each branch cuts at least as many characters as it adds (the name, its backticks and its separator, plus any habit line from rule 7), and says what it cut and where that text now lives.
- **`SKILL.md`:** the task skills run to 349 lines at most. A domain skill aims for under 250, with the long material in `references/`.
- **The task skills get shorter.** A branch that moves rules out and does not make `kiss-site-new` or `kiss-site-review` shorter has copied, not moved.

## Critique, 2026-10-30

A fresh Codex session read this contract and the repo, before any work was built on it, and reported eight findings. Claude re-checked the four that rest on measurements (the CONTRADICTIONS walk, `plugin-manifests.test.js`'s scope, vitest's `include`, the `llms.txt` length) against the files, and all four held. Each finding is answered above:

| Finding                                                                                                      | Severity | Where answered              |
| ------------------------------------------------------------------------------------------------------------ | -------- | --------------------------- |
| A CONTRADICTIONS ban runs on every file, so it would ban a moved sentence in its new owner                   | blocker  | Rule 9, branch 1 groundwork |
| Floors in task skills do not reach agents without skills; `llms.txt` has none of them                        | major    | Rule 7                      |
| Compound coverage rows span future owners                                                                    | major    | Rule 9                      |
| The rules table missed check 5, the error-message placement, positive `tabindex`, and the sticky-bar overlap | major    | The table; rule 6           |
| A domain skill run alone had no reporting protocol, and the **ask** exception was dropped                    | major    | Rule 10                     |
| `plugin-manifests.test.js` checks `SKILL.md` only                                                            | major    | Rule 4, branch 1 groundwork |
| No case format, runner or result location for the trials                                                     | major    | Rule 9                      |
| The `llms.txt` count was bytes, and the roster must stay on one line                                         | minor    | Budgets                     |

## Open questions

- **The HTML skill's name.** `kiss-html` is the working name in this plan. The operator finds it too generic and proposed `kiss-best-practice` (2026-10-30). Claude's concern: every domain skill is best practice, so that name says how good the advice is rather than what it covers, and would compete with the other four; Claude suggested `kiss-front-end` (or `kiss-web-performance`, `kiss-web-standards`). Decide on branch 3.
- **Does a domain skill speak to non-kiss sites?** The contract says it works alone; whether its general rules are written so they would serve any site is open. Decide on branch 1, from the trial on a kiss example.

## Amendment, 2026-10-30: a lean finish, and the rules are the operator's

The operator asked for the repo's rules to be traced to who decided them (`planning/specs/2026-10-30-rule-provenance.md`). Most of the testing machinery this contract leans on (the prose regex rows, CONTRADICTIONS, seen-red first, the trial and triggering rituals) was promoted into `CLAUDE.md` by `/memory-consolidate` with no recorded operator decision. Until the operator reviews those rules on their own branch:

- rule 9's regex rows and CONTRADICTIONS bans are **not** required of later domain-skill branches; branch 1 keeps the ones it already added, and the rules review decides them, `allowedIn` included;
- rule 9's agent trials, rule 2's triggering measurement and the clean room are optional, run when the operator asks;
- the rest of the contract (one owner per rule, build and review modes, the shared review protocol, the kiss section, floors) stands, because it is about the shape of the skills, not about the repo's process.

## Amendment, 2026-10-30: all five on branch 1

The operator asked for the whole split now, not over four more branches: "I would like the skills to encapsulate domain knowledge so that our front-end skills act like thin handlers. I don't want to do this again on a later branch." So branch 1 built all five domain skills, and the branch order above no longer applies.

- **The HTML skill is `kiss-front-end`** (the operator's choice, over his earlier `kiss-best-practice`), which closes that open question.
- **How the text moved:** a script cut each block out of `kiss-site-new` and `kiss-site-review` by its opening words and placed it in its owner word for word; it stopped if a block was missing. Every removed sentence was then searched for in the skills: the only ones not found were framing sentences rewritten on purpose and check-number references. The craft checks are renumbered inside each domain skill, and their cross-references follow.
- **One deliberate exception to "move, don't rewrite":** `kiss-seo` is mostly new. The task skills held little SEO beyond kiss mechanics, so its build mode comes from Google Search Central's guidance in the research report behind `kiss-writing-for-the-web`, plus the `disallow`/`noindex` reasoning moved from `kiss-site-new` and what the audit's search checks already say.
- **Check 7 is whole in `kiss-accessibility`**, with the padding that keeps focus clear of a bar; `kiss-design` points at it for a bar's share of the screen, instead of splitting one measurement across two skills.
- **The coverage rows** that pinned the moved rules now point at their owners; a row whose needles spanned several owners was split by owner, with no needle dropped.
- **Still open:** does `kiss-site-review` run every domain's review every time, or only those the operator asks for? Today it runs all five. The operator decides once a full review has been run on a real site.

## Amendment, 2026-10-30: a sixth domain skill, `kiss-information-architecture`

The operator supplied a research report on information architecture and asked for a domain skill built from it (`planning/sessions/2026-10-30-kiss-information-architecture.md`). It follows the contract above and adds one row to the shape:

| Domain skill                    | Owns                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kiss-information-architecture` | Which pages exist and their types, grouping and naming of sections, the navigation layers, showing where a reader is, breadcrumbs, the URL scheme, categories and tags, orphan pages, the 404 as a way back in |

- **It owns the structure and points for the rest (the operator's decision).** A label's wording stays `kiss-writing-for-the-web`'s, `aria-current` and landmarks `kiss-accessibility`'s, and one purpose per page, canonical copies and moved URLs `kiss-seo`'s. No rule moved out of the other five, so no coverage row moved either.
- **The report's research methods and governance are left out** (the operator's decision: agents can't act on them).
- **The task skills call it:** `kiss-site-new` before the first view, `kiss-page-add` for where a new page sits, and `kiss-site-review` in its domain reviews. `kiss-site-review` now runs six.
- **Its review measures something the build does not report:** pages no other page links to. The script is in the skill's `references/measure-structure.md`, run against examples 4, 6 and 11 and a build with a planted orphan before it shipped.
