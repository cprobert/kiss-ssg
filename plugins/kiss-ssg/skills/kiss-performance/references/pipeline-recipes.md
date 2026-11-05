# Shipping less CSS and JS: pipeline recipes

kiss does two of these itself:

- **It minifies** every `.css` and `.js` it copies, outside dev (`assets.minify`, on by default).
- **It purges** the CSS no written page uses from the stylesheets a site names (`assets.purge`, below).

Bundling a site's own scripts is a `config.assets.pipeline` step. A step runs before the asset copy, so whatever it writes into `src/assets/` is then copied, minified and hashed like any other file. GUIDE.md § An asset pipeline has the step shape: `{ name, run, cwd?, watch?, outputs? }`.

Each recipe was run as written through a kiss build. Measure before and after with `npx kiss-ssg speed`.

## Remove unused CSS from a framework (Bootstrap, Foundation, Bulma)

Name the stylesheet, as a template asks for it, and the classes its JavaScript builds at run time:

```js
assets: {
  hash: true,
  purge: {
    files: ['css/bootstrap.css'],
    safelist: ['show', 'active', 'in', 'collapsing', 'fade', /^modal/, /^tooltip/, /^popover/],
  },
},
```

- **kiss purges against the pages it wrote**, so a class from a model, a helper or a partial counts as much as one in a template. It reads the build's own scripts too, for a class added with `classList`.
- **Safelist the classes a library builds.** Bootstrap's JavaScript adds `show`, `active`, `in` and `collapsing`, and builds others for its components (`modal-backdrop`, `tooltip-inner`). A class that appears in no page and no script is removed, and the component breaks only when it opens. **Open every interactive component in the browser after turning this on.**
- **The preview keeps the whole file.** `--dev` never purges, so check the purge on a real build (`npm run build`, then serve the build folder).
- **Tailwind needs none of this.** It scans its content itself (GUIDE.md § An asset pipeline, the Tailwind trap).

Measured on one Bootstrap 3 site's two pages: 100 KB down to 16 KB raw, and 13.4 KB down to 3.4 KB after Brotli.

## Bundle and tree-shake the site's own scripts

When the site's scripts `import` each other or a library, bundle them. Each nested import is otherwise fetched only after its parent has loaded, one round trip after another. A bundle keeps only what is imported. Install esbuild as a development dependency of the site:

```bash
npm install -D esbuild
```

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
