# 06. Sitemap escaping and the watch log line

**Model:** Sonnet. **Impact surface:** engine internals (patch).

## Objective

Two one-line hardenings: escape the values written into `sitemap.xml`, and stop the pipeline
logging a whole `watch` command.

## Paths in scope

- `lib/sitemap.js`, `test/unit/sitemap.test.js`, `AIKB/sitemap.md`
- `lib/pipeline.js`, `test/unit/pipeline.test.js`, `AIKB/pipeline.md`
- `lib/utils.js`, `test/unit/utils.test.js`, `lib/feed.js`, `AIKB/utils.md` (only to move one
  function, see step 2)

Out of scope: `lib/package-manifest.js` and every other XML writer, except to report on them.

## Assumptions

- `renderSitemapXml` writes `loc`, `lastmod`, `changefreq` and `priority` with no escaping
  (`lib/sitemap.js:75-88`). Measured. It is safe today only because slugs are restricted; a
  `siteUrl` containing `&` produces invalid XML.
- `lib/feed.js:171` has a private `escapeXml`. Measured.
- `lib/pipeline.js:236` logs `pipeline: watching with "<the whole command>"`, while the module
  elsewhere names the program only because arguments are where a token sits
  (`lib/pipeline.js:176-178`). Measured.

## Steps

1. Add a sitemap test: a `siteUrl` with `&` and a `sitemapLastmod` containing `<` produce
   well-formed XML with `&amp;` and `&lt;`.
   verify: `npx vitest run test/unit/sitemap.test.js` fails. Record the output.
2. Move `escapeXml` from `lib/feed.js` to `lib/utils.js`, exported and unchanged, with its test.
   Import it in both `feed.js` and `sitemap.js`. Do not write a second copy.
   verify: `npx vitest run test/unit/sitemap.test.js test/unit/feed.test.js test/unit/utils.test.js`.
3. Fix the class, not the case: list every other place `lib/` writes XML by string
   concatenation, and say in the session log whether each escapes its values. Do not change them.
   verify: the list is in the session log.
4. Add a pipeline test: a `watch` command carrying an argument that looks like a token is logged
   without that argument.
   verify: `npx vitest run test/unit/pipeline.test.js` fails on it. Record the output.
5. Log the program name the way lines 176-178 do.
   verify: the same command passes.
6. Update the three AIKB docs.
7. verify: `npm run gates`.

## Stop and ask

- Step 3 finds an unescaped XML writer fed by page data.
- Moving `escapeXml` changes any published type in `types/` beyond adding one export.

## Fast feedback

```sh
npx vitest run test/unit/sitemap.test.js test/unit/pipeline.test.js
```
