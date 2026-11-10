# Hashed JavaScript and CSS imports: the case, built

Work order `planning/plans/3.0-phase-0/07-js-hash-imports.md`, run 2026-11-10 on branch `wo/07`
at commit `24841c3`. Each statement is marked **measured** (a command was run and its output read
in this session) or **inferred** (reasoned from code or a specification, not run).

## Answer

Yes. With `assets: { hash: true }`, a JavaScript module that imports a sibling module and a
stylesheet that `@import`s a sibling stylesheet are both emitted with their import URLs
unchanged, while the files they point at are renamed. The build exits 0 and `check` reports
`ok`. The page would not work as written. Nothing reports it.

## What was built

- **Fixture** (measured): `C:\Users\court\AppData\Local\Temp\kiss-wo07-fixture`, built from the
  `starter/` shape (a layout, an index page, a `router.js` calling `.scan().generate()`),
  with `assets: { hash: true }` and no other config. It resolves kiss-ssg through a directory
  junction, `node_modules/kiss-ssg`, to the worktree `C:\Code\kiss-ssg\.claude\worktrees\wo07`.
  The CLI reported itself as "kiss-ssg 2.14.0 from node_modules/kiss-ssg, a link to
  C:/Code/kiss-ssg/.claude/worktrees/wo07".
- `src/assets/js/app.js`: `import { hello } from './util.js'` then `hello()`.
- `src/assets/js/util.js`: `export function hello() { document.body.dataset.hello = 'yes' }`.
- `src/assets/css/site.css`: `@import "other.css";` and
  `body { background: url(../img/x.png) no-repeat; }`.
- `src/assets/css/other.css`: one `h1` rule.
- `src/assets/img/x.png`: a copy of `docs/img/icon-180.png`.
- The layout links `/{{asset "css/site.css"}}` and
  `<script type="module" src="/{{asset "js/app.js"}}">`.

`node router.js` exited 0 (measured).

## What was emitted (measured)

```
public/css/other.7fe5c2d1.css
public/css/site.3dbd1094.css
public/img/x.png
public/js/app.d6f96734.js
public/js/util.09de8f7d.js
public/index.html
public/cache-headers.json
```

The page references `/css/site.3dbd1094.css` and `/js/app.d6f96734.js`.

Emitted `public/js/app.d6f96734.js` (minified by default, which is why the whitespace is gone):

```
import{hello}from"./util.js";hello();
```

The import still names `./util.js`. The only emitted module is `util.09de8f7d.js`. A browser
resolves `./util.js` against `/js/app.d6f96734.js` to `/js/util.js`, which is not in the build.

Emitted `public/css/site.3dbd1094.css`:

```
@import "other.css";body{background:url(../img/x.png) no-repeat}
```

- `@import "other.css"` resolves to `/css/other.css`, which is not in the build (only
  `other.7fe5c2d1.css` is). It is broken in the same way as the script import.
- `url(../img/x.png)` resolves to `/img/x.png`, which is emitted. It works, because images are
  never renamed (`HASHABLE` in `lib/asset-manifest.js:11` matches only `.css` and `.js`), and
  the relative step between the stylesheet and the image folder is unchanged.

## What reported it (measured)

`node router.js` printed `Links: 2 internal references, none broken` and an audit with four
findings (`og-image-missing`, `favicon-missing`, `not-found-missing`, `host-unset`). None
concerns the imports.

`node <worktree>/bin/kiss-ssg.js check router.js --summary` exited 0 and printed
`ok ./public (check) - 1 pages, 0 failed, 5 assets` and the same four audit findings. No
finding about an import.

Why (inferred from reading the output and `lib/links.js`: the two references counted are the
`href` and the `src` in the page; the link scan is documented as reading `href` and `src`
attributes of written pages and I did not open the written asset bodies in `lib/links.js`):
the link scan reads page markup, not the bodies of emitted `.js` or `.css` files, so an import
inside an asset is outside what it looks at. I did not search `lib/audit.js` for a rule on
asset bodies beyond a grep for `import`, `@import` and `url(`, which found none.

## Would the page work in a browser

- **Inferred** (module resolution is standard behaviour; I did not drive a browser): no. The
  script loads, then fails to fetch `/js/util.js` (404), and the module graph does not
  evaluate, so `hello()` never runs. The stylesheet loads and applies its own rules, but the
  `@import`ed rules (`other.css`, the purple `h1`) are lost. A failed `@import` does not stop the
  rest of the stylesheet.
- **Measured:** the build folder holds no `js/util.js` and no `css/other.css`.
- **Not measured:** that the host returns 404 and not a fallback page (a host with a catch-all
  rewrite would return HTML with a 200, and a module would then fail on MIME type instead).

## What `TODO.md` claimed

`TODO.md` says "the build can report success with broken modules". Measured: the build reports
success and the modules are broken. The claim holds, for both JavaScript and CSS.

## Options (unchosen)

1. **Rewrite imports.** At the copy, parse each hashable file for static `import ... from '<rel>'`,
   `export ... from '<rel>'`, `import('<rel>')` with a literal, and CSS `@import`, and rewrite
   each to the hashed name. Needs a hash order (a file that imports another is hashed after
   it, so a cycle has no stable answer) and a parser. A dynamic import with a computed
   specifier cannot be rewritten.
2. **Hash only files nothing imports.** Detect files that are an import target and leave them
   under their own name. They then have no cache-busting, and a long-cache header must not be
   written for them (`lib/cache-headers.js` writes one for every hashed file today).
3. **Document the boundary and make the audit warn.** State that a hashed file must be
   self-contained, and add an audit finding when an emitted `.js` or `.css` contains a relative
   import whose target is not an emitted name. The build still succeeds; the audit is advisory
   (see the findings above, which are advisory today).

## Where this work order left a choice open or was wrong

- Step 3 says `url(img/x.png)`. A path with no `../` resolves relative to the stylesheet, so it
  would point at `css/img/x.png`. I used `url(../img/x.png)`, which resolves to a real file in
  the fixture. A `url()` to a file under the stylesheet's own folder, or a root-relative
  `url(/img/x.png)`, were not built.
- The work order does not say whether to test a JavaScript file that is not a module, or a
  default (non-minified) build. Minification was on, as it is by default outside dev. I did not
  run `minify: false`, so whether the import line differs there is not measured (inferred: it
  does not, since renaming does not depend on minification).
- "Hash only files nothing imports" needs a definition of "imports" for CSS (`@import`, `url()`
  of a stylesheet) as well as JavaScript. The work order mentions only JavaScript.
- A `sourceMappingURL` comment and `new URL('./x.js', import.meta.url)` are two more
  relative references that hashing breaks the same way (inferred; not built).
