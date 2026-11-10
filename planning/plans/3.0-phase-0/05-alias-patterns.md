# 05. Alias patterns

**Model:** Sonnet. **Impact surface:** public behaviour (patch with an Upgrading note).

## Objective

An alias is one old path. Refuse an alias that a host would read as a pattern, so a fetched
record cannot write a site-wide redirect rule.

## Decision already made (Fable, 2026-11-10)

Refuse the alias wherever it came from, not only from fetched records: `normaliseAlias` cannot
tell the source, and `GUIDE.md` documents aliases as old URL paths, not patterns.

## Paths in scope

- `lib/redirects.js`
- `test/unit/redirects.test.js`
- `AIKB/redirects.md`
- `GUIDE.md` (§ Redirects, one sentence)

Out of scope: the format writers, `lib/page-registry.js`, `lib/config.js`.

## Assumptions

- `normaliseAlias` drops an alias containing whitespace and returns `null`; it accepts `*` and
  `:` (`lib/redirects.js:58-73`). Measured.
- The alias is written unchanged into `_redirects` and the Firebase fragment. Measured by the
  security review (`lib/redirects.js:141`, `196-200`).
- No example and no `GUIDE.md` passage uses a wildcard alias. Measured by grep on `GUIDE.md`
  only. Step 1 checks the rest.
- Netlify reads `*` and `:name` as patterns and Firebase reads `*` and `**` as globs. Inferred
  from memory of their documentation.

## Steps

1. Search `examples/`, `starter/`, `src/`, `test/` and `plugins/` for an alias containing `*` or
   a path segment that starts with `:`.
   verify: list what you found in the session log. If anything other than a test of this very
   behaviour uses one, stop and ask.
2. Add tests: `/*`, `/**`, `/old/*`, `/:x` and `/blog/:slug` each return `null`; `/old-page`,
   `/a:b` (a colon inside a segment) and `/caf%C3%A9` are kept.
   verify: `npx vitest run test/unit/redirects.test.js -t normaliseAlias` fails on the first
   group. Record the output.
3. Implement in `normaliseAlias`. Find where a dropped alias is reported today; if a dropped
   alias is silent, add one warning that names the alias and the page, because a silently dropped
   redirect is the kind of quiet wrong result this project exists to prevent.
   verify: the same command passes.
4. Update `AIKB/redirects.md` and the `GUIDE.md` sentence.
5. verify: `npm run gates`.

## Stop and ask

- Step 1 finds a real use of a pattern alias.
- Reporting the dropped alias needs a change outside `lib/redirects.js`.

## Fast feedback

```sh
npx vitest run test/unit/redirects.test.js
```
