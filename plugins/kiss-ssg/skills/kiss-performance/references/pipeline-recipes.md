# Shipping less CSS and JS: pipeline recipes

kiss already minifies every `.css` and `.js` it copies, outside dev (`assets.minify`, on by default). What it cannot judge for a site is which CSS and JS the site needs, so removing the rest is a `config.assets.pipeline` step. A step runs before the asset copy, so whatever it writes into `src/assets/` is then copied, minified and hashed like any other file. GUIDE.md § An asset pipeline has the step shape: `{ name, run, cwd?, watch?, outputs? }`.

Install the tools as development dependencies of the site:

```bash
npm install -D purgecss esbuild
```

Each recipe was run as written through a kiss build. Measure before and after with `npx kiss-ssg speed`.

## Remove unused CSS from a framework (Bootstrap, Foundation, Bulma)

Keep the framework's full stylesheet **outside** `src/assets/` (here `src/vendor/`), and let PurgeCSS write the trimmed copy into it:

```js
assets: {
  pipeline: [
    {
      name: 'purge bootstrap',
      cwd: 'src/vendor',
      run: 'npx purgecss --css bootstrap.css --content "../pages/**/*.hbs" "../partials/**/*.hbs" "../layouts/**/*.hbs" "../models/**/*.json" "../scripts/**/*.js" --safelist show active in collapsing --output ../assets/css',
    },
  ],
},
```

- **Run it from the stylesheet's folder** (`cwd`). PurgeCSS writes the output under `--output` at the input's relative path, so `--css src/vendor/bootstrap.css --output src/assets/css` would aim for `src/assets/css/src/vendor/bootstrap.css`.
- **The output folder must already exist.** When it does not, PurgeCSS writes nothing and **still exits 0**, so kiss logs the step as `ok`. The page's `{{asset "css/bootstrap.css"}}` then fails the build, which is the check that catches it. Keep `{{asset}}` on that link.
- **Scan everything that writes a class:** views, partials, layouts, the models (a class name in JSON) and your own scripts (a class added with `classList`).
- **Safelist the classes a library adds at run time.** Bootstrap's JavaScript adds `show`, `active`, `in` and `collapsing`, and others for its components (`modal-backdrop`, `fade`, `tooltip`, `popover`). A class missing from the safelist is removed, and the component breaks only when it opens. Open every interactive component in the browser after a purge.
- **Ignore the generated file in git** (`src/assets/css/bootstrap.css`): the source is `src/vendor/bootstrap.css`, and the build writes the trimmed copy.
- **Tailwind already does this.** It scans the content itself, so it needs no PurgeCSS step (GUIDE.md § An asset pipeline, the Tailwind trap).

Measured on one Bootstrap 3 site's two pages: 100 KB down to 16 KB raw, and 13.4 KB down to 3.4 KB after Brotli.

## Bundle and tree-shake the site's own scripts

When the site's scripts `import` each other or a library, bundle them. Each nested import is otherwise fetched only after its parent has loaded, one round trip after another. A bundle keeps only what is imported:

```js
assets: {
  pipeline: [
    {
      name: 'bundle scripts',
      run: 'npx esbuild src/scripts/main.js --bundle --format=esm --outfile=src/assets/js/main.js',
    },
  ],
},
```

```handlebars
<script type='module' src='/{{asset "js/main.js"}}'></script>
```

- **Import a library as an ES module, by name** (`import { debounce } from 'lodash-es'`), so the bundle keeps that function and drops the rest. Measured: one function from a 617 KB library bundled to 3.4 KB, then 1.2 KB minified by kiss and Brotli'd.
- **No `--minify` needed:** kiss minifies the bundle when it copies it.
- **Keep the source outside `src/assets/`** (`src/scripts/`), and ignore the bundle in git.
- **Keep each bundle under about 100 kB**; split a larger one by page (one entry per page type) so no page downloads code it never runs.
- **One or two standalone scripts need no bundler.** A `defer`red file per feature is fine: on HTTP/2 and HTTP/3 a handful of requests costs nothing measurable. Do not concatenate files just to have fewer.

## Replace a library with the platform

Before purging or bundling a library, ask whether the page needs it at all:

- **jQuery** for selectors, classes, events and `fetch`: `document.querySelector`, `classList`, `addEventListener` and `fetch` do the same with no download.
- **Bootstrap's JavaScript** for a collapse, a dropdown or a modal: `<details>`, the `popover` attribute and `<dialog>` (`kiss-front-end` has the order).
- **A carousel or a lightbox library** for a few images: a CSS scroll-snap row, or `<dialog>`.
