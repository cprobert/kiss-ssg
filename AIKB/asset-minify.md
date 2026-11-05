# asset-minify.js

## Responsibility

Minify a stylesheet or script the asset copy wrote, in place, before it is hashed. A production build then ships its copied `.css` and `.js` the way it already ships its HTML. The minifiers are the ones the page minifier already loads (`html-minifier-terser` → `terser` and `clean-css`), promoted to direct dependencies so this module can import them. Pure helpers plus one file rewrite. It knows nothing about the manifest, hashing, dev mode or config: `lib/assets.js` decides when to call it.

## Public interface

- `shouldMinify(relative)` → `true` for a `.css`, `.js` or `.mjs` that is not `*.min.*`.
- `minifyText(relative, text)` → the minified text. CSS goes through `clean-css` at level 1, and its errors throw. JS goes through `terser` with `compress`, `mangle` and no comments, as a classic script unless the file is `.mjs`. A `.js` that does not parse as a classic script is tried again as a module, so `import`, `export` and top-level `await` survive. Throws when the file cannot be parsed either way.
- `minifyFile(file, relative)` → `{ ok: true, before, after }` or `{ ok: false, error }`. Rewrites the file only when the result is smaller. **Never throws**: a file the minifier cannot read is left exactly as it was.

## Depends on

`fs-extra`, `node:path`, `terser`, `clean-css`.

## Depended on by

- `lib/assets.js` `recordEmitted`, in the loop over claimed outputs, just before the hash is taken. It runs when `config.assets.minify !== false`, outside dev, when the winning source is not Sass (already `compressed`), and when `shouldMinify` agrees. A failure becomes one `warn` naming the file, the copy carries on, and the build does not fail.
- `test/integration/examples.test.js` (example 12) compares the built stylesheet with `minifyText` of its source.

## Non-obvious behavior

- **A clean-css warning keeps the original.** clean-css 5 does not understand native CSS nesting: it dropped a nested `.child { … }` and a nested `@media`, and hoisted `&:hover` out of its parent, reporting seven warnings and no error, while this module read only the errors (Codex at the close, 2026-11-05, reproduced here). `minifyText` now throws on any warning, and `minifyFile` leaves the file as written and says why. The fleet's own stylesheets gave none (a1k9training, pro-plumbing, k9-solutions), so they are minified as before.
- **The served bytes no longer match an author's `integrity` hash** once minified. `lib/integrity.js` turns that into a build failure (`AIKB/integrity.md`).
- **Before the hash, never after.** The hash is the served bytes', so a minified file gets a new name exactly when its minified bytes change. Minifying after hashing would serve bytes the name does not describe.
- **On by default, because it is cheap and never worse.** Measured on the fleet (2026-11-04, `planning/research/2026-11-04-static-site-performance.md` § Measured — CSS and JS): after Brotli, an unminified file was about 17% smaller once minified, and an already-minified one about 1–2%. A result no smaller than the input is discarded, so a tiny file with a licence banner is never grown.
- **A failure never fails the build.** A minifier rejecting a file is either the file's bug, which the browser may tolerate, or the minifier's, which kiss should not turn into a broken deploy. The original is served and the warning names it, with the two ways out: `assets: { minify: false }`, or naming the file `*.min.*`.
- **clean-css changes text, not meaning.** Measured on example 12, it removes empty rules (`.x{}`), writes `background:none` as `background:0 0`, and sorts a selector list. A test asserting copied CSS byte for byte compares against `minifyText` of the source, or sets `minify: false`, as `test/integration/packages.test.js` does where it counts reads.
- **Pipeline outputs are not minified here.** A step's `outputs` are written straight into the build folder, never by the copy. A step that writes into the assets folder is copied, and minified, like any other file. Tailwind's own `--minify` is the usual choice there.
- **Removing unused code is not this module's job.** It needs the site's judgement (a safelist for classes added at run time), so it is a pipeline recipe in `kiss-performance`, not an engine default.
