---
branch: feat/llms-md-pages
base: main
status: open
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
9. **Read the clean-room agent's "places I had to guess" list**, once it has run.
10. **Read the Codex review's findings** before merging.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-07** — Engine slice landed, uncommitted. `npm test`: 2230 passed, 8 failed, all of them the outstanding docs/types obligations (`aikb.test.js`: no `AIKB/markdown-copy.md`, GUIDE.md and llms.txt config blocks; `types.test.js`: stale `types/`). Criteria 1, 3 met (unit + `markdown-copies`/`llms` integration tests); 2, 4, 5 partly met (behaviour tested, GUIDE wording and docs-site look outstanding); 6 partly met (module, tests, sweep regression seen red; AIKB doc and table row missing); 7, 8, 9 not yet; 10 at close. Drift: one amendment (skill-coverage walk), no surface change. **Eyeball: deferred** — operator on mobile; written down as item 1 of "Operator checklist for the PR" above. Decision: continue to the docs slice.
- **2026-10-07** — Docs slice committed (`450c2d1` feature + docs, `ca31401` rebuilt `docs/`); tree clean. Full suite 2253 passed before the commit; `aikb.test.js` 204 passed now; lint, typecheck, format green. Criteria 1–6 met (6 includes the four review fixes, each seen red first); 7 partial (CHANGELOG deferred to the close's bump — `changelog.test.js` ties the newest entry to `package.json`); 8 partial (built: 11 copies, `docs/guide/checking/index.md` has no table of contents, every `docs/llms.txt` link ends `.md`; operator look outstanding); 9 not yet; 10 at close. No new drift. **Eyeball: deferred** — `docs/guide/discovery/index.md`, tracked as item 2 of "Operator checklist for the PR". Decision: continue to the clean-room run.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
