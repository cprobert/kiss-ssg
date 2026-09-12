# llms.js

## Responsibility

Builds the [llmstxt.org](https://llmstxt.org) index — `llms.txt` — from the page stack and writes it to the build folder. The AI-facing sibling of `sitemap.js`: same registry, same titles, same URL derivation, a different file for a different reader.

## Public interface

- `resolveText(value)` → `Promise<string>`. A `summary`/`notes` option is either the text itself or a path (relative to `process.cwd()`) to a file holding it: if the string names an existing **file** its contents are returned, otherwise the string is. A `.md` file is used as-is — `llms.txt` is markdown. Only a single-line string of at most 512 characters is offered to `fs` at all; anything longer or multi-line is prose by construction. A non-string is `''`.
- `oneLine(value)`, `entryTitle(options)` and `topSegment(pagePath)` — the three derivations `lib/feed.js` shares rather than copies: whitespace collapsed to one line (`''` for a non-string); a page's `title`, or its slug title-cased when the title is the `Index` placeholder; and the sanitised first segment of a page's `path` (`''` for a root page), which is both this file's grouping key and the feed's `section` filter.
- `sectionNameFor(segment, sections = {})` → the display name for one top-level path segment: `sections[segment]` if mapped, else the segment title-cased with `-`/`_` read as spaces. The empty segment is the root group: `sections.root`, else `'Pages'`.
- `buildLlmsEntries(stack, { siteUrl, buildDir, sections })` → `{ title, url, description, section }[]` in registration order. Skips an entry whose `page.options` has `ignoreLlms`, `ignoreSitemap`, or `generate === false`. `url` is `toAbsoluteUrl(siteUrl, toCanonicalPath(buildTo.slice(buildDir.length)))` — the identical join `buildSitemapEntries` makes. `section` is `options.llmsSection` when set, else `sectionNameFor` over the first segment of the page's (sanitised) `path`.
- `groupLlmsEntries(entries, rootSection)` → `{ name, entries }[]`, sections in first-seen order with the root section hoisted to the front when it is present.
- `renderLlmsTxt({ title, summary, groups, notes })` → the file's text: `# title`, a `> ` blockquote summary, one `## Section` per group with a `- [title](url): description` line per page (`: description` omitted when there is none), an optional trailing `## Notes`. One trailing newline, a blank line under every heading.
- `async writeLlms(stack, { config, logger, options, overwrite = true })` → `Promise<{ status, text }>`. `status` is `'no-site-url'`, `'no-title'`, `'no-summary'` (nothing written), `'skipped'` (`overwrite: false` and a file exists), or `'written'`.

## Depends on

`fs-extra`; `./utils.js` (`sanitizePath`, `toAbsoluteUrl`, `toCanonicalPath`, `toTitleCase`).

## Depended on by

`lib/kiss.js` (`Kiss.llms()`); `lib/feed.js`, for `oneLine`, `entryTitle` and `topSegment` — an RSS `<title>` and an `llms.txt` link text for one page are the same string by construction, not by coincidence.

## Non-obvious behavior

- **The URL derivation is copied from `sitemap.js` on purpose, not shared by accident.** Both call the same two `utils` functions over the same `buildTo`, which is what makes an `llms.txt` entry, a `<loc>` and a page's own `{{canonical}}` one string — a directory index keeps its trailing slash in all three. `test/integration/llms.test.js` asserts the three agree under `extensionLess` both ways; changing the join here without changing it there breaks that.
- **`ignoreSitemap` excludes a page from `llms.txt` too.** The AI index is a curated subset of the site the sitemap describes, never a superset: a page the author has already said should not be crawled has no business being recommended to an answer engine. `ignoreLlms` is the one-way opt-out — out of `llms.txt`, still in the sitemap.
- **An untitled page arrives here titled `Index`.** `KissPage`'s constructor computes its default title from the _placeholder_ slug (`index`) before the real slug is set, so `prepare()` fills every untitled page's `title` with `'Index'`. That value is treated as unset and the page's own slug is title-cased instead (`puppy-classes` → `Puppy Classes`). It costs nothing for a page that really is the index — its slug title-cases to the same word — and it costs a page genuinely titled "Index" its title, which is the cheaper of the two mistakes.
- Titles and descriptions are collapsed to one line (`\s+` → one space) before rendering: a description is what follows `: ` on the entry's own line, and a newline in it would silently end the list item. `[`/`]`/`\` in a title are backslash-escaped and `(`/`)` in a URL are percent-encoded, so a bracketed title or a parenthesised path stays a valid markdown link.
- `writeLlms` deliberately does **not** catch its own write error (`fs.outputFile` can reject) — it propagates to `Kiss.llms()`'s `.catch()`, which logs it and does not invoke the callback. Same contract as `writeSitemap`.
- Missing `siteUrl`, `title` or `summary` are reported as a status, never thrown: the rest of the build is still what the author asked for, minus this file. `Kiss.llms()` fires the callback for `'written'` and `'skipped'` only.
- `overwrite: false` only has an observable effect with `cleanBuild: false` too — the default `cleanBuild: true` empties the build folder in the `Kiss` constructor, so there is never an existing `llms.txt` left to skip.
