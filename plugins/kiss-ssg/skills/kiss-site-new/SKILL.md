---
name: kiss-site-new
description: Build a new static site with kiss-ssg from a description of what it should contain, or add a whole new section to an existing site (its own model, controller and view pattern). Use when scaffolding a kiss-ssg site from scratch, doing kiss-ssg initial setup, or when asked to "make a site with kiss", "set up kiss-ssg", "initialise a kiss-ssg site", or "write the build script for this site". For adding or updating a single page on a site that is already set up, use the kiss-page-add skill instead.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# New kiss-ssg site

Build the site from the package's own shipped docs. They are the contract; this skill only sequences them, so read them rather than trusting a summary — including this one.

## Execution instructions

### 1. Confirm the engine is there

`node_modules/kiss-ssg/package.json` must exist; read its `version` so you know which API you are coding against. If it is missing, `npm install kiss-ssg --save-dev` before writing a line of build script.

### 2. Point every future session at the contract

Open the project's `CLAUDE.md` (create it if the project has none) and make sure it carries this line:

```markdown
@node_modules/kiss-ssg/llms.txt
```

That import makes every later Claude Code session in the project read the API contract without being asked — the skill you are running now only helps the session that invoked it. Add the line if it is missing, keep it if it is there, and say which you did.

### 3. Read the contract

Read `node_modules/kiss-ssg/llms.txt` — it is the API cheat-sheet that ships in the tarball, short enough to read whole. Pay particular attention to:

| Section             | What you need from it                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| The opening summary | The chainable pipeline: pages are _queued_ by `.page()`/`.pages()`/`.scan()`, rendered by `.generate()`, awaited by `.complete()` |
| `## API`            | Which of `.page()` / `.pages()` / `.scan()` fits each part of the site, and what a controller may return                          |
| `## Config`         | `folders`, `cleanBuild`, `siteUrl`, `fetch`, `assets` — set these deliberately, do not inherit defaults by accident               |
| `## Helpers`        | `markdown`, `asset`, `canonical`, `absUrl`, `isActive`, `link`, `env` and friends — use the built-in before writing your own      |

Per-module detail, if you need it, is in `node_modules/kiss-ssg/AIKB/`.

### 4. Copy an exemplar by shape

`node_modules/kiss-ssg/examples/README.md` lists eleven runnable sites in two tiers. Pick the one whose _situation_ matches and copy its structure — its folder layout, its script shape, its controller pattern — never its content.

| Shape                                                                      | Exemplar                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| One build per edition/season/version, each into its own folder             | `node_modules/kiss-ssg/examples/7-versioned-outputs/router.js`                                                            |
| Pages fanned out from data you do not control, validated in the controller | `node_modules/kiss-ssg/examples/8-data-fed-site/router.js`                                                                |
| A v1 project being moved to v2                                             | `node_modules/kiss-ssg/examples/9-migrated-from-v1/router.js` — and use the `kiss-site-migrate` skill instead of this one |
| A blog, a news or events section — anything dated, paginated or tagged     | `node_modules/kiss-ssg/examples/11-blog/` — also the exemplar for the four habits in step 5 below                         |
| A single narrower question (which call, which option, which helper)        | Examples 1–6, the feature reference                                                                                       |

The same table read by **router shape** — how much a site has had to split up, which is the other
axis `examples/README.md` indexes. An agent arrives at one example rather than reading the set, so
pick on both axes:

| How complex is the site?                                      | Look at                                                                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| One file is plenty — a handful of pages, no custom helpers    | Any of examples 1–8 and 10. Every one is tier 0, and each router's header says why it was _not_ split                               |
| It has one custom helper                                      | `node_modules/kiss-ssg/examples/9-migrated-from-v1/` — one helper, and therefore a `helpers/` folder. One is the trigger, not three |
| A fact appears in both the markup and the feed or the JSON-LD | `node_modules/kiss-ssg/examples/11-blog/` — a `config/` seam, earned by duplication rather than by length                           |
| Several custom helpers of different kinds                     | The same shape, one module per kind — `llms.txt` § The build script. No shipped example is that big                                 |

Run the exemplar before you change anything, so you know what its output and exit code are meant to look like. Example 8 exits 1 on purpose.

### 5. Write the build script

Call it `router.js`, at the project root, and point `package.json`'s `main` and its `build`/`dev` scripts at it. `node_modules/kiss-ssg/llms.txt` § The build script is the contract — read it, because it carries the extraction thresholds and this is only the summary: the file is a router (config, the `.page()`/`.pages()`/`.scan()` table, the terminal chain, the `complete()`/`catch()` pair) — note that it does **not** register helpers: kiss imports `config.folders.helpers` and calls its `registerHelpers` export itself. A site earns a **`helpers/` folder beside `router.js`** — not under `src/` — the moment it has its **first** custom helper, one not three, because a helper inside `router.js` cannot be imported and so cannot be tested, which is as true of the first as of the fourth. `config.folders.helpers` defaults to `./helpers`, kiss registers what its `index.js` exports, and in dev an edit re-imports and re-renders. Keep it out of `src/`: `src` is watched for content, and a module in any folder under it that is not one of the six derived ones triggers a whole-site replay that cannot pick the edit up. The same goes for the `config/` module a site earns the moment one fact appears in both the markup and the JSON-LD. The two triggers are independent: a site can have `config/` and no `helpers/`.

Name it `router.js` from the first commit even while the whole site fits in that one file. A site at tier 0 is not a site that got it wrong — splitting a 120-line router makes it harder to read — but renaming the file later silently orphans whatever names it: a CSS toolchain's source globs, `package.json`, the host's build command, a `npx kiss-ssg check <script>` invocation. None of those fails loudly. The name costs nothing now and is a grep-the-repo job later.

End the chain at `await kiss.complete()`, inside a `try`/`catch` that prints every entry of `err.failures` and sets a non-zero exit code — the recipe is in `llms.txt` § Migrating from v1, and running code is `node_modules/kiss-ssg/examples/9-migrated-from-v1/src/pages/await-complete.hbs` (its README indexes the recipes by built page name).

If the site will be handed on — to a colleague, or to you in two years — record its knowledge base once it builds green: `npx kiss-ssg aikb <site-script>` (documented in `node_modules/kiss-ssg/llms.txt`) runs the build staged and discarded, publishes nothing, and writes `AIKB/site-map.md`, `AIKB/site-map.json` and `AIKB/last-build.json` — the pages, models, controllers, partials and pipeline steps the build actually saw — into `config.folders.aikb` (default `./AIKB`). Commit that folder. It takes no change to the build script, a failed build is refused, and recording once is what opts the site in: from then on `kiss-ssg check` diffs against the record by default, and the sibling `kiss-memory` plugin's skills read it back as a briefing and as the baseline for a piece of work.

Four habits to build in while the views are still being written. All four run together in `node_modules/kiss-ssg/examples/11-blog/`, which is the exemplar to read for them:

- **Link between pages by identity, never by a typed path.** `{{link "about"}}` is root-relative (`/about.html`, or `/about/` on an `extensionLess` site), `{{link "about" absolute=true}}` is the absolute URL an `og:url` or a feed needs, and `{{link "about" canonical=true}}` is the pretty form the sitemap and `{{canonical}}` emit. A typed `/about.html` is a guess about `extensionLess`, `path` and `slug`; `{{link}}` renders the path the build actually wrote, and an id no page claims fails the build naming the id and the view that asked.
- **A host that serves pretty URLs wants `links: { canonical: true }` set once.** If the site is not `extensionLess` and the host 301s `/about.html` to `/about`, every bare `{{link}}` ships a redirect hop, and `canonical=true` at each call site is a rule nothing enforces — forgetting it once is invisible in dev and wrong only on the deployed site. Set the config key instead; a per-call `canonical=false` still opts one link back out, and `canonical` with `absolute=true` gives the absolute pretty URL. (`extensionLess: true` solves it too and is better on a greenfield site, but it changes every output path, so on an existing site it is a migration with `aliases` attached, not a flag.)
- **Every page already has an `id` to be linked by** — the view's route without its extension (`about.hbs` → `about`, `blog/listing.hbs` → `blog/listing`), and for a `.pages()` fan-out item `<view route>/<slug>` (or `<registration id>/<slug>` when the registration sets one). Set an explicit `id` where one view is rendered twice — a paginated listing at `/blog/` and `/blog/page/2/` — because two pages arriving at one default id both withdraw from it and neither can be linked until you name them.
- **Chain `.robots()` beside `.sitemap()`, and let it write the `Sitemap:` line.** A hand-written `robots.txt` in `src/assets/` is the usual thing and it is almost always missing that line — this repo's own shared example fixture was, for every example that generates a sitemap. `.robots()` with no arguments writes `User-agent: * / Allow: /` plus the sitemap URL, built by the same join as every `<loc>` so it cannot drift. Use `disallow` for real exclusions only: **`disallow: '/'` removes the site from search**, so never reach for it to hide a staging build without being certain that config cannot ship (it logs a notice every build and sets `report().robots.disallowAll` so a check diff catches it). Do **not** reach for `disallow` to keep a page out of search — that is what `ignoreSitemap` plus a `noindex` tag is for; blocking the crawler stops it seeing the `noindex` and can leave the URL indexed with no snippet.
- **A site with news, posts or events gets a feed.** Put `.feed({ section: 'blog', title: 'Site — the blog' })` beside `.sitemap()` in the chain: one RSS item per page carrying a date, newest first, from the same registry the sitemap and `llms.txt` are built from, so it can never name a URL the site does not serve. `section` limits it to one top-level `path` segment; `title` is required.
- **A page you rename or move keeps its old URL.** Put the old path in that page's `aliases` (`aliases: ['/old-slug.html']`, on the fan-out **record** rather than the registration) and kiss writes the redirects into the build folder. There is no method to call — an alias is a page option. **`redirects: { format: … }` is not optional if you want a host file at all.** It is unset by default: kiss writes `<build>/redirects.json` (the host-neutral list) and **no host file**, then logs a notice telling you so. Name the host: `'netlify'` (also Cloudflare Pages), `'firebase'`, `'vercel'`, `'htaccess'`, or a writer function. It takes a **list**, so a site on Netlify previews and Firebase production sets `format: ['netlify', 'firebase']` and gets both files from one build. Getting this wrong used to be silent — `_redirects` on a Firebase site is a file nothing reads while the old URLs keep 404ing — which is exactly why the default now refuses to guess. `report().redirects.rules` carries the list as data whatever you choose.
- **Ask which host serves the site, and set `links: { trailingSlash: … }` to match — it cannot be guessed from the code.** A directory index (`slug: 'index'`, and every page under `extensionLess: true`) is served at `/courses/` by Netlify, which 301s the bare `/courses`; Firebase Hosting with `cleanUrls: true` + `trailingSlash: false` does the exact reverse. Both measured. The default `true` is Netlify's; set `false` for that Firebase shape, and the canonical, the `<loc>`, `{{link}}`, the `llms.txt` entry, the feed and every alias target move together. Getting it wrong is invisible in dev and costs a 301 on every internal click plus a sitemap full of redirecting URLs. `{{isActive}}` is deliberately unaffected. Unsure? Deploy once and `curl -sI` both spellings.

Three mistakes real consumer sites made, all of which passed review before they bit:

- **A chain that ends at `.generate()` exits 0 on a broken build.** Page failures surface only through `complete()`'s rejection. A deploy script that does not await it ships a half-built tree and reports success.
- **Registering helpers on the global `handlebars` module renders nothing, silently.** Handlebars is per-instance in v2 — use `kiss.handlebars`. The symptom is an empty element where content should be, with a green build and no warning; nothing will tell you.
- **Two pages claiming one output path fail the build** (`Page already processed`). If two sources can produce the same slug, dedupe before registering — do not rely on the engine to pick a winner.

### 6. Build, then verify

Build it, then run the `kiss-build-check` skill (`/kiss-ssg:kiss-build-check`) and do not declare the site done until it reports `ok: true`. A build you have not verified is a build you have not finished.

Read that check's `broken link:` lines too: they are how you confirm the scaffolding's internal references actually resolve. A `{{link}}` cannot be wrong without failing the build, so anything listed there is a path something typed by hand — fix it in the template or the model that wrote it. It is a finding, not a failure, so it never shows up in the exit code.
