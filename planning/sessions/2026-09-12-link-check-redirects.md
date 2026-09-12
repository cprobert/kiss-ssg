---
branch: feat/link-check-redirects
base: main
status: open
opened: 2026-09-12
---

# Session — 2026-09-12: Broken links, server-side redirects, a feed, and a blog exemplar

## Intent (captured at /branch-open)

**Objective:** Give a kiss site two more verdicts an agent can act on — broken internal links, and pages removed without a server-side redirect — plus a feed derived from the same registry as the sitemap, and a blog exemplar that teaches pagination, tags, aliases and the feed by shape; so that after "what is this site", the next two management questions ("what did I break", "what did I lose") have machine answers.

Contract: `planning/plans/2026-09-12-link-check-redirects.md`.

**Success criteria:**

- [ ] **Links.** On a settled non-dev build the report carries `links: { checked, broken: [{ page, href }] }`, resolving root-relative and relative `href`/`src`/`srcset` against written files, output paths, directory indexes, extension-less pages and the asset manifest, ignoring schemes, protocol-relative, fragments and empties; check mode included; dev builds report `null`; `config.links = false` switches it off; `check --summary` prints `broken link:` lines; exit code unchanged.
- [ ] **Redirects.** A page's `aliases` write a byte-stable `<build>/_redirects` (`/old /new 301`); a recorded site reports pages present in `AIKB/last-build.json` and absent now with no alias covering them, and an alias that collides with a live page; both as `redirects.removed` / `redirects.collisions` with summary lines; no meta-refresh anywhere.
- [ ] **Feed.** `kiss.feed({ title, section?, limit?, filename?, dateField? })` writes valid RSS 2.0 from the registry, newest first, dated pages only, URLs identical to the sitemap's, byte-stable; requires `siteUrl`; replayed on a whole-site rebuild; `report().feed` names the file.
- [ ] **Exemplar.** Example 11 (a blog) builds clean with pagination, tag pages, one alias, a feed and a sitemap; `--broken` shows exactly one `broken link:`; its `AIKB/` is recorded and committed with two stamped notes; every recipe has a README; example counts say eleven everywhere; `npm run eg11`.
- [ ] Every new `lib/` module has its unit test and AIKB doc in the same commit; `llms.txt`, `README.md`, `CLAUDE.md` and `types/` updated; `npm run gates` green.

**Non-goals / out of scope:** meta-refresh redirects; `.htaccess`, `vercel.json` or nginx output; external link checking; an HTML parser dependency; a model schema language; any exit-code change for a finding; a version bump, CHANGELOG entry or PR before `/branch-close`.

**Impact surface:** public API — a new method (`.feed()`), a new page option (`aliases`), a new config key (`links`), three new report keys, a new example in the tarball. Obliges `llms.txt` + `README.md` + `types/`; the close should propose **minor** (the operator chose patch for the previous branch's additions and may again — say so at the bump).

**Expected shape:** planned — a written contract, an adversarial read of it before building, four workstreams in a fixed order.

**Delegation convention:** Fable briefs, reviews every diff and commits; sub-agents implement inside a named file scope and never commit. A fresh-context agent critiques the contract before the first workstream starts.

**Contract:** `planning/plans/2026-09-12-link-check-redirects.md`, amended in place with dated sections.

**Inherited feedback** (read back from all eleven logs, retired lessons skipped): **Claude** — critique the contract before building it (09-10; applied here as the first step). **Claude** — write bulk edits to a script and read the diff before formatting (09-08 shell discipline, 09-10 `\b` matches a hyphen; two logs, so it travels with this branch). **Operator** — run the loop on one real site (09-06 "try the thing", 09-10); outside this branch's scope, still owed. **Process** — dogfood a new skill with a fresh agent (09-10); no new skills expected here.

### Amendments

## Pulse log

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

- **2026-09-12 (contract critiqued, Beat 0, L and F landed)** — The adversarial read (`planning/reviews/2026-09-12-link-check-contract-critique.md`) found nine blockers before a line was built, the decisive one being that check mode discards staging before the step the contract chose for the scan; the contract was amended in place (`2ad0748`). Beat 0 (`71151b6`) landed the shared seam so L and F ran concurrently without touching the same files. L and F (`492e98c`): references extracted at write time and resolved before the folder moves; `.feed()` mirroring `.llms()`. Both agents ran red-first in a sandbox copy of HEAD rather than stashing the shared tree — a new discipline worth keeping. Fable's review: the single call site above `complete()`'s branch is better than the contract's three; accepted. Real-site smoke on examples 4 and 9 and the docs site: no false positives. Gates green after `npm run types`. Criteria 1 and 3 evidenced; 2 and 4 pending. Decision: **continue** to R.
