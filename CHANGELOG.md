# Changelog

Written for people building a site with kiss-ssg, not for people maintaining it.
Newest first. `/branch-close` adds an entry alongside each version bump.

## 2.0.0-alpha.1 — 2026-09-05

**Fixed**

- `.pages()` gave every page in a fan-out the first item's value for any page
  option derived from the model — `{{title}}` was the one you would notice,
  while `{{model.title}}` looked correct. Each fanned-out page now gets its own
  options.
- In watch mode, saving a file under your assets folder rebuilt the whole site
  as well as recopying the assets. It now only recopies the assets.

**Changed**

- Pages, partials and sitemap entries are discovered in a stable sorted order,
  so two builds of the same site produce the same output regardless of the
  machine.
- Dependencies brought up to date (glob, chokidar, fs-extra, serve-static and
  friends). No change to how you configure or call kiss-ssg, and the Node floor
  is still 22.12.

**Added**

- `utils.posixPath(path)` and `utils.globFiles(pattern)` on the `utils` export.

## Unreleased

_v2 is in development on the `v2` branch. The v1 → v2 migration notes live in
[`llms.txt`](llms.txt) § Migrating from v1 and in the README, and will become
this file's `## 2.0.0` entry when the line is released._

**Fixed**

- A page whose view file is missing or misspelled now fails the build instead of
  writing the filename into the output. Previously `.page({ view: 'abuot.hbs' })`
  produced `public/abuot.html` containing the text `abuot.hbs`, and the build
  reported success.
- Deleting a page template while watching now rebuilds the whole site, instead of
  re-rendering the deleted page over its own output. If `.scan()` found that
  page, it is dropped from the site and its output file is deleted; a page you
  registered by name with `.page()` keeps failing the build until you remove the
  call.
- Deleting a partial or layout while watching now removes it from the site.
  Previously it kept rendering its last-known content until you restarted, so
  the dev server and a fresh production build disagreed; a page that still
  references the deleted partial now fails the rebuild instead.
- Creating a partial or layout while watching now registers it straight away.
  Previously new files were invisible until you restarted, and the next edit to
  a page referencing one failed silently, leaving that page's output frozen.
- Creating a page template while watching now builds it, on a site that uses
  `.scan()`. Previously it needed a restart, because a rebuild replayed the
  pages the first scan found rather than scanning again.
- `.scan()` no longer registers a view a second time when you called `.page()`
  for it earlier in the same chain — that produced a `Page already processed`
  error on the build.
- `await kiss.close()` no longer returns while a rebuild is still writing. A
  rebuild requested just before you closed kept running afterwards, so a clean
  or deploy step that ran once `close()` resolved raced files still being
  written — and could see the build folder recreated after it deleted it.
