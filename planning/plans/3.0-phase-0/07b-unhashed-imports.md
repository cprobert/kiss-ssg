# 07b. Imported assets keep their names

**Model:** Sonnet. **Depends on:** 07. **Impact surface:** public behaviour (patch with an
Upgrading note).

## Objective

Under `assets.hash`, a `.js` or `.css` file that another hashed asset imports by path keeps its
plain name, so the import still resolves. Today the build renames it and the import 404s, and
nothing reports it (`planning/reviews/2026-11-10-js-hash-imports.md`).

## Decision already made (the operator, 2026-11-10)

Of the report's three options the operator chose **hash only files nothing imports**: no import
rewriting, no new config key. A file another asset imports is copied under its own name. It is
not hashed, so `lib/cache-headers.js` gives it no immutable header, and a changed `util.js` is
fetched fresh even while the `app.<hash>.js` that imports it stays cached.

## Paths in scope

- `lib/assets.js` (the hashing loop, around line 302, and a helper beside it)
- `lib/asset-manifest.js` (only if the import reader belongs there)
- `test/unit/assets.test.js`, `test/unit/asset-manifest.test.js`
- `AIKB/assets.md`, `AIKB/asset-manifest.md`
- `GUIDE.md` (the `assets.hash` passage, two or three sentences)
- `TODO.md` (the hashed-imports row)
- `types/` (only as `npm run types` regenerates it)

Out of scope: `lib/cache-headers.js`, `lib/css-purge.js`, `lib/asset-minify.js`, `llms.txt`,
rewriting any file's contents.

## Assumptions

- Only `.css` and `.js` are hashable (`lib/asset-manifest.js:11`). Measured.
- `copyAssets` collects every copied file into `claimed`, then hashes each in one loop, after
  minifying it (`lib/assets.js:282-312`). Measured. So every importer's bytes can be read before
  any file is renamed.
- Minified output keeps the specifiers: the 07 fixture's minified app file is
  `import{hello}from"./util.js";hello();`. Measured, 2026-11-10.
- A relative specifier (`./`, `../`) and a root-relative one (`/js/util.js`) are the only kinds a
  static host can serve; a bare specifier (`lit`) needs an import map, which kiss does not write.
  Inferred.

## Steps

1. Write the tests first, in `test/unit/assets.test.js`, with `hash: true`:
   - `js/app.js` imports `./util.js`: `app` is hashed, `js/util.js` is emitted unrenamed, and the
     manifest maps `js/util.js` to itself.
   - The same for `export … from`, a dynamic `import('./x.js')`, and a root-relative `/js/x.js`.
   - `css/site.css` with `@import "other.css"` and `@import url("other.css")`: `other.css` is
     unrenamed.
   - A chain: `a` imports `b`, `b` imports `c`; `b` and `c` both keep their names.
   - A bare specifier (`import 'lit'`) and an import of a file that does not exist change nothing.
   - A file nothing imports is still hashed (today's behaviour).
     verify: `npx vitest run test/unit/assets.test.js -t import` fails on the new tests. Record
     the output.
2. Implement: before the hashing loop, read each claimed hashable file's emitted bytes, collect the
   relative and root-relative specifiers of `import … from`, `export … from`, `import(…)` and
   `@import` (string and `url()` forms), resolve each against the importer's URL path, and keep
   the set of claimed names they hit. In the loop, skip hashing for a name in that set. Log one
   `info` line per build naming the files left unhashed and why. A regular expression over the
   bytes is enough; do not add a parser dependency.
   verify: the same command passes, and the whole `test/unit/assets.test.js` passes.
3. Re-run the 07 fixture (`C:\Users\court\AppData\Local\Temp\kiss-wo07-fixture`, which resolves
   kiss-ssg through a junction you point at your worktree): `node router.js`, then read the
   build folder.
   verify: `public/js/util.js` and `public/css/other.css` exist, unrenamed; `app` and `site` are
   still hashed; quote the info line.
4. Update `AIKB/assets.md`, `AIKB/asset-manifest.md` (the comment at `lib/asset-manifest.js:7-10`
   too, if it becomes untrue) and the `GUIDE.md` passage. Mark the `TODO.md` row "Implemented
   and tested". Run `npm run types` if a JSDoc-typed export changed.
5. verify: `npx vitest run test/unit/assets.test.js test/unit/asset-manifest.test.js test/integration`
   and `npm run typecheck`.

## Stop and ask

- The import reader needs the content of a file that is not in `claimed` (a page, an image).
- An existing test asserts that an imported file is hashed.
- The change touches `lib/cache-headers.js` or the purge.
- A specifier form not listed above turns up in `examples/` or `starter/`.

## Fast feedback

```sh
npx vitest run test/unit/assets.test.js -t import
```
