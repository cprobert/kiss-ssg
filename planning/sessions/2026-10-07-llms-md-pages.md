---
branch: feat/llms-md-pages
base: main
status: closed
opened: 2026-10-07
---

# Session — 2026-10-07: A Markdown copy of every page, for agents

## Intent (captured at /branch-open)

**Objective:** Every HTML page a kiss build writes gets a clean Markdown copy beside it (the llmstxt.org convention), made by converting the built HTML with turndown rather than by processing compile inputs, and `llms.txt` links to those copies — so an agent reading any kiss site gets the page's content without its markup.

Context: prompted by Webstudio's docs, which serve every page at `<url>.md`. A throwaway spike (scratchpad, 2026-10-07) converted `docs/guide/checking/index.html` with turndown 7.2.4 + `turndown-plugin-gfm` and with node-html-markdown 2.0.0: both preserved hrefs verbatim and converted tables; turndown's tables were compact where node-html-markdown padded them to column width, and turndown has a built-in `remove()`. turndown chosen; `turndown-plugin-gfm` was last modified 2022, an accepted risk with node-html-markdown as the fallback.

**Success criteria:**

- [ ] On by default: every HTML page the build writes — including `404.html` and pages left out of the sitemap — has a Markdown copy at the llmstxt.org path (`page.html` → `page.md`, a directory index → `index.md`), and a per-page / site config switch turns it off.
- [ ] The copy is converted from the page's `<main>` when it has one, otherwise `<body>`, with `script`, `style` and `nav` always dropped; a config key overrides the selector. Seen on a built docs-site page: the guide's table of contents is not in its `.md`.
- [ ] `llms.txt` links each page to its `.md` copy (the spec: links "should point to LLM-friendly content, such as the markdown versions of pages"), and falls back to the HTML URL for a page with no copy.
- [ ] Links inside a copy are the HTML's hrefs unchanged, so relative links resolve from the `.md`'s folder exactly as from the page's; `GUIDE.md` says that the `llms.txt` → `.md` links are correct by construction (generated from the registry) and are **not** scanned by the broken-link check.
- [ ] The copies appear in the build report and in `kiss-ssg check`'s output, so a missing or failed copy is visible rather than silent; a conversion failure's effect on `ok` is decided and documented.
- [ ] New `lib/` module with a unit test in `test/unit/`, its `AIKB/` doc and a row in `CLAUDE.md`'s table; integration coverage through `lib/kiss.js`; every regression test seen red first.
- [ ] Public-API obligations in the same commit: `GUIDE.md` section (given a page in `src/models/guide.json`), one index line in `llms.txt` under the 16k cap, `README.md`, `npm run types`, `CHANGELOG.md` upgrade note, the relevant `plugins/*/skills/` mention with a `skill-coverage` row, and a `CONTRADICTIONS` ban for any old sentence about `llms.txt` linking HTML.
- [ ] `node docs` builds the docs site with `.md` copies; one built `.md` looked at by the operator.
- [ ] Clean-room: a fresh sub-agent given only the packed tarball builds a small site in an empty folder, confirms the `.md` copies and the `llms.txt` links, passes `kiss-ssg check`, and reports every place it had to guess.
- [ ] `npm run gates` green; Codex review at close.

**Non-goals / out of scope:** processing compile inputs (`.md` / `.hbs` sources) to make the copies; extending the broken-link check to scan `llms.txt` or the `.md` files (operator chose document-only); `llms-full.txt`; content negotiation or `Accept: text/markdown` serving; any other Webstudio-inspired idea (`$ref` models, collection schemas); the docs-site pitch/homepage.

**Impact surface:** public API — new output files on every site, a new config key, a new runtime dependency, and a change to what `llms.txt` links. Claude proposed a minor (2.8.0) since `^2` sites receive it unasked; **the operator chose a patch** (2.7.5). Recorded here so the close's bump follows the operator's call.

**Expected shape:** planned — the destination and route are known: a module converting written HTML to `.md` at write time, the `llms.txt` link swap, docs and tests.

**Delegation convention:** none — one session. A fresh-context agent gives the diff an adversarial read before the commits that add the module; agents never commit; Codex reviews at close.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-10-07** — `test/unit/skill-coverage.test.js`'s contradiction scan walked all of `examples/`, including each example's gitignored `public/`. With copies on, the built pages' `.md` text was read as docs and tripped 60+ bans. The walk now skips what `scripts/gates.mjs`'s `FORBIDDEN_PACKED` says never ships (seen red without the fix, green with it). Adjacent test tooling, made necessary by this branch; impact surface unchanged.
- **2026-10-07** — Adversarial read of the uncommitted diff (fresh-context general-purpose agent, same model family — not an independent review). Six findings; four acted on, each pinned by a test seen red first: an empty `<main>` gave an empty copy (now falls back to `<body>`); an invalid selector failed every page with domino's bare `Invalid selector.` (now names `config.markdownCopies.selector`); the watch sweep deleted a copy the replacing page had just written (`x.html` → `x.htm`, both `x.md`) and never removed the copy of a page that stopped writing one (copies now swept as their own set); GUIDE overclaimed "neither file is written" for a failed `.md` write. Not acted on: two pages producing one `.md` (`ext: 'md'` beside an HTML page) — contrived, and already in `report().outputs.collisions`. Added a Jekyll caution to GUIDE, inferred rather than measured.
- **2026-10-07** — Clean-room run (fresh general-purpose agent, only `kiss-ssg-2.7.4.tgz` packed from `722516f`, empty scratch folder, told not to read `C:\Code` or the web). Built a 7-page bakery site with a layout, nav and a three-item `.pages()` fan-out; every page got a clean `.md` (a footer marker grepped absent from all copies), all 6 `llms.txt` links resolved to files on disk, `kiss-ssg check` exited 0 with `pages[].markdown` on every page, and a per-page `markdownCopies: false` removed `about.md` and fell back to the canonical URL. Acted on: a page's own `markdownCopies` object replaced the site's whole block (a page saying `{ write: true }` lost the site's `selector`) — now merged over the site's, test seen red first; GUIDE now states the `false` shorthand and the merge. Expected: no `CHANGELOG.md` entry (deferred to the close's bump). Not this branch's, listed for the operator: examples 3, 4 and 6 hand-write nav hrefs against GUIDE's own rule; a `.json` array as a `.pages()` model is not stated to fan out; `check` prints one JSON array, which "one report per site" made it read as JSON Lines; `check` logs "Copied assets: … to ./public" while writing to staging.

## Operator checklist for the PR

Written at the first pulse, at the operator's request (on mobile, eyeball deferred to here). Each item is something no gate can judge.

1. **Read one converted page.** `examples/11-blog/public/blog/pour-over-at-home/index.md` beside its `index.html`: no header/footer/nav, the post's text intact, links relative and sensible. (The deferred pulse eyeball.)
2. **Read one docs-site page's copy** after `node docs`, e.g. `docs/guide/checking/index.md`: the guide's table of contents gone, code blocks fenced with their language, tables readable.
3. **Read the new `llms.txt` links** on the docs site (`docs/llms.txt`): every link ends `.md` and opens a real file.
4. **Decide the version.** You chose a patch (2.7.5) at the open, against Claude's proposal of a minor; every `^2` site gets new `.md` files and different `llms.txt` links on its next install. Confirm or change before the bump.
5. **Read the `CHANGELOG.md` entry.** It is the only text a site owner reads; check its claims (on by default, how to switch off, `llms.txt` now links the copies).
6. **Accept or reject three judgement calls:**
   - A failed conversion fails the whole page (no HTML is written).
   - `<template>` is dropped as well as `script`/`style`/`nav`, and `<noscript>` is kept.
   - With copies on, `llms.txt` no longer follows `links.trailingSlash`, because it names files.
7. **Accept the dependency risk.** `turndown-plugin-gfm` was last published in 2022; the fallback is node-html-markdown. Also new: `turndown` and `@mixmark-io/domino`. domino's broken type declaration is worked around and recorded in `AIKB/upstream.md`.
8. **Skim the lockfile diff.** Most of `package-lock.json`'s churn is `"peer": true` lines rewritten by a different npm version, not new packages.
9. **Read the clean-room agent's "places I had to guess" list** — summarised in the third Amendment above. Four findings belong to other work: decide whether any becomes a branch of its own.
10. **Read the Codex review's findings** before merging.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-07** — Engine slice landed, uncommitted. `npm test`: 2230 passed, 8 failed, all of them the outstanding docs/types obligations (`aikb.test.js`: no `AIKB/markdown-copy.md`, GUIDE.md and llms.txt config blocks; `types.test.js`: stale `types/`). Criteria 1, 3 met (unit + `markdown-copies`/`llms` integration tests); 2, 4, 5 partly met (behaviour tested, GUIDE wording and docs-site look outstanding); 6 partly met (module, tests, sweep regression seen red; AIKB doc and table row missing); 7, 8, 9 not yet; 10 at close. Drift: one amendment (skill-coverage walk), no surface change. **Eyeball: deferred** — operator on mobile; written down as item 1 of "Operator checklist for the PR" above. Decision: continue to the docs slice.
- **2026-10-07** — Docs slice committed (`450c2d1` feature + docs, `ca31401` rebuilt `docs/`); tree clean. Full suite 2253 passed before the commit; `aikb.test.js` 204 passed now; lint, typecheck, format green. Criteria 1–6 met (6 includes the four review fixes, each seen red first); 7 partial (CHANGELOG deferred to the close's bump — `changelog.test.js` ties the newest entry to `package.json`); 8 partial (built: 11 copies, `docs/guide/checking/index.md` has no table of contents, every `docs/llms.txt` link ends `.md`; operator look outstanding); 9 not yet; 10 at close. No new drift. **Eyeball: deferred** — `docs/guide/discovery/index.md`, tracked as item 2 of "Operator checklist for the PR". Decision: continue to the clean-room run.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-10-07: A Markdown copy of every page, for agents

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** `config.markdownCopies` (on by default): every HTML page gets a `.md` copy beside it, converted with turndown from the written `<main>`, and `llms.txt` links the copies. New `lib/markdown-copy.js` with `AIKB/markdown-copy.md`; version 2.7.5. Commits `d6e68f5` … `0406f41` on `feat/llms-md-pages`.

## Reflect — what the session was

It began as research, not a branch. The operator asked what kiss could learn from Webstudio. Of the four ideas Claude offered, the operator chose one (the `.md` copy) and named one Claude had not offered: the project's website pitch. Asked to pick one, Claude chose the `.md` copy and said why. Then came **the decisive steer of the session**: the operator asked whether an HTML-to-Markdown library could process kiss's _output_ rather than its compile inputs, and pointed out that link checking would come for free. That move dissolved the hardest design question Claude had raised, how to convert an `.hbs` page, and it set up the architecture the rest of the branch built. The operator also settled the defaults: on by default, and `llms.txt` linking the copies, flagged "worth checking". Claude checked: the llmstxt.org spec says so in so many words.

`/branch-open` then ran with the design already shaped by that conversation. The shape was **planned**, and it held: two slices (engine, then docs), one pulse at each boundary, and the close. Every scope change was adjacent and recorded as an Amendment: the contradiction-scan walk, four fixes from the adversarial read, and one from the clean-room run.

## Evaluate — how the human supervised the AI

**Problem framing — strong, and the operator's.** The output-not-inputs question is the clearest case in these logs of the sum beating the parts. Claude had framed the job as "what source does each page type have?" The operator reframed it as "convert what was written", which removed a lossy dependency choice from `.hbs` pages and made the link guarantee structural. The operator also ran `/branch-open` at the point the conversation became a branch, which is exactly the 2026-10-03 feedback ("run `/branch-open` even mid-stream") applied.

**Harness leverage — strong, and shared.** The operator invoked `/branch-pulse` twice at the boundaries Claude offered, and `/branch-close` when asked. Claude used three different fresh-context checks, and each found something the others did not:

- **An adversarial read before the first feature commit** found four real defects:
  - an empty `<main>` gave an empty copy;
  - an invalid selector failed with no hint of where it was set;
  - the sweep deleted a copy the replacing `.htm` page had just written;
  - the sweep never removed the copy of a page that stopped writing one.
- **The clean-room run from the packed tarball** found the per-page config merge bug: a page's `{ write: true }` dropped the site's `selector`.
- **Codex at close** found nothing.

The first two checks share Claude's model family, and this log says so where it records them. Codex is the only independent reviewer this branch had, and it read the code without running the tests.

**Verification & ownership — the gap.** The operator spent most of the session on a phone and deferred both pulse-time looks: a converted blog post, then the docs-site page with the new section. Both deferrals were written down (items 1–2 of the PR checklist), so they are honest deferrals with a destination. But it means **no human has yet read a single generated `.md` file**. Everything known about their quality comes from tests, greps, and two Claude-family agents. The operator intended to supervise at the artefact ("I'll jump on my laptop") and then could not. The checklist is where that intention now lives.

**Learning engagement — offered, not taken up.** Twice Claude named the one decision the operator was least likely to have seen and offered to explain or overturn it: a failed conversion fails the whole page, and an empty `<main>` falls back to the whole `<body>`. Neither got a reply. Both are defensible defaults. But a site owner will meet the second one, and nobody but Claude has weighed it.

**Pushback & steering.** The operator overrode Claude twice and knowingly: a patch, not a minor (2.7.5, asked at the open and again at the close); and Codex instead of `/security-review`. Those are an owner's calls, made with the reasoning in front of them. It is not the "absorbed the first answer" pattern.

**Competency level: Assisted operator**, with active-supervisor framing. The framing and the steer at the decisive moment were strong. The verification was done entirely by agents, and the explanation offers went unanswered. The level is earned by what a human checked, and here that was the design, not the output.

## Feedback — recommendations for next session

- **Operator — do checklist items 1–3 before merging, at a desk; it takes ten minutes.** Read `examples/11-blog/public/blog/pour-over-at-home/index.md` and `docs/guide/discovery/index.md`, and click two links in `docs/llms.txt`. No person has read a generated copy yet, and every `^2` site publishes them on its next install.
- **Operator — when you will be on a phone, say so at the open.** A branch run from mobile can still put its looks at the points where you will be at a desk, rather than meeting them at pulses you then have to defer.
- **Operator — answer the "one decision" offer in a word, even "fine".** An unanswered offer leaves the default carried by Claude's reasoning alone, which `CLAUDE.md` asks to be said out loud. The empty-`<main>` fallback is the one to read now.
- **Claude — when a feature adds files to every build folder, list everything that reads a build folder before writing the first test.** The default-on `.md` files broke these, one by one, found by running the suite:
  - `atomic-build.test.js`'s exact `readdir` lists;
  - `check.test.js`'s page shape;
  - example 9's file count;
  - `trailing-slash.test.js`'s "six derivations";
  - most expensively, `skill-coverage.test.js`'s contradiction scan, which read built pages as docs and tripped 60+ bans.

  The question "what reads `public/`?" (the link scan, the audit's stray-file walk, the contradiction walk, the examples' counts, the aikb record) would have found them as a class before the suite did.

- **Claude — the shipped-doc claim check worked; keep doing it at the moment of writing.** The `kiss-site-migrate` note first said a `check` diff would show every page as changed. Reading `diffReports` before committing showed it compares HTML hashes only, and the sentence was rewritten. That is the `CLAUDE.md` rule ("a doc is a claim about the code") paying off at the point of writing.
- **Process — `docs/` was three versions stale on `main`.** Its version stamp still said 2.7.2 at 2.7.4, so earlier closes bumped the version without rebuilding the committed docs site. `/branch-close` Step 4a should end with `node docs` and a commit of `docs/` when the stamp moved. This branch did it by hand (`0406f41`).
- **Process — the clean-room run found four doc frictions outside this branch.** Examples 3, 4 and 6 hand-write nav hrefs against GUIDE's own rule. A `.json` array as a `.pages()` model is not stated to fan out. `check` prints one JSON array where "one report per site" reads as JSON Lines. `check` logs "Copied assets: … to ./public" while writing to staging. Each is a small branch if the operator wants it.
- **Both — the Write-tool rule held for the whole session.** Every file, scratch spikes included, went through Write or Edit; heredocs carried only commit messages. That is the lesson `/branch-open` flagged as recurring three times. One clean branch is not a trend, but it is worth `/memory-consolidate` knowing.

## Verdict — did we achieve the objective?

**Brief:** every HTML page gets a clean Markdown copy beside it, converted from the built HTML with turndown, and `llms.txt` links the copies. **Met.** The objective did not move; the amendments were defects found and fixed inside the remit.

- [x] **Criterion 1 — on by default, llmstxt.org paths, a site and per-page switch.**
  - `test/integration/markdown-copies.test.js` and `llms.test.js`; the clean-room run (7 pages, 7 copies, `404.md` included).
- [x] **Criterion 2 — `<main>` else `<body>`, `nav`/`script`/`style` dropped, selector override.**
  - Unit tests.
  - `docs/guide/checking/index.md` has no table of contents (grep). Seen by Claude, not yet by the operator.
- [x] **Criterion 3 — `llms.txt` links the copies, falling back to the page URL.**
  - All 11 `docs/llms.txt` links end `.md`.
  - The clean-room run's 6 links all resolve.
  - The per-page-off fallback is tested.
- [x] **Criterion 4 — links unchanged; the GUIDE states they are right by construction, not checked.**
  - GUIDE § Markdown copies for agents.
  - Parentheses come out escaped, which is documented.
- [x] **Criterion 5 — the report and `check` show the copies; the failure stance is documented.**
  - `pages[].markdown` is in `check`'s JSON.
  - A conversion failure fails its page.
  - A failed `.md` write leaves the HTML on disk, as GUIDE says.
- [x] **Criterion 6 — module, unit test, AIKB doc, table row, integration coverage; regression tests seen red.**
  - The sweep, merge, empty-`<main>`, selector and ban tests were each seen failing first.
- [x] **Criterion 7 — the public-API obligations.**
  - GUIDE section and page, `llms.txt` index and trap lines, README, `types/`.
  - The CHANGELOG 2.7.5 entry.
  - Four skills with two coverage rows.
  - A `CONTRADICTIONS` ban on three old sentences, seen failing against the old `llms.txt`.
- [ ] **Criterion 8 — `node docs` builds with copies, and one built `.md` looked at by the operator.**
  - Built and committed.
  - **The operator's look is deferred** to PR checklist items 1–2.
- [x] **Criterion 9 — clean-room run from the packed tarball.**
  - Every check passed.
  - Its guesses are recorded in the third Amendment.
- [x] **Criterion 10 — `npm run gates` green; Codex review at close.**
  - All five gates passed (76 changed files, 312 in the tarball).
  - Codex: no actionable regressions (read-only, tests not run).

**What is concretely better:** any kiss site can now be read by an agent without its markup, with no configuration, and its `llms.txt` follows the spec it claims. **Still open:** the operator's own read of a generated copy; the empty-`<main>` default, which no human has weighed; the unmeasured Jekyll caution; and the four out-of-scope frictions from the clean-room run.
