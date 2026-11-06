# security-headers.js

## Responsibility

A light, opt-in set of security headers, in the encoding the site's host reads: `Strict-Transport-Security` (`max-age` only: without `includeSubDomains` or `preload`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` turning off geolocation, camera and microphone. Pure functions plus one writer (`writeSecurityHeaders`), the shape of `lib/cache-headers.js`, whose files it writes into.

**Light on purpose.** A static site's attack surface is small, and the operator weighed protection against day-to-day upkeep (`planning/plans/2026-11-05-headers.md`, amendment of 2026-11-05). These four are set once and never touched again. A Content-Security-Policy, a framing header and `Cross-Origin-Opener-Policy` are left out: a CSP blocks every widget an owner adds later until the policy changes, framing breaks Moodle showing a learning package, and COOP can break pop-up payment and sign-in windows. The `kiss-security` skill covers them as choices a site makes. `X-XSS-Protection` is never sent. The values and their sources are `planning/specs/2026-10-30-privacy-and-security-research.md`, second pass.

**Off by default.** `config.securityHeaders` is a boolean, `false` unless the site sets `true`: a header changes what a browser allows on a site that already works, so turning one on is the site's decision, not a convention kiss applies.

## Public interface

- `SECURITY_HEADERS` — the four headers and their values, in the order written.
- `SECURITY_BLOCK` — `{ start, end }`, the marker lines around kiss's block in `_headers`.
- `siteHeaderNames(file)` → the header names a `_headers` file sets for any path, lower-cased, ignoring every `# kiss-ssg:` block.
- `securityHeaders(siteNames)` → `{ headers, skipped }`: the baseline less what the site already sets.
- `renderSecurityBlock(headers)` → kiss's `_headers` block: one `/*` rule between the markers.
- `renderFirebaseSecurityHeaders(headers)` → `{ headers: [{ source: '**', headers: [{ key, value }] }] }`, a fragment to merge into `firebase.json`.
- `writeSecurityHeaders({ config, root, outputs })` → `{ status, headers, skipped, files, formats, unset, uncovered }`. `status: 'none'` and nothing written when `securityHeaders` is off.
- The `SecurityHeadersWriteResult` typedef.

## Depends on

`fs-extra`, `node:path`, and `./cache-headers.js` for `mergeHeadersFile`, which takes a block's markers so the two blocks share one merge.

## Depended on by

`lib/build-finish.js` `writeHostCacheHeaders`, which runs it straight after the cache-header write, in the same latched run (`_cacheHeadersRun`, reset in `lib/rebuild.js`), so a rebuild resets both together. A write failure is pushed onto `_failures` as `<security-headers>` and fails the build. `lib/config.js` declares and checks the key.

## Non-obvious behavior

- **It follows `config.host`, not `cacheHeaders.format`.** The formats are the host names (`netlify` and `cloudflare` both mean `_headers`, written once; `firebase` the fragment). A site that turned its cache headers off with `cacheHeaders: { format: 'none' }` still gets its security headers. `vercel` is reported as `uncovered`; `github-pages` cannot set headers and writes nothing beyond the list.
- **It runs after the cache headers and merges into whatever `_headers` is there** — the site's copied file, the cache block, or both — replacing only its own block. It claims the file in the output registry only when it created it: a file the cache writer or the asset copy made stays theirs, so no collision is reported for a merge that lost nothing. The cache writer, for its part, only merges into a file the asset copy made; so the order is load-bearing — run the other way, a fresh cache write would replace the security block.
- **The site's own headers win, for any path, in `_headers` only.** A header the site's `_headers` sets anywhere — `/*` or a narrower path such as `/private/*` — is left out of kiss's `/*` block: the host combines matching rules, so kiss's value would join the site's narrower one and could override it (Codex review, 2026-11-06). Two values of one header are worse than either. The Firebase fragment and `security-headers.json` always carry the full baseline, because Firebase never reads `_headers`: suppressing a header there because `_headers` set it would leave a Firebase deploy without it. Lines inside any `# kiss-ssg:` block are ignored, so a block an earlier build left (under `cleanBuild: false`) is not mistaken for the site's.
- **`security-headers.json` is written whenever the feature is on**, always with the full baseline, even when every header was left to the site (no `_headers` block is then written).
- **Turned off, it takes back what it wrote.** Every run ends with `retireHeaders` (`lib/cache-headers.js`): under `cleanBuild: false` an earlier build's security block and files would otherwise stay live, with no warning. A block is also taken out when the host no longer reads `_headers`, or the site now sets all four itself; the Firebase fragment goes when `firebase` is no longer a host.
- **Firebase replaces HSTS on its own `*.web.app` subdomains**; only a custom domain serves the fragment's value. The build says so whenever it writes the fragment.
