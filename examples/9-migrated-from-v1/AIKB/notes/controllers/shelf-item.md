---
subject-hash: 8bfa290248f68febbcea3d6c759bcc8b55eaf6dd
---

# shelf-item.js

## What it does

Turns one shelf record — `{ name, origin, note }`, a plain object handed straight to `.pages()`
in the build script — into the page that record gets. It returns three things: `slug`, which
becomes the output filename (`shelf/arch-blend.html`), `title`, which the layout prints in
`<title>`, and `model`, passed back unchanged so the view can read `model.origin` and
`model.note`. The slug comes from `utils.toSlug(model.name)`, the same helper the build script
itself calls — so the name in the data is the only thing that decides the URL.

## Why it is this way

Two registrations use this one controller: the catalogue, and the bench lots that survived the
dedupe. Both fan out into `shelf/`, and both need a record's name to produce the same slug at
every step, or the dedupe in the build script would be comparing different strings from the ones
the fan-out writes. Sharing one controller file is what guarantees that — an inline controller
per registration would be two copies of one rule, and the day they drifted the two fan-outs
would start claiming each other's paths.

It is a controller and not a `slug:` key on the registration because `.pages()` fans out over a
list: there is no single value to write, and every item needs the derivation run against its own
record.

## Gotchas

- **The name is the URL.** Rename a record and its page moves; the old path is not redirected and
  nothing warns. `npx kiss-ssg check` says it plainly — the old path is removed and a new one
  added — which is the point of running it before closing a piece of work.
- **Two records that slug alike fail the build.** v2 refuses two pages claiming one output path
  (it does not silently keep the last one, as v1 did), so the build script deduplicates the bench
  lots against the catalogue's slugs _before_ registering either. That dedupe and this controller
  have to agree on `utils.toSlug`; if this file ever slugs some other way, move the dedupe with it.
- **A name with no Latin letters slugs to a hash** (`p-<8 hex>`), by way of `utils.toSlug`'s
  fallback. That is deliberate — it keeps two such names apart — but it makes an unreadable URL,
  so a record like that wants a slug chosen by hand rather than derived.
- **`model` is returned explicitly.** A controller's return is a patch over the page's options,
  and passing the model straight through keeps this one honest: everything the view reads is
  visible in this file, so nothing about the page depends on what was _not_ written here.
