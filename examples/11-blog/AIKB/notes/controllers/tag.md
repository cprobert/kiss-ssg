---
subject-hash: 10729118b061dae9fc9adb09eb3f57979c57423d
---

# tag.js

## What it does

Owns everything about a tag. `tagSlug` and `tagUrl` derive a tag's address; `tagRecords` folds
the posts into one record per tag — `{ tag, slug, count, posts }`, sorted by slug — which is the
array the second `.pages()` fan-out is registered over; and the default export turns one of
those records into a page, deriving nothing except the title and description that the layout and
llms.txt read.

## Why it is this way

**A tag is not a record anybody writes.** There is no models folder for tags and there should
not be: a tag exists because some post mentions it, so the list of tags is a _derivation_ of the
posts, and the moment it is stored separately the two can disagree. `tagRecords` is that
derivation, computed in the build script before anything is registered.

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

- **The slug is derived twice and must agree both times.** `tagUrl` renders the link a post and
  a listing point at; `tagSlug` decides the folder the fan-out writes. They are the same
  function here on purpose — split them and the site links to tag pages it does not build, which
  is exactly the finding `npx kiss-ssg check` reports as `broken link:`.
- **A tag with no Latin letters slugs to a hash** (`p-<8 hex>`), by way of the `toSlug` fallback
  in `utils`. It keeps two such tags apart, but it makes an unreadable URL — a tag like that
  wants a slug chosen by hand.
- **Renaming a tag moves every page under it and nothing redirects.** Unlike a post, a tag
  record has nowhere to carry `aliases`, because the record is computed rather than stored. If
  tag URLs ever need to survive a rename, the alias has to be added to the computed record in
  `tagRecords` — this is the place to do it.
- **`count` is the number of posts, not the number of pages.** Tag pages are not paginated. Four
  tags over six posts never needed it; a tag that grows past a screenful will, and that is the
  moment to lift the pagination loop out of `11-blog.js` into something both listings share.
