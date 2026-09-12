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

- **2026-09-12** — Page identity and the `{{link}}` helper, absorbed as adjacent to the link work on the operator's agreement (identity derived from the view). Contract: the plan's "Amendment — 2026-09-12 (2)". New success criterion: every page carries an `id` defaulting from its view (fan-out items `<registration id>/<slug>`), explicit collisions fail the build and default collisions only warn, `{{link "<id>"}}` renders the served path and fails the render on an unknown, ambiguous or non-generated id, `id` appears on the report and the site map, the `removed` finding distinguishes a moved page from a deleted one, and example 11 links by identity while the link checker still counts and passes every helper-emitted reference.

## Pulse log

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

- **2026-09-12 (contract critiqued, Beat 0, L and F landed)** — The adversarial read (`planning/reviews/2026-09-12-link-check-contract-critique.md`) found nine blockers before a line was built, the decisive one being that check mode discards staging before the step the contract chose for the scan; the contract was amended in place (`2ad0748`). Beat 0 (`71151b6`) landed the shared seam so L and F ran concurrently without touching the same files. L and F (`492e98c`): references extracted at write time and resolved before the folder moves; `.feed()` mirroring `.llms()`. Both agents ran red-first in a sandbox copy of HEAD rather than stashing the shared tree — a new discipline worth keeping. Fable's review: the single call site above `complete()`'s branch is better than the contract's three; accepted. Real-site smoke on examples 4 and 9 and the docs site: no false positives. Gates green after `npm run types`. Criteria 1 and 3 evidenced; 2 and 4 pending. Decision: **continue** to R.
- **2026-09-12 (R landed)** — `f895da2`: aliases, `_redirects`, `removed` and `collisions`. Four mutation rounds red-first in a sandbox copy of HEAD, including the naive implementation the critique warned about (`toCanonicalPath` alone as the target) — each mistake caught by a named test. One deviation accepted: `redirects` is `null` when there is no alias and no finding, not "no alias and no record", because the briefed rule would have churned every recorded site's `last-build.json` between its first and second record. Fable's own eyeball after L: two provoked broken links on example 9 reported with their page, exit code untouched, 36 references clean when restored. Gates green. Criteria 1–3 evidenced; 4 (the exemplar) pending. Decision: **continue** to E.
- **2026-09-12 (E landed, ready to close)** — `54c42d0`: example 11 with the four recipes, `--broken`, a recorded `AIKB/` with two stamped notes; counts say eleven everywhere. E's run exposed a real false positive — a note citing `sitemap.xml` or `llms.txt` in backticks was reported dangling — fixed in the resolver with a red-first unit test rather than worked around. Plugin skills read the three new findings (`57617cd`). Fable's own eyeball: `check --summary 11-blog.js` clean at 14 pages; `-- --broken` prints exactly one `broken link:`; `_redirects` is the one expected line; `feed.xml` is newest-first with `lastBuildDate` equal to the newest post; a re-record is byte-stable. 1099 tests, all five gates green. All five criteria evidenced. Decision: **ready to close** — minor bump (a method, a page option, a config key, three report keys, an example).
- **2026-09-12 (identity: critique and I landed)** — The adversarial read of the identity contract (`planning/reviews/2026-09-12-link-helper-contract-critique.md`) found six blockers, two of them about the link checker the operator asked to be watched: `absolute=true` via `toAbsoluteUrl` would have emitted `/data/` for an `index.json` page and the checker would have reported it, and the contract's own justification for the served-path rule (that the checker calls `/about` broken when only `about.html` exists) was false — the resolver always tries both extension-less fallbacks. Contract amended (`17d69e0`). I (`fe3db92`): 42 tests red-first in a sandbox of HEAD, the late-registration race pinned by waiting on `_generating` rather than a wall clock. Gates green after `npm run types`. `check 11` now prints the pagination pair's withdrawn-id notice, the shape E' fixes. Decision: **continue** to M.
- **2026-09-12 (M landed)** — `787af13`: `redirects.moved` paired by id, suppressing the matching `removed`, one shared alias predicate; 18 tests red-first in a sandbox of HEAD; the notice carries the fix. Gates green after `npm run types`. Decision: **continue** to E' (example 11 links by identity).
