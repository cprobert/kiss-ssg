# Measuring a site's structure

Two tools for `kiss-information-architecture`: a script that measures a built site, and the table to fill in before restructuring a site that already exists.

## Links in and depth, from the build folder

The build reports broken links but not a page that nothing links to. This script reads every HTML page in a build folder and prints three columns: how many other pages link to the page, how deep it sits, and its path. The fewest links in come first, and the deepest of those before the rest.

Save it outside the site's source folders (a scratch folder is fine), build the site, then run it on the build folder, with the site's `siteUrl`:

```js
// node structure.mjs <build-folder> [<site-url>]
// Each page's links in, its depth and its path, fewest links first.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] ?? 'public')
// Where the site is served: its links to its own pages may be absolute
// (https://example.com/about/), and under a path (https://example.com/docs/)
// every page's URL starts with that path. Without one, only relative and
// root-relative links can be followed.
const site = new URL(process.argv[3] ?? 'https://site.invalid/')
const base = site.pathname.replace(/\/?$/, '/')
// A page is an .html file with an <html> or <body> in it: a search console
// verification file (google1234.html) is copied as an asset, not a page.
const html = new Map(
  fs
    .readdirSync(root, { recursive: true })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => f.endsWith('.html') && !/(^|\/)404\.html$/.test(f))
    // A file: a folder may be named embed.html too, and a symlink may point
    // at nothing.
    .filter((f) => {
      try {
        return fs.statSync(path.join(root, f)).isFile()
      } catch {
        return false
      }
    })
    .map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')])
    .filter(([, source]) => /<(html|body)[\s>]/i.test(source)),
)
const files = [...html.keys()]
// One key for /about.html, /about and /about/; index.html only as a whole
// file name, so /blog/reindex.html stays a page of its own.
const key = (p) =>
  p
    .replace(/(^|\/)index\.html$/, '$1')
    .replace(/\.html$/, '')
    .replace(/\/$/, '') || '/'

const linksIn = new Map(files.map((f) => [key('/' + f), new Set()]))
for (const file of files) {
  const page = key('/' + file)
  // The page's own URL, which its relative links resolve against: the file's
  // path, each part encoded, so a `#` or `?` in a folder's name is part of
  // the path, not a fragment or a query.
  const pageUrl =
    site.origin + base + file.split('/').map(encodeURIComponent).join('/')
  // No link a reader cannot follow: one inside a comment, or in the text of
  // a <script>, a <template> or a <style>.
  const readable = html
    .get(file)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|template|style)\b[\s\S]*?<\/\1\s*>/gi, '')
  // A link a reader can follow: the href of an <a>, or of an image map's
  // <area>, quoted or not. Not a <link> in the head, and not a data-href.
  // The whole tag first, a quoted value and all (`title="Next > step"`),
  // then its href among its attributes.
  const tag = /<(?:a|area)\s((?:[^>"']|"[^"]*"|'[^']*')*)>/gi
  const attribute =
    /([^\s="'>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  for (const [, attributes] of readable.matchAll(tag)) {
    const href = [...attributes.matchAll(attribute)].find(
      (a) => a[1].toLowerCase() === 'href',
    )
    if (!href) continue
    let url
    try {
      url = new URL(href[2] ?? href[3] ?? href[4] ?? '', pageUrl)
    } catch {
      continue
    }
    if (url.origin !== site.origin) continue
    // A URL's path arrives percent-encoded (/caf%C3%A9/) and a file name does
    // not (café), and a link to the site's own address may drop its slash.
    let target
    try {
      target = decodeURIComponent(url.pathname)
    } catch {
      continue
    }
    if (target + '/' === base) target = base
    if (!target.startsWith(base)) continue
    target = key('/' + target.slice(base.length))
    if (target !== page) linksIn.get(target)?.add(page)
  }
}
const rows = [...linksIn].map(([p, from]) => ({
  in: from.size,
  depth: p === '/' ? 0 : p.split('/').length - 1,
  page: p,
}))
rows.sort((a, b) => a.in - b.in || b.depth - a.depth)
for (const r of rows) console.log(`${r.in}\t${r.depth}\t${r.page}`)
```

```bash
node structure.mjs public https://your-site.example/
```

Replace `public` with the site's build folder and `https://your-site.example/` with its `siteUrl`, path and all when the site is served under one (`https://example.github.io/docs/`). The address matters when the layout writes absolute links to the site's own pages (`{{link … absolute=true}}`, `{{absUrl}}`): without it, those links cannot be followed, and nearly every page reads as an orphan. Leave it off only for a site whose links are all relative or root-relative.

The script counts the links a reader can follow, the `href` of an `<a>` or of an image map's `<area>`, and not a `<link>` in the head, a `data-href`, or a link inside a comment, a `<script>`, a `<template>` or a `<style>`. It reads pages only: an `.html` file with an `<html>` or `<body>` in it, so a verification file such as `google1234.html` is not counted as an orphan. It resolves each one the way a browser does, counts each linking page once, and treats `/about.html`, `/about` and `/about/` as one page, so the count holds whether or not the site is `extensionLess`. It does not count a page's link to itself, a link outside the site's address, or the 404 page, either as a page or as a source of links. On `node_modules/kiss-ssg/examples/11-blog/`, the first line is `1	3	/journal/page/2`: page two of the post listing has one link in (from page one) and sits three levels deep.

How to read the output:

- **A `0` in the first column is an orphan.** No other page links to it. Before reporting one, check that the address given was the site's own.
- **A low count deep in the site** is a page that only one route reaches. Check that its section nav or a related link leads to it, and that breadcrumbs lead back.
- **A count equal to nearly every page** means the page is in the global nav or the footer. That is right for a top-level section, and worth asking about for anything else.

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
