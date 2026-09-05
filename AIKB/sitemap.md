# sitemap.js

## Responsibility

Builds `sitemap.xml` entries from the page stack and writes the file to the build folder.

## Public interface

- `buildSitemapEntries(stack, { siteUrl, buildDir, now = new Date().toISOString() })` → array of `{ loc, lastmod, priority, changefreq }`. Skips entries where `entry.page.options.ignoreSitemap` is truthy. `loc` = `siteUrl` (trailing slash stripped) + the page's URL path (derived from `buildTo`). `lastmod` defaults to `now` (one shared timestamp per call unless a page sets `sitemapLastmod`); `priority` defaults to `'1.00'`; `changefreq` is omitted from the XML unless `sitemapChangefreq` is set.
- `renderSitemapXml(urls)` → the `sitemap.xml` string (standard `<urlset>`/`<url>` schema; `<changefreq>` only emitted when `url.changefreq` is set).
- `async writeSitemap(stack, { config, logger, overwrite = true })` → `Promise<{ status, urls }>`. `status` is `'no-site-url'` (no `config.siteUrl`, nothing written), `'skipped'` (`overwrite: false` and a `sitemap.xml` already exists), or `'written'` (file written, `urls` populated).

## Depends on

`fs-extra`.

## Depended on by

`lib/kiss.js` (`Kiss.sitemap()`).

## Non-obvious behavior

- URL derivation from `buildTo`: strip the leading `buildDir` (`entry.buildTo.slice(buildDir.length)`), strip the file extension, strip a trailing `/index`, and fall back to `'/'` if that leaves an empty string.
- `overwrite: false` only has any observable effect when `config.cleanBuild: false` too — the default `cleanBuild: true` already empties the whole build directory (any prior `sitemap.xml` included) in the `Kiss` constructor, before `.sitemap()` ever runs, so there is nothing left to "skip" in the default configuration.
- `writeSitemap` deliberately does **not** catch its own write errors (`fs.outputFile` can reject) — they propagate up to `Kiss.sitemap()`'s `.catch()`, which logs the error and does **not** invoke the callback. This matches v1 semantics: a sitemap write failure is silent-to-the-caller beyond the logged error.
- `status` values and what `Kiss.sitemap()` does with each: `'no-site-url'` returns early _without_ invoking the callback (`if (status === 'no-site-url') return`); `'skipped'` and `'written'` both fall through to invoke the callback with `urls` (`null` for `'skipped'`, the array for `'written'`).
