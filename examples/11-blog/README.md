# 11 · a blog

An exemplar site: six posts, three to a page, four tag pages, an RSS feed and a `_redirects`
file for the one post that was renamed. It builds clean and exits 0.

A blog is the shape most sites turn out to be underneath, and it is the shape an agent
reinvents from first principles every time — usually badly, and usually in four specific places.
Those four are what this example is: **a folder fan-out with a controller file**, **pagination**,
**tag pages**, and **a feed**. Copy the one you need.

## Run it

```bash
npm run eg11                  # from the repo root
node 11-blog.js               # from examples/
node 11-blog.js --broken      # same site, one deliberately broken link
node 11-blog.js --dev         # live preview on http://127.0.0.1:3011
```

Fourteen pages, exit 0, no warnings. The check says the same thing in one line:

```
$ npx kiss-ssg check 11-blog.js --summary
ok ../public/11-blog (check) — 14 pages, 0 failed, 2 assets, 666ms
  = 14 unchanged
```

No finding lines at all, and `= 14 unchanged` is the diff against `AIKB/last-build.json` — the
site is recorded, so the check compares this build against the last one that was committed
without being asked to.

## The four recipes

### 1 · Posts are a folder fan-out with a controller file

One JSON file per post in `11-blog/models/posts/`, one page each from `blog/post.hbs`, and
`controllers/post.js` between them. The controller does the three jobs a data-fed fan-out always
has — validate the record, derive the slug, shape the model — and one more that is specific to a
blog:

```js
return {
  slug: slugFor(model),
  title: model.title, // <title>, llms.txt, the feed's <title>
  description: model.summary, // <meta description>, the feed's <description>
  date: model.date, // what .feed() orders by
  model: { ...model, url: urlFor(model), tags: [...] },
}
```

`title`, `description` and `date` go on the **page**, not left inside the model. `.feed()` would
still find a date in the model — it reads the page option first and the model second — but
nothing else would: `llms.txt`, `sitemap.xml` and the layout all read the page's own options.

The record's `slug` is the URL; the filenames are dated (`2026-03-02-pour-over-at-home.json`) so
a folder listing sorts itself, and no date ever reaches a URL.

The build script reads the same folder for itself, through `loadPosts` in that same controller
file — the listing and the tag pages need the records _before_ any page is registered. Reading
it through the module that validates it is what keeps the two readings from drifting.

### 2 · Pagination

Three posts to a page: `/blog/` and `/blog/page/2/`, with prev and next links. The whole recipe
is a loop in `11-blog.js`:

```js
const pageCount = Math.max(1, Math.ceil(cards.length / PER_PAGE))
for (let number = 1; number <= pageCount; number++) {
  kiss.page({
    view: 'blog/listing.hbs',
    path: number === 1 ? 'blog' : 'blog/page',
    slug: number === 1 ? 'index' : String(number),
    root: number === 1 ? '../' : '../../../',
    model: { posts: cards.slice(...), number, of: pageCount, prev, next, tags },
  })
}
```

**Why a loop and not a controller.** Pagination is arithmetic over the whole collection: how
many pages there are is a property of all the posts at once. A controller only ever sees one
record, so it can tell you a post's slug but never how many listing pages exist. Anything a
controller cannot know belongs in the script that knows it.

**Why page 1 is `/blog/` and not `/blog/page/1/`.** The section index is the URL people link to
and the one the nav points at. Numbering it would move it the day a seventh post is written.

**`root` is a page option here.** One view is rendered at two depths — `blog/index.html` and
`blog/page/2/index.html` — and the shared layout builds its stylesheet and nav links from
`{{root}}`, the climb back to the build root. The template cannot know how deep it is, so the
script tells it: `{{#extend "layout" root=root}}`. Every other view in this site is at one fixed
depth and writes its own (`root="../../"`).

### 3 · Tag pages are a second fan-out

A tag is not a record anybody writes. It exists because some posts mention it, so the list of
tags is a **derivation** of the posts — `tagRecords()` in `controllers/tag.js` folds them into
one record per tag, and `.pages()` builds a page from each:

```js
.pages({ view: 'blog/tag.hbs', model: tags, path: 'blog/tags', controller: 'tag.js' })
```

`.pages()` does not care whether the model is a folder it read or an array the script computed;
the requirement is only that it resolves to an array. The records are sorted by slug so two
builds of the same folder register the same pages in the same order — a fan-out over an
unsorted `Map` makes `sitemap.xml` and `feed.xml` churn between builds for no reason.

`controllers/tag.js` is a **file** rather than an inline function on purpose: a controller file
is a _subject_ of the site's knowledge base, which is what gives `AIKB/notes/controllers/tag.md`
somewhere to live. An inline controller has no file to attach a note to.

### 4 · A feed, and the redirect that comes with a rename

```js
.sitemap()
.feed({ title: 'Aster & Oak — the journal', description: '…', section: 'blog' })
.llms({ title: '…', summary: '…', sections: { root: 'The site', blog: 'The journal' } })
```

Three files, one registry. Every URL in all three is joined the same way as the page's own
`{{canonical}}`, so none of them can name a URL this site does not serve. `section: 'blog'`
keeps the home page out of the feed; the listing and tag pages have no `date`, so they fall out
on their own and the feed is exactly the six posts, newest first. `<lastBuildDate>` is the
newest post's date rather than the wall clock, so the file is byte-identical between two builds.

Every page carries `<link rel="alternate" type="application/rss+xml" href="/feed.xml">` in its
head, from the `head-feed` partial.

**The rename.** `models/posts/2026-02-18-the-cascara-experiment.json` used to be published at a
different address, and its record says so:

```json
"aliases": ["/blog/cascara-notes.html"]
```

which is the whole of the recipe. The build writes `../public/11-blog/_redirects`:

```
/blog/cascara-notes.html /blog/the-cascara-experiment/ 301
```

The target is the page's canonical path, taken from the registry — the same string the sitemap
and the feed use. `aliases` belongs to the **record**, never to the `.pages()` registration: one
old path redirecting to six different posts is not a redirect. Being an ordinary page option it
also reaches the template, which is how the post page prints "formerly published at".

## What `--broken` shows

The default run is clean — 161 internal references, none broken. `--broken` makes one post
render one link to `/blog/the-kenya-microlot/`, a post that was never published:

```
$ npx kiss-ssg check 11-blog.js --summary -- --broken
ok ../public/11-blog (check) — 14 pages, 0 failed, 2 assets, 622ms
  broken link: ../public/11-blog/blog/the-cascara-experiment/index.html -> /blog/the-kenya-microlot/
  ~ ../public/11-blog/blog/the-cascara-experiment/index.html
  = 13 unchanged
```

Two readings of the same edit: the finding says the link goes nowhere, and the diff line says
which page's bytes changed since the folder was recorded.

The build still exits **0**. A broken link is a _finding_, not an error: it never changes `ok`
and never changes an exit code, because the page it is on is a perfectly good page. `check` is
the only thing that says it out loud, which is the reason to run `check` before you close a
piece of work rather than only trusting a green build.

(The flag is an ordinary page option — `broken` on the `.pages()` registration — so it reaches
every post's template, and only the one post that carries a `staleLink` renders anything with
it. `--` in the command line above is what stops `check` reading the flag for itself.)

## The knowledge base it ships

`11-blog/AIKB/` is committed. Nothing in `11-blog.js` writes it; one command does, and only from
a build that passed:

```bash
cd examples && npx kiss-ssg aikb 11-blog.js --summary
```

This site has two subjects — `controllers/post.js` and `controllers/tag.js`, the two controller
**files** — and both have an authored note under `AIKB/notes/controllers/`, stamped with that
controller's current hash. So all four note findings are empty, which is what makes the folder
an exemplar rather than a specimen. Change either controller without touching its note and the
next check says `note stale:` and names it.

Example 9's `AIKB/` is the other one to read: it is the minimal case (one subject, one note).
This one is what a folder looks like once a site has more than one thing worth explaining.
