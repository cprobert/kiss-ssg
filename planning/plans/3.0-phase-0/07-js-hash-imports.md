# 07. Hashed JavaScript imports: build the case

**Model:** Sonnet. **Impact surface:** none. This work order changes no engine code.

## Objective

Find out, by building it, whether `assets.hash: true` breaks a JavaScript file that imports
another JavaScript file, and write down what happens. The operator decides what to do next.

## Paths in scope

- `planning/reviews/<date>-js-hash-imports.md` (new)
- `TODO.md` (the one row, to point at the report)

Out of scope: all of `lib/`, `test/`, `examples/`. The fixture lives in the operating system's
temp folder and is not committed.

## Assumptions

- Hashable files are those ending `.css` or `.js` (`lib/asset-manifest.js:11`). Measured.
- A comment there says kiss "has no bundler to go and rewrite them"
  (`lib/asset-manifest.js:9-10`). Measured. So rewriting is probably not done; nobody has built
  the case.
- `TODO.md` has listed this as High and Open since 2026-09-21. Measured. That file is partly
  stale, so the claim itself is unverified.

## Steps

1. In a temp folder, make a site from `starter/` whose `src/assets/js/app.js` contains
   `import { hello } from './util.js'` and whose page loads it with
   `<script type="module" src="/{{asset "js/app.js"}}">`. Set `assets: { hash: true }`. Install
   the repo as its `kiss-ssg` the way `examples/` resolve it, or run it from inside the repo tree.
   verify: `node router.js` exits 0.
2. Look at the build folder. Record the emitted names of both files and the import line inside
   the emitted `app` file.
   verify: the report quotes them.
3. Repeat for a CSS file that uses `@import "other.css"` and one that uses `url(img/x.png)`.
4. Run `npx kiss-ssg check router.js --summary` on the fixture.
   verify: the report says whether the build, the link scan or the audit noticed anything.
5. Write the report: what was built, what was emitted, whether the page would work in a browser
   and why, and whether any check reported it. Mark each statement measured or inferred. End with
   the options, without choosing: rewrite imports, hash only files nothing imports, or document
   the boundary and have the audit warn.
   verify: `npx prettier --check` on the report.

## Stop and ask

Always. This work order ends with the report. Do not fix anything.

## Fast feedback

Not applicable: there is no test to run.
