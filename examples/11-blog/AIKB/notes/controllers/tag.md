---
subject-hash: 7abc178112f330517c48c1a6977647162e6c0f81
---

# tag.js

## What it does

Owns everything about a tag. `tagSlug` derives the slug a tag's page is written at; `tagRecords`
folds the posts into one record per tag — `{ tag, slug, count, posts }`, sorted by slug — which
is the array the second `.pages()` fan-out is registered over; and the default export turns one
of those records into a page, deriving nothing except the title and description that the layout
and llms.txt read.

## Why it is this way

**A tag is not a record anybody writes.** There is no models folder for tags and there should
not be: a tag exists because some post mentions it, so the list of tags is a _derivation_ of the
posts, and the moment it is stored separately the two can disagree. `tagRecords` is that
derivation, computed in the build script before anything is registered.

**`tagUrl` is gone, and `tagSlug` is what is left.** This file used to export
`/blog/tags/<slug>/` as a string and hand it to every card and every post. Now a template names a
tag page by identity — `{{link 'blog/tags' slug=name}}` — and the helper's `slug=` sugar runs
`toSlug` over the tag's own name, which is the same function `tagSlug` calls. So one derivation
still stands on both sides of the link, but only the _slug_ half of it: the address around the
slug belongs to the engine, which is the half this file kept getting to decide and should not
have. The fan-out is registered with `id: 'blog/tags'`, so a registration's id is used as the
**prefix** its items' default ids are built from and the tag pages are `blog/tags/<slug>` —
the same shape as the path they are served at.

**It is a controller file rather than an inline function**, unlike the pagination loop in
`11-blog.js`. Two reasons: the tag pages are a fan-out, so the derivation has to run per record
rather than once; and a controller file is a _subject_ of this knowledge base, which is what
gives this note somewhere to live. An inline controller has no file to attach a note to, and so
can never be explained here.

**The records are sorted and the posts inside them are not.** Sorting by slug makes the
registration order the same on every machine, so the sitemap, the feed and llms.txt do not
churn between two builds of the same folder. The posts inside each record are left in the order
they arrived — newest first, because `loadPosts` in `post.js` sorted them that way.

## Gotchas

- **`tagRecords` reads plain tag names, not objects.** `summaryCard` used to hand it
  `{ name, url }` pairs and it grouped on `tag.name`; it now groups on the string itself. A card
  whose `tags` went back to objects would key the map on `[object Object]` and build one tag page
  for the lot.
- **The slug is still derived twice and must still agree both times.** `tagSlug` decides the
  folder the fan-out writes; the `slug=` sugar in every template decides the id it is asked for.
  They are the same `toSlug` on purpose. Split them and the build now **stops** — `link: no page
with id "blog/tags/<x>"`, naming the view that asked — where the old `tagUrl` would have
  rendered a link to a page that was never built and left `npx kiss-ssg check` to find it.
- **A tag with no Latin letters slugs to a hash** (`p-<8 hex>`), by way of the `toSlug` fallback
  in `utils`. It keeps two such tags apart, but it makes an unreadable URL — a tag like that
  wants a slug chosen by hand.
- **Renaming a tag moves every page under it and nothing redirects.** Unlike a post, a tag
  record has nowhere to carry `aliases` or an explicit `id`, because the record is computed
  rather than stored. So a tag rename is a `removed without redirect:`, never a `moved without
redirect:` — the identity moves with the name. If tag URLs ever need to survive a rename, both
  the alias and a stable `id` have to be added to the computed record in `tagRecords`; this is
  the place to do it.
- **`count` is the number of posts, not the number of pages.** Tag pages are not paginated. Four
  tags over six posts never needed it; a tag that grows past a screenful will, and that is the
  moment to lift the pagination loop out of `11-blog.js` into something both listings share —
  and to give those pages explicit ids, the way `listingId` does for the journal.
