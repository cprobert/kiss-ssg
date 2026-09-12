# Plan — 2026-09-12: Broken links, server-side redirects, a feed, and a blog exemplar

Status: in progress. Session file: `planning/sessions/2026-09-12-link-check-redirects.md`.

## The problem this solves

After "what is this site", a returning developer's next two questions are "what did I just break" and "what did I just lose". A content edit that breaks an internal link is the commonest management failure and nothing catches it today; a renamed slug silently 404s every inbound link. Both answers come from data the engine already holds: the registry of every output path and the asset manifest (for links), and the last record's page list (for removals). A feed is the third file derivable from the same registry as `sitemap.xml` and `llms.txt`. The exemplar teaches the shapes agents otherwise reinvent.

The pattern is the one set by the site-memory branch: **verdicts an agent can act on, files derived from the registry, everything else an exemplar.** None of the findings changes an exit code.

## Contract

### L — `lib/links.js`: broken internal links as a check finding

- Runs once per settled **non-dev** build, in `Kiss._finishBuild()` beside the AIKB step, after every page has been written and before the report is assembled. Dev and watch rebuilds skip it (`links: null`): a scoped re-render has not rewritten every page. Off with `config.links = false` (default `true`).
- For each written page (`stack` entries with `generate !== false` and a written file), read the HTML back from disk (the staging folder under check mode; the ordering against `_discardStaging` must be verified, not assumed — see CLAUDE.md § Rules) and extract `href`, `src` and each `srcset` URL from `a`, `link`, `script`, `img`, `source`, `video`, `audio`, `iframe`, `form[action]`. A small tolerant regex pass over attributes is enough; no HTML parser dependency.
- **Ignore:** anything with a scheme (`https:`, `mailto:`, `tel:`, `javascript:`, `data:`), protocol-relative `//`, a bare `#fragment`, and an empty value. Strip `?query` and `#fragment` before resolving.
- **Resolve** a root-relative `/x` against the build root and a relative `x` against the page's own directory, as a browser would; then accept when it is: a file that exists under the build folder; a `buildTo` in the stack; `<path>/` → `<path>/index.html`; extension-less → `<path>.html` or `<path>/index.html`; an asset manifest `source` or `target`; or the page itself. Anything else is **broken**.
- **Report:** `links: null | { checked: number, broken: [{ page, href }] }` appended after `aikb`; `page` is the `buildTo` against the real build folder, sorted by page then href. `formatReport` prints `  broken link: <page> -> <href>`. Exit code unaffected.
- **Docs:** `AIKB/links.md`, the CLAUDE.md table row, `llms.txt` (§ check and the report shape), README (§ Checking a build), `types/`. Unit tests on the pure extractor/resolver; integration through a real site with one broken and one valid of each kind; the bin prints the line.

### R — page `aliases` and `_redirects`: server-side redirects, and removals without one

- Page option `aliases: string[]` — old URL paths (`/old-slug`, `/news/2024/thing.html`) that should redirect to this page. Carried through `.page()`, `.pages()` items (a record's `aliases`) and `.scan()`.
- On a settled non-dev build with any alias present, write `<build>/_redirects` (Netlify and Cloudflare Pages format, one `/<old> <new> 301` per alias, `new` being the page's canonical path as `{{canonical}}` derives it, without the origin), sorted, byte-stable. No other format this branch; no meta-refresh. Report `redirects.file` names it, or `null` when no page has an alias.
- **Two findings.** `removed`: when the site is recorded (`isRecorded(folders.aikb)`), every `buildTo` in `AIKB/last-build.json` that is not in this build and is not covered by an alias — a page that vanished with no redirect. `collisions`: an alias equal to a live page's path. Both advisory.
- **Report:** `redirects: null | { file: string|null, aliases: number, removed: string[], collisions: string[] }` appended after `links`. `formatReport` prints `  removed without redirect: <path>` and `  alias collides with a page: <path>`.
- **Docs:** `AIKB/redirects.md` (module `lib/redirects.js`), table row, `llms.txt` (page options, § check), README, `types/`. Unit tests on the pure derivation; integration: a recorded site, a renamed page with and without an alias.

### F — `.feed()`: RSS from the registry

- `kiss.feed(options, callback?)` beside `.sitemap()` and `.llms()`: same promise-queue timing, same replay, same `overwrite`. Options: `title` (required), `description`, `section` (a top-level `path` segment to include, e.g. `'blog'`; omit for every page), `limit` (default 20), `filename` (default `feed.xml`), `dateField` (default `date`). Requires `config.siteUrl`; logs and skips without it, as the sitemap does.
- An RSS 2.0 document with an `atom:link rel="self"`; one `<item>` per page with a date (`options.date`, else the model's `date`), newest first, `link` and `guid` from the same canonical join as the sitemap, `title` and `description` as `llms.txt` derives them. Pages without a date are left out and counted. `ignoreSitemap` and `generate: false` exclude, as for `llms.txt`.
- **Report:** `feed: string|null` appended after `redirects`. Callback receives the XML text.
- **Docs:** `AIKB/feed.md` (module `lib/feed.js`), table row, `llms.txt` § API, README, `types/`. Unit tests on the pure item derivation and renderer (escaping, RFC 822 dates, byte-stable); integration through a site with dated and undated pages.

### E — example 11: a blog, and the four recipes

- `examples/11-blog.js` + `examples/11-blog/`: posts as a `models/posts/` folder fan-out with a controller file; a **paginated** index (3 per page, prev/next, `/blog/`, `/blog/page/2/`) as a controller recipe; **tag pages** built from the posts' tags as a second fan-out; `.feed({ section: 'blog', title })`; one post renamed with an `aliases` entry so `_redirects` is written; `.sitemap()`. Clean by default. `--broken` adds one bad link to one post so the finding is visible in a run, the way example 8's `--atomic` shows atomic behaviour.
- Recorded (`node ../bin/kiss-ssg.js aikb 11-blog.js`) with `folders.aikb: './11-blog/AIKB'`, with an authored, stamped note for the posts controller and one for the tags controller — the "site brief on a real recipe" the operator asked for.
- README for the example (what each recipe is, what to copy), `examples/README.md`, `npm run eg11`, the examples integration test (page count, `_redirects` present, `feed.xml` present, `links.broken` empty by default and exactly one under `--broken`), README/llms.txt example counts (eleven).

## Non-goals

- No meta-refresh redirects, no `.htaccess`, `vercel.json` or nginx output (the operator chose `_redirects` only).
- No external link checking (no network at build time beyond URL models).
- No HTML parser dependency, no image processing, no schema language for models.
- No exit-code change for any finding; the `kiss-branch-close` skill is what treats them as stops.

## Delegation and sequencing

Fable briefs, reviews every diff, commits; agents implement and never commit. **Before any workstream starts, a fresh-context agent reads this contract adversarially** — the lesson from the site-memory branch — and its findings amend the contract in place. Then L and F run concurrently (disjoint regions of `lib/kiss.js`; report keys in the fixed order `links`, `redirects`, `feed`), R after L lands (both read the written pages and the stack), E after all three. README is Fable's.

## Success criteria (mirrored in the session file)

- [ ] L — every kind of internal reference resolved or reported; check mode included; dev skipped; `config.links = false` honoured; the summary line prints.
- [ ] R — `_redirects` byte-stable from `aliases`; a recorded site reports pages removed without one; a colliding alias reported.
- [ ] F — `feed.xml` from the registry, newest first, valid RSS 2.0, byte-stable, same URLs as the sitemap.
- [ ] E — example 11 builds clean with eleven-example counts updated; `--broken` shows exactly one finding; the recorded `AIKB/` with two stamped notes is committed; the four recipes have READMEs.
- [ ] Every new `lib/` module has a unit test and AIKB doc; `llms.txt`, `README.md`, `CLAUDE.md`, `types/` updated; gates green.
