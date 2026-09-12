---
name: kiss-page-add
description: Add a new page to a kiss-ssg site that is already set up, or update an existing page's content, model or controller. Use when asked to "add a page", "add a new page to the site", "add a blog post", "update this page", "change what's on this page", or when editing a `.hbs` view, a `.json` model or a controller in a project that already has `node_modules/kiss-ssg` installed. Not for scaffolding a brand-new site or adding a whole new section with its own model/controller pattern (use kiss-site-new for that), and not for a v1-to-v2 upgrade (use kiss-site-migrate).
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Add or update a kiss-ssg page

The site already exists and already builds. This is a small, targeted change to it — not a new build script.

## Execution instructions

### 1. Find out how the site registers its pages

Read the build script. A page is queued one of two ways, and that decides what "add a page" even means here:

- **`.scan()`** — every `.hbs` under `config.folders.pages` (default `src/pages`) is picked up automatically by filename, matched to a same-named model/controller if one exists. Adding a page can be nothing more than adding a file.
- **Explicit `.page()`/`.pages()`** — the script names every view. Adding a page means adding a call (or, for a `.pages()` fan-out, adding a record to the data the fan-out reads).

### 2. Add the new page

- **Scanned site**: create the `.hbs` view under `config.folders.pages`. If it needs data, add a same-named `.json` under `config.folders.models` (or a matching controller under `config.folders.controllers`) — `.scan()` matches by filename.
- **Explicitly registered site**: add a `.page()` call with `view`, and `model`/`controller` if the page needs them. A page that belongs to an existing fan-out (a blog post, a product) is usually one new record in the model the `.pages()` call already reads, not a new call — see `node_modules/kiss-ssg/llms.txt` `## API` for the full option list (`title`, `path`, `slug`, `sitemapPriority`, etc.).
- Copy the pattern of a page that already does something similar — its model shape, its controller, which partials/layout it extends — rather than inventing a new one.

### 3. Update an existing page

| What's changing               | Edit                                                                    |
| ----------------------------- | ----------------------------------------------------------------------- |
| Copy / markup / layout usage  | the `.hbs` view                                                         |
| Data shown on the page        | the `.json` model, or the source the model reads from                   |
| Sorting, derived fields, slug | the controller                                                          |
| Shared markup (nav, footer)   | the partial/layout it comes from — this changes every page that uses it |

If the site runs a dev server (`dev: true`, started via `.watch()`), edit and watch it reload rather than rebuilding by hand: a page-view edit re-renders just that page; a partial or layout edit re-renders every page that rendered it; anything else — an edited model, a controller, a new or deleted page file — triggers a whole-site rebuild that replays `.page()`/`.pages()`/`.scan()` from scratch, so the change actually takes effect. See `node_modules/kiss-ssg/llms.txt` `.watch()` for the exact scoping rules and `node_modules/kiss-ssg/AIKB/watcher.md` / `AIKB/dependency-graph.md` for how the scoping is decided.

### 4. Don't let a page collide or silently disappear

- Two pages resolving to the same output path fail the whole build (`Page already processed`) — if the new page could share a slug with an existing one (two records with the same title, a fan-out and a hand-registered page landing on the same path), dedupe before registering rather than relying on last-registered-wins.
- Removing a page cleanly means removing its `.page()` call (or setting `generate: false`), or — on a `.scan()`'d site — deleting its `.hbs` file; either way the next whole-site rebuild also deletes the stale output file. Leaving the call in place while emptying the view is not the same thing. **Before you remove one, grep the views for `{{link "<its id>"`**: a page linked by identity fails every page that links to it the moment it stops being generated, which is the point of linking by identity — fix the linking pages first, or give the old URL an `aliases` entry on the page that replaces it.
- Every page has an **`id`**, defaulting from its view (`about.hbs` → `about`, a `.pages()` item → `<view route>/<slug>`, or `<registration id>/<slug>` when the registration sets `id`). Two pages with the same explicit `id` fail the build (`Page id already claimed`); one view rendered by two `.page()` calls gets no default id and a notice telling you to set one — set `id` on both. `node_modules/kiss-ssg/llms.txt` § API has the rules.

### 4a. Link to other pages by identity, not by path

Write `href="{{link "about"}}"`, `{{link "blog/post" slug=post.slug}}`, `{{link "contact" absolute=true}}` — never a hand-typed `/about.html` or `/about/`. The URL of a page is derived from `extensionLess`, `path` and `slug`, so a typed path is a guess that breaks the day any of them changes; `{{link}}` renders the path the build actually writes, and an id that resolves to nothing fails the build with the id and the page that asked, which is what you want. A hand-written internal path is still checked (`broken link:` in the check report), but a fixed one costs a rebuild; a `{{link}}` never needs fixing. Reach for the site's `AIKB/site-map.md` **Id** column to see every valid target — that is the autocomplete.

### 5. Verify

Build the site, then run the `kiss-build-check` skill (`/kiss-ssg:kiss-build-check`) and don't call the change done until it reports `ok: true`. A missing page or a silently empty element is exactly what `check` catches and a build's exit code alone does not.
