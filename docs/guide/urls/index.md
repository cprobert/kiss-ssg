# URLs and redirects

Telling kiss how your host serves URLs, trailing slashes included, and keeping old addresses alive with aliases and redirect files.

## Host URL policy

Two of the things kiss emits are decided by your **host**, not by the generator. Both are config keys, and both default to what kiss has always done, so an existing site does not move.

### The trailing slash on a directory index

`links: { trailingSlash: true }` by default. Measured live on 2026-09-16 — not inferred:

| Host | `/courses/` (a directory index) | `/about` (a file page) |
| --- | --- | --- |
| **Netlify** — verified on `www.a1k9training.co.uk` | **200**; bare `/courses` 301s here | **200**; `/about/` 301s here |
| **Firebase Hosting** with `cleanUrls: true` + `trailingSlash: false` — verified on `learna.ac.uk` | 301 → `/courses`; the **bare** form is 200 | **200**; `/about/` 301s here |
| **GitHub Pages** — file pages measured on a live deployment (relayed to this branch by a clean-room session, not measured here) | _unverified for a real directory index_ | **200**; `/about.html` is also 200, `/about/` **404s**, and nothing redirects |
| Cloudflare Pages, nginx | _unverified — each has a trailing-slash mode; measure your own deployment_ | _unverified_ |

The two verified hosts **agree on file pages and contradict each other on directory indexes**, so no single default can be right for both. `true` matches Netlify and is what kiss has always emitted; `false` matches that Firebase configuration:

```js
new Kiss({ siteUrl: 'https://example.com', links: { trailingSlash: false } })
// {{canonical}} on courses/index.html → https://example.com/courses
// its <loc>, its llms.txt entry, its feed <link> and {{link "courses/index"}} → the same
```

The setting moves **every URL kiss derives for a page, together** — `{{canonical}}`, `{{link}}`, `<loc>`, `llms.txt`, the feed and an alias's target. That is the point: a page advertised at `/courses` but linked as `/courses/` ships a redirect hop on every internal click. It deliberately does **not** move:

-   `{{isActive}}` — page identity is not a host policy, and a nav highlight must not depend on where you deploy. `/about`, `/about/` and `about/index.html` stay one key either way.
-   a trailing slash **you** wrote — `{{absUrl '/courses/'}}` is still `https://example.com/courses/`.
-   file extensions, and the site root, which is `https://example.com/` under both.

One consequence worth knowing: on Firebase with `cleanUrls` + `trailingSlash: false`, `about.html` and `about/index.html` are both served at `/about` — so `extensionLess` stops being a URL decision there and becomes purely an output-path one. On Netlify the two shapes stay distinct.

If you are not sure what your host does, measure it rather than guess: deploy once, then `curl -sI https://yoursite/some-section/` and `curl -sI https://yoursite/some-section` and see which returns 200 and which returns 301.

### The redirect file format

See [Redirects](#redirects) below. `_redirects` is a Netlify and Cloudflare Pages file; Firebase and Vercel read their own, so kiss writes no host file until you name one. `redirects: { format: … }` says which, and `redirects.json` carries the rules as data whatever you pick.

## Redirects

A page's `aliases` are the old URL paths it now answers. There is no method to call; an alias is a property of a page, not a file you ask for.

An alias is a fact about your site — "this page used to answer `/old`" — and that fact is portable. Every alias is a **permanent** redirect: `redirects.json` records `status: 301` on each rule so a consumer has the code in the data rather than hardcoding it, but there is no way to ask for a `302`, a `308` or a `410`, and no forced or wildcard rules. The field marks the place such a thing would live, not a setting. The file it goes into is one host's encoding of it, and hosts disagree. So every settled build with an alias writes `redirects.json` — the host-neutral list — **always**, and then whatever host encodings `config.redirects.format` names beside it.

**`format` is unset by default, and takes a list.** kiss does not guess where you deploy: with no `format` you get the IR and no host file. Because every version before this one always wrote `_redirects`, a build that has aliases and no `format` logs one warning telling you what to set — an explicit `'none'` or `[]` is a decision and stays silent.

```js
new Kiss({ redirects: { format: ['netlify', 'firebase'] } })
// writes redirects.json, _redirects AND redirects.firebase.json
```

A list because a site can legitimately deploy to more than one host — Netlify previews and Firebase production is a real shape, and choosing one at build time would mean building twice. A bare string or a single function is a list of one. Duplicates collapse, order is kept, and a typo anywhere in the list throws at `new Kiss()` rather than being quietly dropped.

| `redirects.format` | Writes | For |
| --- | --- | --- |
| `'netlify'` | `_redirects` | [Netlify (opens in a new tab)](https://docs.netlify.com/routing/redirects/), [Cloudflare Pages (opens in a new tab)](https://developers.cloudflare.com/pages/configuration/redirects/) |
| `'firebase'` | `redirects.firebase.json` — a fragment to merge | Firebase Hosting, which ignores `_redirects` entirely |
| `'vercel'` | `redirects.vercel.json` — a fragment to merge | Vercel |
| `'htaccess'` | `redirects.htaccess` — a fragment to `Include` | Apache |
| `'none'` / `[]` | nothing but the IR | a site that owns its own redirects |
| _unset_ (the default) | nothing but the IR, plus one notice | a site that has not said where it deploys |
| a function | whatever it returns | anything else — nginx, Apache, a CDN API |

The Firebase, Vercel and Apache formats emit **a fragment**, not a `firebase.json`, a `vercel.json` or a `.htaccess`. Your real config file holds hosting targets, headers, rewrites and often years of hand-maintained redirect history; kiss will not rewrite it. Merge the fragment on your own terms — for Apache, by `Include`\-ing `redirects.htaccess` or concatenating it. (That fragment uses mod\_alias `Redirect`, not `RewriteRule`: a rewrite's left-hand side is a regex, so an alias containing a `.` would match more paths than the one it names.)

A custom writer is `(rules, { buildDir, config }) => [{ file, contents }]` — or one entry, or nothing at all. **It does not have to start from scratch**: every built-in encoder is a named export, so a writer can compose one rather than reimplement it.

```js
import Kiss, { renderRedirects, renderFirebaseRedirects } from 'kiss-ssg'

new Kiss({
  redirects: {
    format: (rules) => [
      // Netlify's exact bytes, somewhere else, plus a rule of your own
      {
        file: 'edge/_redirects',
        contents:
          renderRedirects(rules) + '/vendor/* https://cdn.example/:splat 200\n',
      },
      {
        file: 'hosting/redirects.json',
        contents: renderFirebaseRedirects(rules),
      },
    ],
  },
})
```

`renderRedirects`, `renderRedirectsJson`, `renderFirebaseRedirects`, `renderVercelRedirects` and `renderHtaccessRedirects` are all `(rules) => string` over the same list your writer is handed. Paths are relative to the build folder and one that escapes it is refused. A writer that throws **fails the build**, exactly as a failed write does: a redirect writer that dies quietly would be the silent no-op this whole block exists to end. An unknown format name throws at `new Kiss()` rather than writing nothing.

```js
new Kiss({
  redirects: {
    format: (rules) => ({
      file: 'redirects.conf',
      contents: rules
        .map((r) => `rewrite ^${r.from}$ ${r.to} permanent;`)
        .join('\n'),
    }),
  },
})
```

You do not need a writer to do this, though: `report().redirects.rules` is the same `[{ from, to }]` list, so a deploy script can read `kiss.report()` after `.complete()` and write any format it likes without kiss knowing the host exists.

```js
kiss
  .page({ view: 'about.hbs', aliases: ['/about-us', '/team.html'] })
  .pages({
    view: 'blog/post.hbs',
    model: 'posts', // a renamed post's own JSON carries `"aliases": ["/news/2024/thing.html"]`
    path: 'blog',
  })
  .generate()
```

writes `public/_redirects` (and `public/redirects.json` beside it):

```
/about-us /about 301
/news/2024/thing.html /blog/thing 301
/team.html /about 301
```

The target is the page's canonical path — `/`, `/courses/`, `/about` — the same string that page's own `{{canonical}}` renders and its `<loc>` in `sitemap.xml` carries, so a redirect can never point at a URL your site does not serve. Sources are written as you gave them, with a leading `/` added and any `?query` or `#fragment` dropped; a trailing slash is kept, because `/old/` and `/old` are two different paths to a host and you are the one who knows which was linked. Lines are sorted, so two identical builds write identical bytes and a committed `_redirects` does not churn.

On a `.pages()` fan-out the aliases belong to **each record**, never to the registration: `.pages({ aliases: [...] })` is not broadcast over the fan-out, because one source path redirecting to N different pages is not a redirect. Put them in the model item. A page with `generate: false` contributes none — there would be nothing at the other end.

A site with no aliases writes **no file at all**, not an empty one and not an empty IR, so a hand-written `_redirects` you keep in `src/assets/` is copied into the build and left alone. An alias is one path: one with a space or a line break inside it is dropped, because the file is space-separated columns and one rule per line. And if the file cannot be written the build fails, the way a page that cannot be written fails it — a site published without its redirects is a site whose old URLs 404.

**Three findings ride along**, all advisory and all in `report().redirects` (`{ file, aliases, removed, collisions, moved, rules, json, formats, files }` — `formats` is the list that ran, `file` is the first host file, `files` is the complete and authoritative list, or `null` when there is nothing to say — no alias anywhere in the site, no removal and no move):

-   `removed` — pages the **last record** wrote that this build does not, minus any an alias now covers: a page that vanished with no redirect. It is the one finding that needs a recorded knowledge base (see [Recording the knowledge base](../checking/#recording-the-knowledge-base)); without `AIKB/last-build.json` it is empty, and an unreadable one is treated the same way. Paths are compared build-relative on both sides, so a record made from one working directory and a check run from another still agree, and are reported as the URL a browser asked for (`/old.html`, `/old/`) — the same string to put in `aliases`; the canonical spelling (`/old`) covers too.
-   `moved` — a page the **last record** and this build both have, paired by its `id` rather than by its path, whose output path changed and whose old path no alias covers: `{ id, from, to }` per page, sorted by `from`. It needs a record too, and an `id` on **both** sides, so it follows a page whose identity is stable — a `.page()` page whose `path`, `slug` or `ext` moved, or any page (a fan-out record included) carrying an explicit `id` — and not one whose identity moved with it: a `.pages()` item's default id embeds its slug (`blog/post/<slug>`), so renaming a post's slug changes the id as well and the event reads as a `removed` instead. A move suppresses the matching `removed`, so one rename is one finding.
-   `collisions` — aliases a live page already answers, by its canonical path (`/about`) or by the file itself (`/about.html`), and any source two pages both claim. On both hosts a non-forced rule whose source is a real file is **silently ignored** — the line does nothing at all, with no error anywhere — which is why this is worth saying out loud.

Under `--summary` they print as `removed without redirect: <path>`, `moved without redirect: <from> -> <to> (<id>)` and `alias collides with a page: <path>`; the build log's `notice` for a move carries the fix with it (`add "<from>" to that page's aliases`). None of them changes `ok`, and none changes the exit code.
