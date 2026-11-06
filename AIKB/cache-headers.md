# cache-headers.js

## Responsibility

Cache headers for the files kiss content-hashed: say, in the encoding the site's host reads, that each one can be cached for a year (`public, max-age=31536000, immutable`). Pure functions plus one writer (`writeCacheHeaders`), the shape of `lib/redirects.js`. The module holds no state, knows nothing about `Kiss`, and decides nothing about when it runs: `lib/build-finish.js` `writeHostCacheHeaders` does that.

**Only hashed files, and never HTML.** A hashed file's bytes are its name, so a year is simply true for it. An unhashed file's right lifetime is the owner's decision: a photograph replaced under its old name would stay stale for a year. That is what the fleet's hand-written rules got wrong on two sites (measured, `planning/research/2026-11-04-static-site-performance.md` § Measured). HTML gets no rule on any host, because a page answers at several URLs (`/about`, `/about.html`, `/courses/index.html`) and a rule written for one misses the others. Netlify's own HTML default (`max-age=0, must-revalidate`) is already right.

**The list first, then the encodings.** `cache-headers.json` (`{ version, rules: [{ path, headers }] }`) is written whenever a hashed file exists, whatever the format says, like `redirects.json`. `cacheHeaders.format` then picks the host files, and `config.host` sets it when the site did not (`lib/config.js` `HOSTS`).

## Public interface

- `IMMUTABLE` — the one `Cache-Control` value written.
- `CONSENT_HASH_LENGTH` — `10`, the hex characters in `kiss-consent.<hash>.js` (`lib/consent-client.js`).
- `BLOCK_START` / `BLOCK_END` — the two marker lines around kiss's block in `_headers`.
- `hashedFiles({ manifest, consentClient, images, root })` → the `/`-rooted, sorted paths of every hashed file that is on disk under `root`. The input is `assetManifest.toObject()` filtered to `isHashable(name) && name !== output`, plus the consent client, plus `images`: `{{image}}`'s variants (`img/hero-960.<hash>.avif`), which are content-named whatever `assets.hash` says and stay out of the manifest, so `lib/build-finish.js` hands them over from the image index. A variant whose encode failed is not on disk and is dropped like any other. `writeCacheHeaders` takes the same `images` and passes it through. The Firebase pattern (`FIREBASE_HASHED`) matches kiss's hash shape before `.css`, `.js`, `.avif`, `.webp`, `.jpg` and `.png`, so a variant is `immutable` there too, and an unhashed `photo.deadbeef.jpg` is now a lookalike the build warns about. An entry not on disk under `root` is dropped: that is a copy whose target is outside the build folder, which no host serves from here. A path with whitespace in it is dropped too, because it would write two lines.
- `cacheHeaderRules(files)` → `[{ path, headers: { 'Cache-Control': IMMUTABLE } }]`.
- `renderCacheHeadersJson(rules)` → the list, pretty-printed and newline-terminated.
- `renderHeadersBlock(rules)` → kiss's block for a `_headers` file (Netlify, Cloudflare Pages), between the markers.
- `mergeHeadersFile(existing, block, markers?)` → the site's file with the block appended. A block an earlier build left is replaced, never repeated. `existing` of `null` returns the block alone. `markers` defaults to the cache block's; the security headers pass their own.
- `removeHeadersBlock(existing, markers?)` → the file with kiss's block, and the blank line before it, taken out: the inverse of `mergeHeadersFile`, which uses it.
- `retireHeaders({ root, markers, files, written, outputs })` → takes back what an earlier build wrote and this one did not: the marked block in `_headers` (the file removed if nothing else is left) and each named generated file, unless something claimed it this build (the asset copy, a pipeline step). `writeCacheHeaders` and `writeSecurityHeaders` call it on every run. Under `cleanBuild: false` the folder is kept, so without it a block from a build where the feature was on stays live after it is turned off (Codex adversarial review, 2026-11-06).
- `renderFirebaseCacheHeaders({ consent })` → a fragment to merge into `firebase.json`: `{ headers: [{ regex, headers: [{ key, value }] }] }`, one pattern for kiss's hash shape (`.<8 hex>.css|js`) and one for the consent client.
- `firebaseLookalikes(built, hashed)` → the files in the build the hash pattern matches that kiss did not hash.
- `CACHE_HEADER_FORMATS` — `netlify` and `cloudflare` (both `_headers`), `firebase` (`cache-headers.firebase.json`). The single table of which formats exist; `lib/config.js` derives its accepted names from it.
- `resolveCacheHeaderFormats(format)` → the formats to run: `'none'` dropped, a bare name or function as a list of one, `netlify` and `cloudflare` together writing `_headers` once.
- `writeCacheHeaders({ config, root, manifest, consentClient, outputs })` → `{ status, rules, files, formats, unset, merged, lookalikes, uncovered }`. `status: 'none'` (nothing written) when no file is hashed. `unset` is true when hashed files exist and neither `host` nor `cacheHeaders.format` was set. `uncovered` lists the hosts with no encoding yet (`vercel`). A writer function receives `(rules, { buildDir, config })` and returns `[{ file, contents }]`, resolved under the build folder; an absolute path or one climbing out throws.
- The `CacheHeaderRule` and `CacheHeadersWriteResult` typedefs.

## Depends on

`fs-extra`, `node:path`, `./asset-manifest.js` (`HASH_LENGTH`, `isHashable`), `./utils.js` (`posixPath`).

## Depended on by

- `lib/build-finish.js` `writeHostCacheHeaders`, which `Kiss._writeCacheHeaders()` calls at the top of `complete()`'s settle path, after the consent client and before the packages. It is latched on `_cacheHeadersRun` and reset in `lib/rebuild.js` per build. Its result becomes `report().cacheHeaders`, appended after `consent` (`AIKB/build-report.md`).
- `lib/config.js`: `CACHE_HEADER_FORMATS`, for `CACHE_HEADER_FORMAT_NAMES` and the format check.
- `lib/kiss.js` re-exports `renderCacheHeadersJson`, `renderHeadersBlock` and `renderFirebaseCacheHeaders`, so a custom writer composes an encoding rather than reimplementing one: the redirect renderers' reason (`AIKB/redirects.md`).

## Non-obvious behavior

- **A site's own `_headers` is kept and appended to, a deliberate exception to "kiss never merges".** Sites keep security headers (CSP, `X-Frame-Options`) in `src/assets/_headers`. Overwriting it, the way generated output beats a copied asset everywhere else (`lib/output-registry.js`), would remove them silently. Unlike `firebase.json`, this file is build output rebuilt on every deploy, so appending to it touches no source. The merged file is **not** claimed as generated: it stays the asset copy's, so no collision is reported for a write that lost nothing. The operator's decision, 2026-11-04 (`planning/plans/2026-11-04-kiss-performance.md`).
- **Firebase gets patterns, every other host gets exact paths.** The Firebase fragment is merged into `firebase.json` by hand, once. Exact paths in it would go stale at the next stylesheet edit, because the hash changes. `_headers` is rebuilt on every deploy, so exact paths there never go stale and never match a file they should not.
- **A pattern can match a file kiss did not hash**, such as a vendored `lib.deadbeef.js`. That file would be cached for a year. The writer reports such files as `lookalikes`, and the build **warns** rather than fails: the operator's decision at the 2026-11-04 pulse, "It's an optimisation rather than a critical issue".
- **Not written in dev, nor on a failed build** (`writeHostCacheHeaders`). A watch re-copy renames a stylesheet without settling a build, so a file written once per settle would name the old hash until the next one. A failed build publishes nothing.
- **`'github-pages'` is silent and `'vercel'` warns.** GitHub Pages cannot be configured (it sends `max-age=600` on everything, measured), so the host implies `'none'`: a fact, not a gap. Vercel has a header encoding kiss has not written yet, so the build names it. The difference is one cell in `HOSTS`, `'none'` against `null`.
- **Host behaviour that is not yet measured** and that GUIDE.md therefore does not state: whether `_headers` or `netlify.toml` wins on Netlify when both set `Cache-Control` for a path; whether Firebase applies `regex` header rules, and in what order against `**` globs. Both are measured on deploy previews before the docs say more (`planning/plans/2026-11-04-kiss-performance.md` § Must measure).
