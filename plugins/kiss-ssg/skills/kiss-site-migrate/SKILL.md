---
name: kiss-site-migrate
description: Migrate a site built on kiss-ssg v1 to v2. Use when a project's build script targets kiss-ssg 1.x, when a v2 upgrade fails with an unhandled AggregateError or silently empty output, or when asked to "upgrade kiss", "migrate to kiss-ssg v2", "migrate kiss-ssg", or "why did my kiss site break after the upgrade".
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Migrate a v1 kiss site to v2

The migration is short — real consumer sites needed two or three edits each — but each one is silent if you miss it. Work from the shipped recipes, not from memory.

## Execution instructions

### 1. Check the floor, then read the recipes

Node ≥22.12 first: v2 will not install or run below it, so bump any pinned dev Node version before touching code.

Then read `node_modules/kiss-ssg/llms.txt` § Migrating from v1 — every recipe, including the "unchanged in v2" list, which is there to stop you rewriting code that still works. The runnable version of the same recipes is `node_modules/kiss-ssg/examples/9-migrated-from-v1/`; its README maps one page to each v1 idiom it replaces.

### 2. Point every future session at the contract

Open the project's `CLAUDE.md` (create it if the project has none) and make sure it carries this line:

```markdown
@node_modules/kiss-ssg/llms.txt
```

A migrated site is one that will be edited again; the import makes every later Claude Code session read the v2 contract instead of remembering v1. Add the line if it is missing, keep it if it is there, and say which you did.

### 2a. Rename the build script to `router.js` — then grep for the old name

A v1 site's script is usually `generate.js`, `site.js` or `build.js`. v2's convention is `router.js` at the project root (`node_modules/kiss-ssg/llms.txt` § The build script), and a migration is the cheapest moment to adopt it: you are already editing the file, and the alternative is renaming it on some later branch when far more things point at it.

The rename itself is one `git mv`. What makes it worth a step of its own is that **nothing reports a reference it breaks.** Grep the whole repo for the old basename before you build, and fix every hit:

- `package.json` — `main`, and every script that runs it (`build`, `dev`, `check`, anything a host calls).
- The host's build command and any CI workflow — Netlify, Cloudflare Pages, GitHub Actions.
- A CSS toolchain's source globs. Tailwind v4's `@source` is the sharp one: a glob matching nothing is scanned in silence, so class names used only in the build script stop compiling, the stylesheet's content hash changes, and every page that links it changes with it. A real site lost a build to exactly this.
- Any `npx kiss-ssg check <script>` or `npx kiss-ssg aikb <script>` invocation, in scripts and in the project's `CLAUDE.md`.
- The project's own docs and `README.md`.

If the migration is aiming at byte-identical output (step 4), do the rename as its own commit before the recipes, so the diff that proves the migration is not also carrying a rename.

### 3. Diff the site's script against each recipe

Go recipe by recipe against the site's own build script, controllers and helpers, and record for each: applies / does not apply. The two consumer migrations both found most recipes did not apply — knowing that is the point of the pass.

The three that actually bit, in the order they cost the most:

| Symptom in the site                                                                        | What to change                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `complete()` called callback-style, or a chain ending at `.generate()`                     | Attach a `.catch` to the `complete()` promise, print each `err.failures[]` entry, set `process.exitCode = 1`. A failed build **never runs `complete()`'s callback**, so anything that lived there — sitemap, index, deploy trigger — has to run in the catch too |
| A helper reading `require('handlebars').partials` or registering on the global module      | Pass `kiss.handlebars` into the helper and register there. This one fails **silently**: the build stays green and the element renders empty                                                                                                                      |
| Two sources that can claim one output path (a fan-out registered last so v1 would skip it) | Dedupe the slugs yourself before registering. v2 fails the build with `Page already processed` — v1's tolerance was an idiom, and it is gone                                                                                                                     |

Also check `livereloadPort` if the project runs more than one dev site: without it, a second site's pages poll the first site's reload server.

### 4. Build, verify, then compare against the old output

Run the build. Run the `kiss-build-check` skill (`/kiss-ssg:kiss-build-check`) and fix until it reports `ok: true`.

Then compare the page list and the page bodies against the previous v1 build's committed output. **For a content-only migration the goal is byte-identical output** — one consumer test diffed v2-built pages against the v1-built ones and got an empty diff, which is the strongest evidence a migration is complete. A difference is a finding to explain, not noise to accept: it is either a v2 improvement you can name, or a regression you have not found yet.

A page that is missing rather than different usually means a failing controller or a model the new build could not resolve — see the `check` skill on reading a failure.

### 5. Links, and the URLs the migration changed

A v1 site's templates carry hand-written hrefs. **Converting them to `{{link "<id>"}}` is optional here** and usually wrong for a content-only migration: it rewrites bytes, and byte-identical output is the evidence you are trying to produce. Leave them, note the option, and offer it as a follow-up piece of work once the diff is empty — `node_modules/kiss-ssg/examples/11-blog/` is the site to copy that shape from.

What is not optional is checking they still point somewhere. The check's `broken link:` lines are the verification that the migration kept every internal link: each one names the page and the `href` that now resolves to no file, page, directory index or emitted asset, and an absolute URL on the site's own `siteUrl` counts as internal. A v1 href that survived into a v2 build whose URLs moved shows up there and nowhere else — it is advisory, so it never touches `ok` or the exit code.

If the old site served pretty URLs and the new one is not `extensionLess`, set `links: { canonical: true }` rather than adding `canonical=true` to every `{{link}}` call: it makes the bare helper emit `/about` instead of `/about.html`, so the migrated site links internally the way the host serves — and a link the migration must keep extension-ful takes `canonical=false` on that one call.

Where a page's URL **does** change in v2 — `extensionLess` turning `/about.html` into `/about/`, a slug rule that normalises differently — the old URL belongs in that page's `aliases`, and that list is the migration's redirect plan. kiss writes them with no method to call, in the encodings `redirects: { format: … }` names. **There is no default host format** — unset writes `<build>/redirects.json` alone and logs a notice — so a migration must name its host explicitly: `'netlify'` (also Cloudflare Pages) gives `<build>/_redirects`, one `301` per line, which **Firebase and Vercel do not read at all**; `'firebase'`/`'vercel'`/`'htaccess'` give a fragment to merge into the host's own config; a list (`['netlify','firebase']`) gives several at once; or read `report().redirects.rules` and write your own. A migrating site already has a host, so this is a question to answer now rather than after the cutover: the wrong format leaves every old URL 404ing while the build reports the redirects as written.

The same question decides `links: { trailingSlash: … }`. A migration that turns on `extensionLess` makes **every** page a directory index, so the whole site's URL shape starts depending on it: Netlify serves `/about/` and 301s `/about`, while Firebase with `cleanUrls: true` + `trailingSlash: false` serves `/about` and 301s `/about/` (both measured). The default `true` is Netlify's. Set it to match the host before the cutover and the v2 canonical, sitemap, `{{link}}`, `llms.txt` and feed all name URLs that return 200; get it wrong and every one of them names a redirect. Take the old paths from the v1 build's committed output you are already diffing against: every path in it that the v2 build no longer writes is either a page you have lost or an alias you owe.
