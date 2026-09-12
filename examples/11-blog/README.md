# 11 · a blog

An exemplar site: six posts, three to a page, four tag pages, an RSS feed and a `_redirects`
file for the one post that was renamed. It builds clean and exits 0.

A blog is the shape most sites turn out to be underneath, and it is the shape an agent
reinvents from first principles every time — usually badly, and usually in four specific places.
Those four are what this example is: **a folder fan-out with a controller file**, **pagination**,
**tag pages**, and **a feed**. Copy the one you need. Running through all four is a fifth habit
worth stealing whole: **not one view in this site writes a URL** — every internal link is asked
for by identity with `{{link}}`, and there is a recipe for that below too.

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
  model: { ...model, dateLabel: dateLabel(model.date) },
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
    id: listingId(number), // 'blog', 'blog/page/2' — see "Linking by identity"
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
.pages({
  view: 'blog/tag.hbs',
  model: tags,
  path: 'blog/tags',
  controller: 'tag.js',
  id: 'blog/tags', // the *prefix* each item's default id is built from
})
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

Every page carries `<link rel="alternate" type="application/rss+xml">` in its head, from the
`head-feed` partial, and its href is `{{absUrl 'feed.xml'}}` — absolute, because autodiscovery is
read off-site. It is not a `{{link}}`: `feed.xml` is a file this build _writes_, not a page it
registers, so it has no identity to be asked for. That distinction is the whole of the rule —
`{{link}}` names pages, `{{absUrl}}`/`{{asset}}` name paths of your own.

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

## Linking by identity

Not one view in this site writes a URL. Every internal href that names a page is `{{link}}`:

```hbs
<h3><a href='{{link id}}'>{{title}}</a></h3>
<a class='tag' href='{{link "blog/tags" slug=this}}'>{{this}}</a>
<a href='{{link model.prev}}'>&larr; Newer posts</a>
<a href='{{link "blog"}}'>Back to the journal</a>
```

**What changed.** These were `href="{{url}}"` and `href="/blog/tags/{{slug}}/"`, and the strings
behind them were built in the two controllers — `urlFor` in `controllers/post.js`, `tagUrl` in
`controllers/tag.js`. Both are gone. A controller's job is the record: validate it, name it,
shape it. Deciding what a page's address looks like was never its job — that is decided by
`extensionLess`, by the fan-out's `path` and by the normalised slug, all of which the engine
already knows and a controller can only re-derive. `urlFor` returned `/blog/<slug>/`, which was
right only because this site happens to be `extensionLess`; turn that off and every card in the
site pointed at a 404 that nothing in the build would have noticed.

What the controllers hand over now is _identity_, not address: `summaryCard` carries an `id`
instead of a `url`, and a tag stays the plain name the record wrote, because `{{link 'blog/tags'
slug=name}}` slugs it with the same `toSlug` the tag page was built with.

**Where the valid targets are written down.** The `Id` column of `AIKB/site-map.md` — the
recorded knowledge base, regenerated by `npx kiss-ssg aikb` — is the complete list of what
`{{link}}` will answer to on this site (seven of the fourteen rows, output paths shown relative
to the build folder):

| Output                                   | Id                            |
| ---------------------------------------- | ----------------------------- |
| `index.html`                             | `index`                       |
| `blog/index.html`                        | `blog`                        |
| `blog/page/2/index.html`                 | `blog/page/2`                 |
| `blog/the-cascara-experiment/index.html` | `blog/post/cascara`           |
| `blog/pour-over-at-home/index.html`      | `blog/post/pour-over-at-home` |
| `blog/tags/index.html`                   | `blog/tags`                   |
| `blog/tags/brewing/index.html`           | `blog/tags/brewing`           |

Most pages need nothing to get one: a `.page()` page's default id is its view's route without
the extension (`blog/tags.hbs` → `blog/tags`), and a `.pages()` item's is the registration's
route plus the item's slug. This site sets an id in exactly three places, each for a reason:

- **The two listing pages** (`id: 'blog'`, `id: 'blog/page/2'`) — **required**, because they are
  one view rendered twice. Two pages that arrive at the same _default_ id both withdraw from it,
  and the build says so: `Two pages share the default id "blog/listing" … set an explicit id on
each`. Neither could be linked until they named themselves. `listingId(n)` in `11-blog.js` is
  that name, and the same function supplies `model.prev`/`model.next`, so a page and the link to
  it cannot drift.
- **The tag fan-out** (`id: 'blog/tags'`) — **optional**. A registration's `id` is not an id: it
  is the **prefix** its items' default ids are built from, in place of the view's route. Without
  it the tag pages would be `blog/tag/<slug>` (from `blog/tag.hbs`) while their paths were
  `blog/tags/<slug>`. With it the ids read like the paths.
- **One post's record** (`id: 'blog/post/cascara'`) — the `moved` demonstration, below.

**Three forms of one link.** `{{link 'blog'}}` is root-relative — `/blog/` — which is what a page
on this site wants. `{{link 'blog' absolute=true}}` is `https://asterandoak.example/blog/`, for
an Open Graph tag, a feed, or a site served from a path prefix. `{{link 'blog' canonical=true}}`
is the pretty form `sitemap.xml` and `{{canonical}}` emit. The home page renders all three, so
you can see them rather than take this paragraph's word for it.

**What `{{link}}` will not do.** It only knows _pages_. `feed.xml`, `sitemap.xml` and the
stylesheet are files the build writes, not pages it registers: they have no identity, and they
are named with `{{absUrl 'feed.xml'}}`, a plain `/feed.xml`, or `{{asset 'css/site.css'}}`. Nor
does it reach into content: the cross-links inside the posts' markdown bodies are typed by hand,
because a writer writing prose is not going to type a page id — those are what the broken-link
scan is for, and the section below is about them. And
it is the one helper that **fails the build**: an id no page claims, or a `generate: false`
page's id, stops the page that asked and names both. That is the trade — a hand-written path is
a claim about a host the engine cannot see, so a broken one is only a finding; an id is a claim
about this build's registry, so it can be checked exactly where it is written.

### The rename, and why `moved` needs an explicit id

`models/posts/2026-02-18-the-cascara-experiment.json` carries two things a normal post does not:

```json
"id": "blog/post/cascara",
"aliases": ["/blog/cascara-notes.html"]
```

`aliases` is the recipe for the rename that already happened — it writes
`/blog/cascara-notes.html /blog/the-cascara-experiment/ 301` into `_redirects`, and it is what
makes the old address keep working.

`id` is the recipe for the **next** one. `npx kiss-ssg check` compares this build against
`AIKB/last-build.json` and pairs the two sides **by id**, so it can tell a page that moved from a
page that was deleted:

```
moved without redirect: /blog/the-cascara-experiment/ -> /blog/cascara/ (blog/post/cascara)
```

A default id cannot do that, and the reason is worth reading twice: a fan-out item's default id
is `blog/post/<slug>`, so it **contains the slug**. Rename the slug and the id changes with it;
the old id is simply absent from the new build, the two sides never pair, and the commonest
rename there is gets reported as `removed without redirect:` — a deletion — instead of a move
with the alias to add named in the line. An id that does not contain the slug is stable across
the rename, which is the whole of the trick. It costs one line in one record.

(The same is true in reverse for the tag pages: a tag record is _computed_ from the posts, so it
has nowhere to carry an explicit id, and renaming a tag will always read as a removal. That is
written down in `AIKB/notes/controllers/tag.md` rather than left to be discovered.)

## What `--broken` shows

The default run is clean — 171 internal references, none broken. It is clean the way a site with
`{{link}}` in it is clean: a helper link resolves by construction, so the scan can only ever find
something a person wrote by hand. `--broken` is that hand-written href — one post renders a link
to `/blog/the-kenya-microlot/`, a post that was never published, from a `staleLink` string in its
record:

```
$ npx kiss-ssg check 11-blog.js --summary -- --broken
ok ../public/11-blog (check) — 14 pages, 0 failed, 2 assets, 622ms
  broken link: ../public/11-blog/blog/the-cascara-experiment/index.html -> /blog/the-kenya-microlot/
  ~ ../public/11-blog/blog/the-cascara-experiment/index.html
  = 13 unchanged
```

Two readings of the same edit: the finding says the link goes nowhere, and the diff line says
which page's bytes changed since the folder was recorded.

It had to be hand-written to be findable at all, and that is the point of keeping it. Almost
every other reference on the site is `{{link}}`, `{{asset}}` or `{{absUrl}}` output — the checker
resolves those by construction, and a mistake in an id would have stopped the build long before
the scan ran. The scan is the net for what is left, and this site keeps four of those too: the
cross-links inside the posts' markdown bodies (`[grind size is the dial](/blog/grind-size-is-the-dial/)`
and three more). A helper cannot reach inside prose a writer types, so those are exactly as
breakable as any link on a real site — which is why the scan is not made redundant by the helper,
and why both are here.

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
controller's current hash. Both notes were rewritten when `urlFor` and `tagUrl` left those files
and re-stamped from the check report's `aikb.subjects`, which is the loop this machinery exists
for: the code moved, the check said `note stale:`, the note caught up. So all four note findings are empty, which is what makes the folder
an exemplar rather than a specimen. Change either controller without touching its note and the
next check says `note stale:` and names it.

Example 9's `AIKB/` is the other one to read: it is the minimal case (one subject, one note).
This one is what a folder looks like once a site has more than one thing worth explaining.
