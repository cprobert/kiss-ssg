# audit.js

## Responsibility

The launch-readiness audit: decide, from the HTML a build wrote, the files in its build folder and the build's own state, whether the site looks finished — a page with no title or description, no `og:image`, an image with no `alt`, a heading outline that skips, no favicon, no 404 page, a local `siteUrl`, a `debug.json` or a source map shipped by accident. Two pure-ish functions and the list of check ids; the module holds no state, knows nothing about `Kiss`, and decides nothing about when it runs.

The findings are **advisory**. They never move `ok`, `failures` or an exit code, and never fail a page. The design copies the broken-link scan (`AIKB/links.md`) in every respect — extracted at write time, decided once in the settle path, latched and reported as an appended key.

## Public interface

- `CHECKS` — the frozen, ordered tuple of check ids: `title-missing`, `title-duplicate`, `description-missing`, `description-duplicate`, `og-image-missing`, `og-image-relative`, `canonical-missing`, `img-alt-missing`, `h1-count`, `heading-skip`, `favicon-missing`, `not-found-missing`, `site-url-local`, `debug-dump`, `stray-file`, `console-log`. **Public vocabulary**: `config.audit.ignore`, the report's `check` field and the summary lines all use these, and `lib/config.js` validates `ignore` against this list, so renaming one is a breaking change. Declared with a const assertion so `CheckId` emits as a union in `types/audit.d.ts`.
- `extractPageFacts(html, outputPath)` → `PageFacts` `{ html, title, description, ogImage, canonical, icon, imgMissingAlt, headings }`. Called by `KissPage.generate()` on the minified bytes it just wrote, beside `extractReferences`, and parked on `KissPage.audit`. `html` is `false` (and every other field empty) unless the path ends `.html`/`.htm` **and** the bytes carry `<html` or `<body`.
- `auditBuild({ pages, buildDir, siteUrl, ignore, ownsFolder, debugWritten })` → `{ checked, ignored, skipped, findings: [{ check, page, detail }] }`. `pages` is `[{ buildTo, facts, canonicalElsewhere, siteUrl }]` for the pages that wrote bytes; `buildDir` is the folder they were written into; `ownsFolder` is `config.cleanBuild !== false`. Findings are sorted by check (in `CHECKS` order), then page (`null` first), then detail.
- The `CheckId`, `PageFacts`, `AuditFinding`, `AuditResult` and `AuditPage` typedefs.

## Depends on

`node:fs` (`readdirSync`, `readFileSync`, `existsSync` — the folder walk and the two root-file tests) and `./links.js` (`attribute`, `decodeEntities`, so a tag's attributes are matched and decoded exactly as the link scan does). No HTML parser, no logger, no config.

## Depended on by

`lib/kiss-page.js` (`extractPageFacts`, at write time, on `KissPage.audit`), `lib/kiss.js` (`auditBuild`, from `Kiss._runAudit()` in `complete()`'s settle path directly after `_checkLinks()`, latched on `_audit` and handed to `buildReport` as the report's last key, `audit` — `AIKB/build-report.md`) and `lib/config.js` (`CHECKS`, to refuse an unknown id in `audit.ignore`).

## Non-obvious behavior

- **Extraction and decision are split across time, for the link scan's reason.** Under `kiss-ssg check` the staging folder is gone before anything could read a page back, so the facts are taken at write time from the same minified bytes as `KissPage.links`; `auditBuild` never reads HTML. What it does read from disk is the rest of the build folder (the walk), while `Kiss` still has it where it was written — `_writeRoot`, which is the staging folder under `'atomic'` and under check.
- **The pre-strip is wider than `links.js`'s, because a count check cannot afford a stray match.** Comments, `<script>`, `<style>`, `<template>` and `<svg>` elements are removed whole before matching. An extra reference costs the link scan one lookup; an extra `<h1>` inside a script string, or an icon's `<title>` read as the page title, is a finding invented out of nothing.
- **The extension decides first whether a file is a page.** An `ext: 'json'` page whose bytes happen to contain `<body` is data. A file extension is a statement about processing (`CLAUDE.md`), and the audit keeps that promise rather than sniffing.
- **`alt=""` is present, and so is a bare `alt`.** `imgMissingAlt` lists only images with no `alt` attribute at all; an empty alt is the correct markup for a decorative image.
- **A duplicate is compared among originals only.** A page whose `canonical` option names another URL (`canonicalElsewhere`) is declaring itself a copy, so it is left out of `title-duplicate` and `description-duplicate` — and every other check still runs on it.
- **`favicon-missing` and `not-found-missing` need at least one audited page.** A feed-only or JSON-only instance has no HTML to be missing them from. `not-found-missing` says so in its `detail` when `404/index.html` exists: `extensionLess` puts a `404` view there, and hosts serve `/404.html`.
- **`site-url-local` flags loopback, the reserved `.localhost`/`.local`/`.test`/`.invalid` TLDs and the Netlify/Vercel preview hostnames — not `.example`.** That is the documentation domain every shipped example uses, and flagging it would put a finding on every example build. A page whose own `siteUrl` differs from the instance's and is local is reported with that page.
- **`debug-dump` is decided from state, not disk.** `viewStats()` does not await its `debug.json` write, so a disk check would race it; `Kiss` sets `_debugWritten` when the write starts and passes it in.
- **Folder ownership.** `not-found-missing`, `stray-file` and `console-log` read the whole build folder. Under `cleanBuild: false` that folder holds whatever earlier builds and sibling instances left (example 7's archive index is the proof), so those three are **not run** and are listed in `skipped` — never silently absent. An ignored check is not also listed as skipped.
- **Walked paths are joined with `/`, never `path.join`, and `buildDir` is used as given.** `reportedPath` in `lib/build-report.js` maps a finding out of staging by matching the staging prefix followed by `/`; a Windows `\` from `path.join`, or a rewritten root, would leak `kiss-staging` into the report.
- **`console-log` skips files a site's author did not write**: `*.min.js` and anything under a `vendor/` or `node_modules/` segment. The count is of the literal `console.log(`, so it is a hint, not a parse.
- **An unreadable walked file is empty.** A file removed mid-walk or locked on Windows has nothing to report; the audit is advisory and never throws for it.
