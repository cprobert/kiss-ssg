---
subject-hash: 4d36508cabe497bb29d4b1a6b7414d9f88736c86
---

# post.js

## What it does

Turns one post record — a JSON file in the posts models folder — into the page that post gets.
It validates the record against `REQUIRED_FIELDS` and throws if a field is missing, derives the
slug from the record's own `slug` (never from the filename), and returns `title`, `description`
and `date` **on the page** plus a `model` with the post's own URL, a printable date label and
its tags already turned into links.

It is also the module the build script reads the folder through: `loadPosts` returns the records
newest first and `summaryCard` reduces one to the shape the listing, the tag pages and the home
page all render through the `post-card` partial. `urlFor` is the single derivation of a post's
URL, and `dateLabel` the single derivation of how a date is printed.

## Why it is this way

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
- **`aliases` belongs to the record, never to the `.pages()` registration.** One old path
  redirecting to six new pages is not a redirect, so the engine promotes it from the model and
  deletes the registration's own. Being an ordinary page option it also reaches the template,
  which is how the post page prints "formerly published at".
- **`dateLabel` formats from the UTC parts by hand rather than with
  `toLocaleDateString`.** The locale and time zone of the machine running the build would
  otherwise reach the bytes of the page, and a build whose output is not byte-stable cannot be
  diffed against the recorded one.
- **`summaryCard` and the post page must agree about tags.** Both map the record's tag names
  through `tagUrl` in `tag.js`; if one stopped, the listing and the post would link the same tag
  to two different addresses and only one of them would exist.
