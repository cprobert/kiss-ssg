---
name: kiss-seo
description: Make a kiss-ssg site findable in search and clear in a search result or a link preview — one purpose per page, titles and meta descriptions written for the person reading the result, the reader's own search words used naturally, a clean heading outline, canonical URLs for deliberate copies, when to keep a page out of search (noindex, not robots disallow), old URLs kept with redirects, social preview images, and structured data. Use when asked about "SEO", "ranking", "Google", "search results", "meta description", "page title", "noindex", "robots.txt", "canonical", "og:image", "link preview", "structured data", or when a page is added or renamed. kiss-site-new and kiss-page-add call it to build, and kiss-site-review calls it to review. Not for writing the page's body copy (kiss-writing-for-the-web).
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# SEO

Search follows the reader. Google's own guidance (Search Central) is to write for people first and use search optimisation to help them find it: descriptive titles and headings, the words people search with used naturally, meaningful link text, and no preferred word count. The order is **the reader's task → clear content → a clean structure → search**, never keyword targets first and copy after.

## In a kiss site

kiss writes most of the machinery from one registry, so it cannot disagree with the site; this skill says what to put in it and why:

- **`title` and `description` are page options** on `.page()`, and the layout prints them (`node_modules/kiss-ssg/GUIDE.md` § .page()). The audit reports a missing or duplicate one; `kiss-site-review` says the layout fix.
- **The sitemap, robots.txt, the feed and `llms.txt`** come from `.sitemap()`, `.robots()`, `.feed()` and `.llms()` (`node_modules/kiss-ssg/GUIDE.md` § .sitemap(), § .robots(), § .feed(), § .llms()).
- **`{{canonical}}`, `siteUrl`, `links.canonical` and `links.trailingSlash`** decide every URL kiss prints (`node_modules/kiss-ssg/GUIDE.md` § Host URL policy). A setting that does not match the host costs a redirect on every link and a sitemap of redirecting URLs; `kiss-site-new` says how to choose.
- **A page that moves keeps its old URL** through `aliases` (`node_modules/kiss-ssg/GUIDE.md` § Redirects), so links and bookmarks that point at it still arrive.
- **A fact said twice** (a phone number in the markup and in the JSON-LD) lives once, in `config/` (`node_modules/kiss-ssg/llms.txt` § The build script).

## Build mode

- **One main purpose per page.** Two pages that answer the same question compete with each other; merge them, or give each its own question.
- **A title says what this page is,** in the words its reader would search with, front-loaded, then the site name: never the site name alone, and never the page's slug (a home page with no `title` ships as "Index"). Every page's title is its own.
- **A description says what the reader gets from the page,** for the person deciding whether to click a search result. Every page's description is its own; one tagline on every page is a finding. It is written like the page's copy (`kiss-writing-for-the-web`), and never stuffed with keywords.
- **Headings are an outline:** one `<h1>` that names the page, and levels that never skip. The audit reports both.
- **Links say where they go,** in words that also tell a search engine what the target is about ("Prices and call-out times", not "Learn more").
- **Images carry `alt` text** that says what the image shows when it matters to the page, and `alt=""` when it is decoration.
- **A deliberate copy of another page** sets its `canonical` option to the original's absolute URL: the page's canonical link names the original, and kiss leaves the copy out of the sitemap, `llms.txt` and the feed (`node_modules/kiss-ssg/llms.txt`, `.page()`).
- **Keeping a page out of search:** Use `disallow` for real exclusions only: **`disallow: '/'` removes the site from search**, so never reach for it to hide a staging build without being certain that config cannot ship (it logs a notice every build and sets `report().robots.disallowAll` so a check diff catches it). Do **not** reach for `disallow` to keep a page out of search — that is what `ignoreSitemap` plus a `noindex` tag is for; blocking the crawler stops it seeing the `noindex` and can leave the URL indexed with no snippet.
- **A link preview** needs an absolute `og:image` (the audit reports one missing or relative), and the page's own title and description.
- **Structured data** (JSON-LD) states facts the page already shows — the organisation, its address, a product's price — and never a fact the page does not. Its facts come from the same `config/` values as the markup, so the two cannot disagree. `kiss-site-import` says where it goes in a layout.

## Review mode

Report to the [review protocol](../kiss-site-review/review-protocol.md): every finding before anything is edited, with its priority and its measurement, one row per cause. A choice the site records is not a finding, and a record whose own reason a measurement now contradicts is marked **ask**; the protocol has the rule. Look at the site in a browser as the [browser pass](../kiss-site-review/browser-pass.md) says; without a browser, the browser checks did not run, and the report says so.

Read the build's audit first (`npx kiss-ssg check <site-script> --summary`): `title-missing`, `title-duplicate`, `description-missing`, `description-duplicate`, `canonical-missing`, `og-image-missing`, `og-image-relative`, `h1-count`, `heading-skip` and `site-url-local` are about search. The layout fix for each is `kiss-site-review`'s; what the title, description or heading should say is this skill's. Then check:

- **Every page's title and description** against the build mode: its own, specific, front-loaded, in the reader's words. Quote the weak ones.
- **robots.txt:** a `Disallow: /` takes the whole site out of search. kiss logs a notice on every build that writes one and sets `report().robots.disallowAll`; a site that is meant to be found must not ship it.
- **Pages that compete:** two pages with the same purpose or near-identical titles.
- **Moved pages:** an old URL that now 404s, where an `aliases` entry would keep it.
- **Structured data** that states a fact the page does not show, or that disagrees with it.
