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

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
