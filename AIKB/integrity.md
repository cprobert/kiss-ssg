# integrity

## Responsibility

Decide which of a build's own `<script src>` and `<link href>` references, written with an `integrity` attribute, no longer match the file the build wrote. kiss changes the bytes of a site's CSS and JS after the author took their hash: the copy minifies them (`assets.minify`, on by default) and `assets.purge` rewrites a stylesheet. The browser then refuses the file and the page breaks, while the build passed (Codex at the close of `feat/review-groups-and-performance`, 2026-11-05). This module decides; `lib/build-finish.js` `checkPageIntegrity` reads the pages and the files and makes each mismatch a build failure.

## Public interface

- `parseIntegrity(value)` → `[{ algo, digest }]`: the `sha256`, `sha384` and `sha512` tokens of an `integrity` value, an optional `?options` suffix dropped, any other algorithm skipped.
- `matchesIntegrity(bytes, value)` → `boolean|null`. Checked as a browser checks it: only the tokens of the **strongest** algorithm named count, and any one of them may match (trailing `=` padding ignored). `null` when no token is usable, which a browser treats as no integrity at all.
- `checkIntegrity({ pages, buildDir, siteUrl, extensionLess, trailingSlash, read })` → `[{ page, ref }]`. `pages` is `[{ buildTo, html }]`; `read(file)` returns a file's bytes or `null`. Each `<script>`'s `src` and `<link>`'s `href` with an `integrity` attribute is classified and resolved with `lib/links.js` (`classifyReference`, `resolveTarget`, the same rules as the link scan), and a local file whose bytes do not match is returned.

## Depends on

`node:crypto`, `node:path`, `lib/links.js` (`attribute`, `decodeEntities`, `classifyReference`, `resolveTarget`).

## Depended on by

`lib/build-finish.js` `checkPageIntegrity`, called by `Kiss._checkIntegrity()` in the settle after the cache headers and before the packages: every byte the pages load is final by then (minified on the copy, purged and encoded earlier in the settle), and a failing build packs nothing. Each mismatch is a `_failures` entry `<integrity>` whose message names the reference, the page and the three ways out (`*.min.js`/`*.min.css`, `assets.minify: false`, or the hash of the written file).

## Non-obvious behavior

- **Only references the build holds are judged.** A file on another origin, a reference that resolves to nothing (the link scan reports that), or an `integrity` with no usable token is skipped, so the check cannot add a second finding for one cause.
- **Dev never checks**, because it neither minifies nor purges; nor does a build that has already failed.
- **Only real elements are scanned.** Comments, and the text inside `script`, `style`, `textarea`, `title` and `noscript`, are removed first (the opening tag is kept), so tag-shaped text a browser never loads cannot fail the build. **Digests compare as bytes**, so the URL-safe base64 spelling a browser accepts matches too. Both came from Codex's review of this module's first version (2026-11-05).
- **The strongest algorithm decides.** A matching `sha256` beside a wrong `sha512` fails, as it does in a browser.
- **The check reads the pages back from disk** (the written bytes, not a render in memory), the same source the link scan and the audit read.
