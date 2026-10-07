# Sitemap, llms.txt and feeds

The files search engines and answer engines read, derived from the same page registry: sitemap.xml, llms.txt and a Markdown copy of every page, an RSS feed and robots.txt.

## `.sitemap()`

Generates a `sitemap.xml` in the root of the build folder from every page you've registered, so you don't need to hand-roll one yourself. Requires `siteUrl` to be set on the Kiss config; it logs an error and skips writing if it isn't.

```js
import Kiss from 'kiss-ssg'
const kiss = new Kiss({ siteUrl: 'https://example.com' })
kiss.scan().generate().sitemap()
```

It can be called before or after `.generate()` — both just wait for all your pages to be registered before doing their own thing.

Each `<loc>` is the same string the `canonical` helper renders on that page, built by the same code — so a page built to a directory index is listed with its trailing slash (`courses/index.html` → `https://example.com/courses/`), which is the URL Netlify serves without a redirect, or without it under `links: { trailingSlash: false }` for a host that serves the bare form ([Host URL policy](../urls/#host-url-policy)). See **canonical / absUrl** below.

A page that names another URL as its canonical — `canonical: 'https://sister.example/course'` on the page, or set by its controller — is left out too, and `{{canonical}}` renders that URL: the page has said another one is the real one, and a sitemap that listed it would advertise a duplicate. The same page is out of `llms.txt` and the feed, `report().pages[].canonical` carries the URL, and `--summary` counts them. A value that is not an absolute `http(s)://` URL fails the page at registration. Any individual page can opt out with `ignoreSitemap: true`, and override the sitemap entry with `sitemapPriority` (default `'1.00'`), `sitemapChangefreq` (omitted unless set), and `sitemapLastmod` (default: the current time, shared across all pages): A page with `generate: false` is left out as well.

```js
kiss.page({
  view: 'private/index.hbs',
  ignoreSitemap: true,
})

kiss.page({
  view: 'landing-page.hbs',
  sitemapPriority: '0.9',
  sitemapChangefreq: 'weekly',
})
```

`sitemap.xml` is overwritten on every call by default. Pass `{ overwrite: false }` to skip writing (and skip the callback firing with data) if one already exists at the build path:

```js
kiss.sitemap({ overwrite: false })
```

**Note**: `overwrite: false` only has an effect if you also set `cleanBuild: false` on the Kiss config. With the default `cleanBuild: true`, the whole build folder — including any previous `sitemap.xml` — is emptied before generation starts, so there's never an existing file left for `.sitemap()` to find.

## `.llms()`

Writes an [`llms.txt` (opens in a new tab)](https://llmstxt.org) into the root of the build folder: the curated, AI-facing index of your site, the file an answer engine reads before it crawls. It is `.sitemap()`'s sibling — same registry, same titles, a different reader — so the two can never drift apart. Where the sitemap lists each page, `llms.txt` links each page's Markdown copy (see **Markdown copies for agents** below), which is what the llmstxt.org spec asks its links to point at. It needs `siteUrl`, a `title` and a `summary`; without any of them it logs an error and skips the file rather than throwing.

```js
kiss
  .page({
    view: 'index.hbs',
    title: 'A1K9 Training',
    description: 'Dog training and behaviour work in South Wales',
  })
  .pages({ view: 'courses/course.hbs', model: 'courses', path: 'courses' })
  .page({ view: 'rota.hbs', ignoreLlms: true }) // in the sitemap, out of the index
  .generate()
  .sitemap()
  .llms({
    title: 'A1K9 Training',
    summary: 'Dog behaviour and obedience training in South Wales.',
    sections: { root: 'Pages', courses: 'Courses' },
    notes: 'src/content/llms-notes.md',
  })
```

writes:

```markdown
# A1K9 Training

> Dog behaviour and obedience training in South Wales.

## Pages

- [A1K9 Training](https://a1k9training.co.uk/index.md): Dog training and behaviour work in South Wales

## Courses

- [Bronze obedience](https://a1k9training.co.uk/courses/bronze-obedience.md): Six weeks, group class
```

**The options**: `title` is the `#` heading and `summary` the `>` blockquote — and `summary` (like the optional `notes`, which becomes a trailing `## Notes` section) is either the text itself or a path, relative to your working directory, to a `.md`/`.txt` file holding it, so a long summary can live beside the rest of your content. `sections` maps a top-level path segment to a heading (`{ courses: 'Courses' }`); the key `root` names the section holding pages with no path (default `Pages`), and any segment you do not map is title-cased (`behavioural-consultations` → `Behavioural Consultations`). `overwrite` (default `true`) behaves exactly as the sitemap's.

**Which pages are listed**: every registered page, grouped by the first segment of its `path` with the root group first, in registration order. A page opts out with `ignoreLlms: true`, and a page already out of the sitemap (`ignoreSitemap: true`) or not being built at all (`generate: false`) is out of `llms.txt` too — the index is a subset of the site the sitemap describes, never a superset. `llmsSection: 'Name'` puts one page under a heading of your choosing regardless of its path. Each entry is `- [title](https://github.com/cprobert/kiss-ssg/blob/main/url): description`, with the description omitted when the page has none and the title falling back to the page's slug, title-cased. Each URL is the page's Markdown copy (`…/courses/bronze-obedience.md`, `…/index.md` for the home page); on a site with `markdownCopies: false`, and for a page that turns its copy off, it is instead the same string that page's own `{{canonical}}` renders.

It is chainable, can be called before or after `.generate()`, and is re-run by a whole-site watch rebuild like `.sitemap()`. Its callback receives the rendered text (`kiss.llms(options, (text) => …)`), and the file it wrote is reported as the build report's `llms`.

## Markdown copies for agents

Every HTML page the build writes gets a Markdown copy beside it: `about.html` → `about.md`, and a directory index `courses/index.html` → `courses/index.md`. That is the [llmstxt.org (opens in a new tab)](https://llmstxt.org) convention — a clean Markdown version of a page at the same URL with `.md` on the end — and it is on by default, so an agent reading your site gets each page's content without its markup, and `llms.txt` links straight to it.

The copy is converted from the HTML the build **wrote**, not from your templates or models: what a reader is shown is what the agent reads. kiss takes the page's `<main>` element — or `<body>` when the page has no `<main>` — removes every `<nav>`, `<script>`, `<style>` and `<template>` inside it, and converts what is left with [turndown (opens in a new tab)](https://github.com/mixmark-io/turndown): `#` headings, fenced code blocks that keep their `language-` class, and GitHub-style tables. A layout with a `<main>` around the page's own content therefore gets copies without its header, footer and menus; a `<nav>` inside `<main>` (a docs table of contents) is dropped too. `<noscript>` is kept: an agent runs no script, so its fallback is what that reader gets.

```js
new Kiss({ markdownCopies: { selector: 'article' } }) // convert <article> instead
new Kiss({ markdownCopies: false }) // no copies at all
kiss.page({ view: 'thanks.hbs', config: { markdownCopies: false } }) // none for this page
```

**What gets one:** every page written as HTML, including your `404` page and a page with `ignoreSitemap` or `ignoreLlms` — the copies are for every page, `llms.txt` is the curated list of them. A page written with another `ext` (`json`, `xml`) and a `generate: false` page get none. A selector that matches nothing on a page, or matches an element with nothing in it (a script-rendered `<main id="app">`), falls back to `<body>` for that page rather than writing an empty copy. A selector that is not valid CSS fails every page, with an error naming `config.markdownCopies.selector`.

**Links:** every link in a copy is the `href` its page wrote, and because the copy sits in the same folder, a relative link resolves from `about.md` exactly as from `about.html` — the broken-link check has already checked them against the page. A parenthesis in a URL comes out escaped (`a\(b\)`), which is the Markdown spelling of the same address. The check does **not** read the copies themselves or `llms.txt`'s links to them; those are generated from the same output path the page is written to, so they are right by construction rather than by a check.

**When a copy cannot be made**, its page fails and `.complete()` rejects, as for any page that cannot be written. A conversion that throws stops the page before either file is written; a copy whose own write fails leaves the HTML already written on disk, under a page the report marks as failed. That is deliberate — `llms.txt` links the copy, and a build that passed while linking a copy that is not there would be the silent failure kiss exists to prevent. The build report names each copy as `pages[].markdown` (`null` for a page that wrote none), so `npx kiss-ssg check` shows them. A `--dev` build writes copies too, and a whole-site rebuild removes a copy no page writes any more.

**Hosting:** the copies are ordinary files in the build folder and are published with it. A host that processes Markdown itself would turn them back into pages — classic GitHub Pages publishing from a branch runs Jekyll, which does that unless the build folder has a `.nojekyll` file. This has not been measured against a live deployment; a site deployed with `actions/upload-pages-artifact`, as this guide's own site is, publishes the folder as it is.

## `.feed()`

Writes an RSS 2.0 feed into the root of the build folder: the third file derived from the same registry as `sitemap.xml` and `llms.txt`, so an item can never name a URL your site does not serve. One `<item>` per page that carries a date, newest first. It needs `siteUrl` and a `title`; without either it logs an error and skips the file rather than throwing.

```js
kiss
  .pages({
    view: 'blog/post.hbs',
    model: 'posts', // each post's JSON carries its own `date`
    path: 'blog',
  })
  .page({ view: 'blog/index.hbs', path: 'blog' }) // no date: not an item
  .generate()
  .sitemap()
  .feed({
    title: 'A1K9 Training — the blog',
    description: 'Dog behaviour and obedience training in South Wales.',
    section: 'blog',
    limit: 20,
  })
```

writes `public/feed.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>A1K9 Training — the blog</title>
    <link>https://a1k9training.co.uk/</link>
    <description>Dog behaviour and obedience training in South Wales.</description>
    <atom:link href="https://a1k9training.co.uk/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>Tue, 03 Feb 2026 00:00:00 GMT</lastBuildDate>
    <item>
      <title>Loose-lead walking</title>
      <link>https://a1k9training.co.uk/blog/loose-lead-walking</link>
      <guid isPermaLink="true">https://a1k9training.co.uk/blog/loose-lead-walking</guid>
      <pubDate>Tue, 03 Feb 2026 00:00:00 GMT</pubDate>
      <description>Six weeks, one lead, no pulling.</description>
    </item>
  </channel>
</rss>
```

**The options**: `title` (required) is the channel's `<title>` and `description` its `<description>`. `section` limits the feed to one top-level `path` segment (`'blog'`) — omit it and every page is a candidate. `limit` (default `20`) caps the items, `filename` (default `feed.xml`) names the file inside the build folder (a name that resolves outside it is refused), and `overwrite` (default `true`) behaves exactly as the sitemap's.

**Where the dates come from**: `dateField` (default `'date'`) names one field, and it is read from the page's options first and its resolved model second — so a post can be dated in its `.page()`/`.pages()` call or in its own `.json`, and either way it is the same key. A `Date`, epoch milliseconds, or any string `new Date()` parses is accepted; a value that cannot be read logs one warning and the page is treated as undated.

**Which pages are items**: every page with a readable date, newest first (the URL breaks a tie so the order is the same on every machine). A page with no date is simply left out — most of a site is undated, and that is not a mistake worth a warning. A page opts out with `ignoreFeed: true`, and a page already out of the sitemap (`ignoreSitemap: true`) or not being built at all (`generate: false`) is out of the feed too. Each `<link>` and `<guid>` is the same string that page's own `{{canonical}}` renders, and the `<title>`/`<description>` are derived exactly as `llms.txt` derives them.

`<lastBuildDate>` is the newest item's date rather than the wall clock, so two identical builds produce byte-identical files and a feed you commit does not churn. It is chainable, can be called before or after `.generate()`, and is re-run by a whole-site watch rebuild like `.sitemap()` and `.llms()`. Its callback receives the rendered document (`kiss.feed(options, (xml) => …)`), and the file it wrote is reported as the build report's `feed`.

## `.robots()`

```js
kiss.page({ view: 'index.hbs' }).sitemap().robots().generate()
```

writes `public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml
```

**That last line is the point.** The block above it is boilerplate you can hand-write — and probably have. What a hand-written `robots.txt` cannot do is stay in step with the build: this one is produced by the same `toAbsoluteUrl` join as every `<loc>`, so the sitemap a crawler is pointed at is character-for-character the one `.sitemap()` wrote, and it moves with [`links.trailingSlash`](../urls/#host-url-policy). It is emitted **only when this build calls `.sitemap()`** — advertising a `sitemap.xml` that was never written is a fetch error in every crawler that reads the line.

Same lifecycle as `.sitemap()`, `.llms()` and `.feed()`: chainable, callable before or after `.generate()`, callable on either side of `.sitemap()` (both give the same file), re-run by a watch rebuild. A write failure is logged and skipped — this is discovery, like the sitemap, not the redirects case where a missing file 404s a reader who already has the link.

```js
kiss.robots({
  agents: [
    { userAgent: '*', disallow: ['/admin/', '/tmp/'] },
    { userAgent: 'BadBot', disallow: '/', crawlDelay: 10 },
  ],
})
```

`agents` is one block per crawler; `userAgent`/`allow`/`disallow` at the top level are the shorthand for a single block, and each takes a path or an array. `sitemap` is `true` (the default), `false`, or a URL or path — or an array — to advertise instead of this build's own. `overwrite: false` leaves a `robots.txt` you keep in `src/assets/` exactly where it is. A path containing whitespace is dropped rather than written, because one directive is one line and there is no escape for a newline.

`report().robots` is `{ file, agents, disallowAll, sitemaps }`, or `null` when you never called the method — an object rather than a bare path, unlike `sitemap` and `feed`, for one reason:

> **`disallow: '/'` removes your site from search.** It is one character from the bare `Disallow:` that means the opposite, and nothing else about the build looks wrong afterwards. So it logs a `notice` on **every** build that emits it, and `disallowAll` is on the report — which means a staging crawl policy that reaches production shows up in a `kiss-ssg check` diff rather than in Search Console a month later.

kiss never infers a `Disallow` for you. In particular **`ignoreSitemap` does not imply one**, and the omission is deliberate: blocking a crawler stops it fetching the page, which stops it seeing a `noindex`, which can leave the URL indexed with no snippet — worse than leaving it crawlable. Keeping a page out of the sitemap and keeping a crawler out of a page are different intents, and you state the second explicitly.
