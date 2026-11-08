# css-audit.js

## Responsibility

`kiss-ssg css`: a reproducible, browser-free audit of how a built site partitions its CSS. For each same-origin stylesheet the pages link: its bytes, its Brotli size, how many pages link it, and the share PurgeCSS could remove against the pages that link it. Then the distinct inline `<style>` blocks, the third-party stylesheets, and four advisory findings. Every decision is a pure function here; `auditCss` is the walk and the reads, and `runCss` is the whole command for `bin/kiss-ssg.js` to print.

## Public interface

- `CSS_HELP` — the command's help text.
- `parseCssArgs(argv)` → `{ target, out, help, error }`. One target; `--out <file>`; anything else starting with `-` is an error.
- `resolveCssTarget(target, { cwd, isDirectory, exists })` → `{ folder }` or `{ error }` (a file, or a path that does not exist).
- `extractStyles(html)` → `{ links, inline }`: the raw `href` of every `<link>` whose `rel` tokens include `stylesheet` (entities decoded, a link with no `href` skipped), and the raw text of every `<style>` that carries no `data-kiss-` attribute.
- `resolveHref(href, page)` → `{ kind: 'local', path }` (build-relative, query and hash dropped, percent-decoded), `{ kind: 'third-party', url }` (`http(s):` or `//`), or `{ kind: 'skip' }` (any other scheme).
- `normaliseCss(css)` (whitespace collapsed, trimmed), `hashText(text)` (16 hex digits of SHA-256), `brotliSize(bytes)` (quality 11), `removableShare(before, after)` (0 to 1, three places).
- `styleDirective(policy)` → the directive governing a `<style>` element, or `null`; `inlineStyleBlockers(headersText)` → the distinct blocking directives in a `_headers` file, sorted.
- `findDuplicateRules(sheets, { limit })` → `{ total, listed, errors }`. `DUPLICATE_LIMIT` is 50.
- `buildFindings({ pages, stylesheets, inline, duplicates, blockers })` → the findings, sorted by check then detail.
- `formatCssAudit(audit)` — the stdout text.
- `auditCss(root, { purge })` → the `CssAudit` record, `{ version: 1, pages, stylesheets, thirdParty, inline, findings }` — what `--out` writes.
- `runCss(argv, { cwd, purge })` → `{ code, out, err }`, the whole command. `purge` is injectable for tests (default `purgeCss`). `auditCss` makes one `purgeReads()` and passes it to every purge as `reads`, so a page linked by several stylesheets is read once (`AIKB/css-purge.md`). The "Removable" share therefore comes from the same purge a build runs, exact markup classes included (issue #78: it read 29% on a site whose real saving was 11%).
- `PAGE_SAMPLE` (3, the page paths an inline entry or a finding names) and `QUOTE_LENGTH` (60, the characters of a block a finding quotes).

## Depends on

`node:crypto`, `node:fs`, `node:path`, `node:zlib`; `postcss` (a direct dependency, the version PurgeCSS already brings) for the rule comparison; `lib/css-purge.js` (`purgeCss`) for the removable share; `lib/links.js` (`decodeEntities`) for attribute values.

## Depended on by

`bin/kiss-ssg.js` (`kiss-ssg css`), which imports it inside its own branch so no other command loads PostCSS.

## Non-obvious behavior

- **One left-to-right pass reads the page.** A single regex alternation of comment, `<script>`, `<template>`, `<style>` and `<link>` consumes the page in order, so a `<style>` or `<link>` inside a comment, a script string or a template is never taken for one, and a `<style>`'s text runs to its own closing tag whatever it contains. A `<link>` inside `<noscript>` is counted: it is usually the fallback for a deferred load of the same sheet.
- **kiss's own `<style>` is never reported.** Any `<style>` carrying an attribute that starts `data-kiss-` (today `data-kiss-consent-style`, `lib/handlebars-helpers.js` `consentHead`) is left out of the inline blocks, their findings and the CSP finding.
- **An href resolves the way a browser resolves it,** with `new URL(href, <a base>/<page>)`: a relative href against the page's own folder, `..` clamped at the root, the query and hash dropped. A local stylesheet is keyed by that path, so `/css/a.css`, `../css/a.css` and `a.css?v=2` from the right pages are one sheet.
- **The removable share is per stylesheet, against the pages that link it** plus every `.js`/`.mjs` in the build, with an empty safelist: what the page that loads it never uses. It is measured on the Brotli size, before and after. A stylesheet PurgeCSS cannot parse gets `error` and no share; a link to a file the build lacks is `missing: true`, reported and not fatal.
- **Two rules are one rule** when their selector list, their declarations in order and their enclosing at-rules (and, under CSS nesting, rules) match after normalising whitespace. Declaration values and at-rule params also drop the whitespace beside `, : ( )`, so a minified sheet and a formatted one compare equal; selectors keep it, because `.a :hover` and `.a:hover` differ. A rule written twice in one sheet is not a duplicate across sheets, and an empty rule is ignored. The context shown is the first sheet's, in path order.
- **The CSP check reads `_headers` simply:** every `Content-Security-Policy:` line under any path, without matching the path to the pages. The directive that governs a `<style>` is `style-src-elem`, else `style-src`, else `default-src` (CSP Level 3's fallback), and it blocks when it has no `'unsafe-inline'`. A policy that allows particular blocks by hash or nonce is still reported as blocking: the hashes are not checked against the blocks. Only the build root's `_headers` is read (not `firebase.json`).
- **Stable output.** Every list is sorted by code-unit order, never the locale's: stylesheets by path, third-party by URL, inline blocks by pages, then bytes (largest first), then hash, findings by check then detail. Two runs over the same folder write identical bytes.
- **Exit codes.** 0 when the audit ran, whatever it found; 2 on a usage error or a target that is not a folder; 1 when `--out` could not be written or the audit threw.
- **Tests.** `test/unit/css-audit.test.js` covers each decision, and `auditCss` with a fake purge; `test/integration/css-audit.test.js` drives the bin over a build folder with the real PurgeCSS and asserts each finding and the JSON.

## Types

`CssArgs`, `DuplicateRule`, `StylesheetEntry`, `InlineEntry`, `Finding`, `CssAudit` (JSDoc typedefs in the module).
