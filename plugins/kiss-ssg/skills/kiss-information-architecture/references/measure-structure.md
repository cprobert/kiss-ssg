# Measuring a site's structure

Two tools for `kiss-information-architecture`: what the build reports about a site's structure, and the table to fill in before restructuring a site that already exists.

## Orphans and depth, from the build

The build names the pages nothing links to. Its link check resolves every link each page wrote, with the same parser the rest of the build uses, so a link inside a comment or a script is not counted and an image map's `<area>` is:

```bash
npx kiss-ssg check --summary <build-script>
```

prints one line for them, `orphan pages (N, no other page links to them): …`, naming the first five, and the JSON report (`npx kiss-ssg check <build-script>`) lists them all under `links.orphans`. A page counts as linked when any other page links to it by any spelling: relative, root-relative, or absolute to the site's own `siteUrl`. The home page and `404.html` are never orphans, and neither is a page in a learning package, which an LMS opens from its manifest.

Depth is in the URL: read the `<loc>` lines of the built `sitemap.xml`, where each `/` after the domain is one level down.

How to read them:

- **An orphan** is reachable only from a search engine, or a URL someone was given. Name each one and the page that should link to it, or say why it is deliberately unlinked (a campaign landing page, a thank-you page after a form).
- **A deep page** (three levels or more) needs a route to it: check that its section nav or a related link leads to it, and that breadcrumbs lead back.

On `node_modules/kiss-ssg/examples/11-blog/` the check names no orphan: every post, listing page and tag page is linked from at least one other page.

## Before restructuring an existing site

List what is there before moving anything: on an import that replaces published pages, a design lift that touches structure, or a restructure. One row per current URL:

| Field         | What goes in it                                             |
| ------------- | ----------------------------------------------------------- |
| Current URL   | The page's address now                                      |
| Title         | The page's title as published                               |
| Type          | Home, section, item, landing, form step, or other           |
| Task          | What the page helps a reader do, in the reader's words      |
| Section       | Where it sits now                                           |
| Decision      | Keep, merge, rewrite, redirect or remove                    |
| New place     | The section and URL it moves to                             |
| Old URL kept? | The `aliases` entry that keeps the old address, if it moves |

A page with no task it serves is a candidate for removal. Two pages with one task are candidates for a merge. Ask the owner before removing or merging anything: the decision column is a proposal until they agree. Every row whose URL changes gets an `aliases` entry, so links and bookmarks that point at the old address still arrive.
