---
subject-hash: bb32f83791071d7b9156878b143c83635d0df09e
---

# post.js

## What it does

Turns one post record — a JSON file in the posts models folder — into the page that post gets.
It validates the record against `REQUIRED_FIELDS` and throws if a field is missing, derives the
slug from the record's own `slug` (never from the filename), and returns `title`, `description`
and `date` **on the page** plus a `model` with the post's own fields and a printable date label.

It is also the module the build script reads the folder through: `loadPosts` returns the records
newest first and `summaryCard` reduces one to the shape the listing, the tag pages and the home
page all render through the `post-card` partial. What is left in here after that is two
derivations and no URLs: `idFor` is the single derivation of a post's **identity**, and
`dateLabel` the single derivation of how a date is printed.

## Why it is this way

**No URL is derived here at all.** This file used to export `urlFor`, `/blog/<slug>/`, and bake
its result into every card and into the post's own model. It does not any more. A template asks
for an address by identity — `{{link id}}` in `post-card.hbs`, `{{link 'blog/tags' slug=this}}`
for a tag — and the engine answers from the registry, so `extensionLess`, the fan-out's `path`
and the normalised slug are read in exactly one place instead of being re-derived by hand in a
second. The old line was correct, and it was correct by coincidence: change `extensionLess` to
`false` and every one of those hrefs became a 404 that nothing in the build would have noticed.

**`idFor` mirrors the rule the engine applies, and a mistake in it is loud.** A `.pages()` item's
default id is `<view route>/<slug>` — `blog/post/<slug>` for this fan-out — and a record's own
`id` wins outright; `idFor` is that precedence, written once so a card and the page it points at
cannot disagree. It is still a second copy of a rule, which is the honest cost of carrying an id
on a card. The difference from `urlFor` is what happens when the copy is wrong: an id no page
claims **fails the build**, naming the id and the view that asked, because an id is a claim about
this build's registry and is checkable exactly at render. A wrong URL only ever shipped.

**The page options, not the model, carry the metadata.** `.feed()` orders and titles its items
from `title`, `description` and `date`; llms.txt and sitemap.xml read the first two; the
shared layout puts them in `<title>` and the meta description. A post dated only inside its
model would still reach the feed — `.feed()` reads the page option first and the model second —
but nothing else would see it, and the page would be titled after its slug.

**One reader, two consumers.** The fan-out resolves the folder itself through `model: 'posts'`;
the listing needs the same records _before_ any page is registered, so the build script reads
them too. Both readings go through this file, which is what stops the pagination from being
computed over a different set of records than the one the fan-out builds.

**The record's `slug` is the URL and the filename is not.** The files are dated so that a folder
listing sorts itself; a date in a URL is a decision that cannot be taken back.

**A throw fails one item.** `.pages()` catches per record, so a malformed post costs its own
page and the other five still build — and `complete()` names it `blog/post.hbs [item N: <slug>]`.
Example 8 is the exemplar for what that failure looks like when it is left in.

## Gotchas

- **The slug is the URL, and renaming a post moves it.** The one post that has been renamed
  carries `aliases` in its record, which is what writes the `301` into `_redirects`; a rename
  without one is a silent 404 for every inbound link. `npx kiss-ssg check` reports it as
  `removed without redirect:` — but only once the site has been recorded, so the baseline exists
  to compare against.
- **That same post carries an explicit `id: 'blog/post/cascara'`, and that is deliberate.** A
  default id embeds the slug, so a slug rename changes the identity as well as the path, the two
  builds do not pair, and the check reports a deletion rather than a move. An id that does not
  contain the slug survives the rename, which is what lets the finding be `moved without
redirect: <from> -> <to> (<id>)` with the alias to add named in it.
- **`aliases` belongs to the record, never to the `.pages()` registration.** One old path
  redirecting to six new pages is not a redirect, so the engine promotes it from the model and
  deletes the registration's own. `id` follows exactly the same rule — a registration's `id` is
  only the _prefix_ its items' default ids are built from. Being an ordinary page option `aliases`
  also reaches the template, which is how the post page prints "formerly published at".
- **`dateLabel` formats from the UTC parts by hand rather than with
  `toLocaleDateString`.** The locale and time zone of the machine running the build would
  otherwise reach the bytes of the page, and a build whose output is not byte-stable cannot be
  diffed against the recorded one.
- **`summaryCard` hands the tags on as the record wrote them.** They used to be
  `{ name, url }` pairs built here; now they are the plain strings, and the partial turns one
  into a link with `{{link 'blog/tags' slug=this}}`. The `slug=` sugar runs the same `toSlug`
  that `tag.js` slugs the tag page with, so the two cannot point at different addresses — and if
  they ever did, the build would stop rather than ship the mismatch.
