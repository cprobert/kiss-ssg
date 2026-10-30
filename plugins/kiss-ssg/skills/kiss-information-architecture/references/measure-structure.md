# Measuring a site's structure

Two tools for `kiss-information-architecture`: a script that measures a built site, and the table to fill in before restructuring a site that already exists.

## Links in and depth, from the build folder

The build reports broken links but not a page that nothing links to. This script reads every HTML page in a build folder and prints three columns: how many other pages link to the page, how deep it sits, and its path. The fewest links in come first, and the deepest of those before the rest.

Save it outside the site's source folders (a scratch folder is fine), build the site, then run it on the build folder:

```js
// node structure.mjs <build-folder>
// Each page's links in, its depth and its path, fewest links first.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] ?? 'public')
const pages = fs
  .readdirSync(root, { recursive: true })
  .map((f) => '/' + f.split(path.sep).join('/'))
  .filter((p) => p.endsWith('.html') && !p.endsWith('/404.html'))
const key = (p) =>
  p
    .replace(/index\.html$/, '')
    .replace(/\.html$/, '')
    .replace(/\/$/, '') || '/'

const linksIn = new Map(pages.map((p) => [key(p), new Set()]))
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8')
  for (const [, , href] of html.matchAll(/href\s*=\s*(["'])(.*?)\1/g)) {
    let url
    try {
      url = new URL(href, 'http://site' + page)
    } catch {
      continue
    }
    const target = key(url.pathname)
    if (url.origin === 'http://site' && target !== key(page))
      linksIn.get(target)?.add(key(page))
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
node structure.mjs public
```

Replace `public` with the site's build folder. The script follows relative and root-relative links alike, the way a browser resolves them, and counts each linking page once. It treats `/about.html`, `/about` and `/about/` as one page, so the count holds whether or not the site is `extensionLess`. It does not count a link written as an absolute URL to the site's own domain, a page's link to itself, or the 404 page, either as a page or as a source of links. On `node_modules/kiss-ssg/examples/11-blog/`, the first line is `1	3	/blog/page/2`: page two of the post listing has one link in (from page one) and sits three levels deep.

How to read the output:

- **A `0` in the first column is an orphan.** No other page links to it.
- **A low count deep in the site** is a page that only one route reaches. Check that its section nav or a related link leads to it, and that breadcrumbs lead back.
- **A count equal to nearly every page** means the page is in the global nav or the footer. That is right for a top-level section, and worth asking about for anything else.

## Before restructuring an existing site

List what is there before moving anything: on an import, a design lift that touches structure, or a restructure. One row per current URL:

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
