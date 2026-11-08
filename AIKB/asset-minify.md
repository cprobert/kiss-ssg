# asset-minify.js

## Responsibility

Minify a stylesheet or script the asset copy wrote, in place, before it is hashed. A production build then ships its copied `.css` and `.js` the way it already ships its HTML. The minifiers are the ones the page minifier already loads (`html-minifier-terser` → `terser` and `clean-css`), promoted to direct dependencies so this module can import them. Pure helpers plus one file rewrite. It knows nothing about the manifest, hashing, dev mode or config: `lib/assets.js` decides when to call it.

## Public interface

- `shouldMinify(relative)` → `true` for a `.css`, `.js` or `.mjs` that is not `*.min.*`.
- `compactCss(text)` → the stylesheet with its formatting removed (whitespace between nodes, and comments between rules and declarations but `/*!` ones; a comment inside a selector, value or at-rule params stays), through PostCSS; throws when PostCSS cannot parse it. No space is added after an at-rule's name when its params open with `(`, so `@media(x)` never grows.
- `minifyText(relative, text)` → the minified text. CSS goes through `clean-css` at level 1; on any clean-css error or warning, `compactCss` instead, and only when both fail does it throw. JS goes through `terser` with `compress`, `mangle` and no comments, as a classic script unless the file is `.mjs`. A `.js` that does not parse as a classic script is tried again as a module, so `import`, `export` and top-level `await` survive. Throws when the file cannot be parsed either way.
- `minifyFile(file, relative)` → `{ ok: true, before, after }` or `{ ok: false, error }`. Rewrites the file only when the result is smaller. **Never throws**: a file the minifier cannot read is left exactly as it was.

## Depends on

`fs-extra`, `node:path`, `terser`, `clean-css`, `postcss` (already a dependency, for the purge).

## Depended on by

- `lib/assets.js` `recordEmitted`, in the loop over claimed outputs, just before the hash is taken. It runs when `config.assets.minify !== false`, outside dev, when the winning source is not Sass (already `compressed`), and when `shouldMinify` agrees. A failure becomes one `warn` naming the file, the copy carries on, and the build does not fail.
- `test/integration/examples.test.js` (example 12) compares the built stylesheet with `minifyText` of its source.

## Non-obvious behavior

- **A stylesheet clean-css cannot read is compacted, never handed its output.** clean-css 5 does not understand native CSS nesting: it dropped a nested `.child { … }` and a nested `@media`, and hoisted `&:hover` out of its parent, reporting seven warnings and no error, while this module read only the errors (Codex at the close, 2026-11-05, reproduced here). So an error or a warning means its output is discarded. Until 2026-11-08 the file was then kept as written. The clean room showed the cost: Tailwind v4 nests, so a Tailwind sheet built without `--minify` shipped with every space, and so did its purged copy (12,072 bytes raw, 10,613 purged, against 9,825 for Tailwind's own `--minify`). Now `compactCss` takes those: PostCSS reads nesting, and only its formatting raws are cleared (whitespace between nodes, and every comment node but a `/*!` one). The last statement at-rule of a file loses its semicolon (`@layer a, b` at the end), which the CSS Syntax end-of-file rule allows; checked in Chromium only (review at the close, 2026-11-08). No selector, at-rule parameter or value is touched, and the purged sheet's declarations compared equal after it. Measured: 12,072 → 9,666 bytes unpurged, and 10,613 → 8,492 purged. The purged sheet as written and compacted gave 0 computed-style differences in Chromium (3 pages, 375 and 1440 wide, 4 states, 600 elements). Only a sheet PostCSS cannot parse either is left as written, with the reason. The fleet's own stylesheets gave clean-css no warning (a1k9training, pro-plumbing, k9-solutions), so they are minified as before.
- **The served bytes no longer match an author's `integrity` hash** once minified. `lib/integrity.js` turns that into a build failure (`AIKB/integrity.md`).
- **Before the hash, never after.** The hash is the served bytes', so a minified file gets a new name exactly when its minified bytes change. Minifying after hashing would serve bytes the name does not describe.
- **On by default, because it is cheap and never worse.** Measured on the fleet (2026-11-04, `planning/research/2026-11-04-static-site-performance.md` § Measured — CSS and JS): after Brotli, an unminified file was about 17% smaller once minified, and an already-minified one about 1–2%. A result no smaller than the input is discarded, so a tiny file with a licence banner is never grown.
- **A failure never fails the build.** A minifier rejecting a file is either the file's bug, which the browser may tolerate, or the minifier's, which kiss should not turn into a broken deploy. The original is served and the warning names it, with the two ways out: `assets: { minify: false }`, or naming the file `*.min.*`.
- **clean-css changes text, not meaning.** Measured on example 12, it removes empty rules (`.x{}`), writes `background:none` as `background:0 0`, and sorts a selector list. A test asserting copied CSS byte for byte compares against `minifyText` of the source, or sets `minify: false`, as `test/integration/packages.test.js` does where it counts reads.
- **Pipeline outputs are not minified here.** A step's `outputs` are written straight into the build folder, never by the copy. A step that writes into the assets folder is copied, and minified, like any other file. Tailwind's own `--minify` is the usual choice there.
- **Removing unused code is not this module's job.** It needs the site's judgement (a safelist for classes added at run time), so it is a pipeline recipe in `kiss-performance`, not an engine default.
