# sitemap.js

## Responsibility

Builds `sitemap.xml` entries from the page stack and writes the file to the build folder.

## Public interface

- `buildSitemapEntries(stack, { siteUrl, buildDir, now = new Date().toISOString() })` → array of `{ loc, lastmod, priority, changefreq }`. Skips entries where `entry.page.options.ignoreSitemap` is truthy. `loc` = `siteUrl` joined to the page's URL path (derived from `buildTo`) by `toAbsoluteUrl` from `utils.js`. `lastmod` defaults to `now` (one shared timestamp per call unless a page sets `sitemapLastmod`); `priority` defaults to `'1.00'`; `changefreq` is omitted from the XML unless `sitemapChangefreq` is set.
- `renderSitemapXml(urls)` → the `sitemap.xml` string (standard `<urlset>`/`<url>` schema; `<changefreq>` only emitted when `url.changefreq` is set).
- `async writeSitemap(stack, { config, logger, overwrite = true })` → `Promise<{ status, urls }>`. `status` is `'no-site-url'` (no `config.siteUrl`, nothing written), `'skipped'` (`overwrite: false` and a `sitemap.xml` already exists), or `'written'` (file written, `urls` populated).

## Depends on

`fs-extra`; `./utils.js` (`toCanonicalPath`, `toAbsoluteUrl`).

## Depended on by

`lib/kiss.js` (`Kiss.sitemap()`).

## Non-obvious behavior

- URL derivation from `buildTo`: strip the leading `buildDir` (`entry.buildTo.slice(buildDir.length)`), then `toCanonicalPath` (the file extension dropped, the `index` segment kept) and `toAbsoluteUrl` (joined to `siteUrl`, a trailing `index` segment becoming a trailing `/`, an empty path giving the site root with one trailing slash). **Those two functions are shared with the `canonical` helper on purpose** — a page's `<loc>` and its own `<link rel="canonical">` are built by the same code, so they cannot drift apart (`AIKB/handlebars-helpers.md`). Changing the derivation here changes both; an integration test asserts they stay equal (it builds a site with a section index under `extensionLess` on and off). The one deliberate exception is a page that overrides `config.siteUrl` for itself: its canonical URL follows the override, its `<loc>` keeps the site's own domain.
- **A directory index gets a trailing slash in its `<loc>`** — `out/courses/index.html` is `https://site/courses/`, not `https://site/courses`. A static host (Netlify, GitHub Pages, nginx) serves the directory at the slashed URL and answers the bare one with a 301, so the old shape listed a redirect for every section index; the sitemap now lists the URL that returns 200. Under `extensionLess: true` every page but the home page builds to `<path>/<slug>/index.html` and so ends in `/` too — again the URL the host actually serves. This is why the derivation goes through `toCanonicalPath` rather than `toURLKey`: the identity key drops the `index` segment outright, which is exactly what produced the redirecting URL.
- `overwrite: false` only has any observable effect when `config.cleanBuild: false` too — the default `cleanBuild: true` already empties the whole build directory (any prior `sitemap.xml` included) in the `Kiss` constructor, before `.sitemap()` ever runs, so there is nothing left to "skip" in the default configuration.
- `writeSitemap` deliberately does **not** catch its own write errors (`fs.outputFile` can reject) — they propagate up to `Kiss.sitemap()`'s `.catch()`, which logs the error and does **not** invoke the callback. This matches v1 semantics: a sitemap write failure is silent-to-the-caller beyond the logged error.
- `status` values and what `Kiss.sitemap()` does with each: `'no-site-url'` returns early _without_ invoking the callback (`if (status === 'no-site-url') return`); `'skipped'` and `'written'` both fall through to invoke the callback with `urls` (`null` for `'skipped'`, the array for `'written'`).
