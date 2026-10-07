# Assets and builds

Copying and compiling assets, cache-busting URLs, running an external asset pipeline, cleaning the build folder, building several sites from one source, and how the dev watcher handles file changes.

## Assets

Any static files you have in the assets directory will be copied to the build directory

### Cache-busting asset URLs

Link an asset with the `asset` helper and the caching policy stops living in your template:

```handlebars
<link rel='stylesheet' href='/{{asset "css/site.css"}}' />
```

| `config.assets` | What is emitted | What the helper renders |
| --- | --- | --- |
| _(default)_ | `public/css/site.css` | `css/site.css` |
| `{ hash: true }` | `public/css/site.a1b2c3d4.css` | `css/site.a1b2c3d4.css` |
| `{ version: '1.4.5' }` | `public/css/site.css` | `css/site.css?v=1.4.5` |

Setting both `hash` and `version` is a misconfiguration: the hashed filename wins and a warning says so. Ask for the path the file has when nothing is renaming it — a `.scss` source by its compiled `.css` name — and the same template line works under all three. The helper renders no leading slash, so the base is yours: `/{{asset …}}` for a root-relative link, or `{{root}}{{asset …}}` if your layout already climbs back to the build root (which is what makes a nested page work opened straight off the file system — see **`root` is yours** below). The hash is taken over the bytes that were emitted (a stylesheet after sass compiled it), so the URL changes when, and only when, the file a browser downloads changes; the file it replaces is deleted as it is written, so a `dev` session leaves one stylesheet in the build rather than one per save. Only `.css` and `.js` are renamed: an image, a font or `robots.txt` is reached by URLs kiss does not rewrite — the ones inside a stylesheet, and the ones a host asks for by a fixed name — so those keep their names, and `{{asset}}` still resolves them.

The other two forms, for a layout that climbs back to the build root and for an absolute URL — the hashed extension and the `?v=` query both survive the wrap:

```handlebars
<link rel='stylesheet' href='{{root}}{{asset "css/site.css"}}' />
<link rel='preload' as='style' href='{{absUrl (asset "css/site.css")}}' />
```

**`root` is yours, not kiss's.** There is no `root` helper — it is a value your page or layout supplies, the climb back to the build root (`''`, `'../'`, `'../../'`) for a page that knows how deep it is. The small examples set it on the extend (`{{#extend "layout" root="../"}}`, see `examples/3-pages/src/pages/roasts/roast.hbs`). `examples/11-blog` shows the other road: every link through `{{link}}` and `/{{asset …}}`, root-relative, no `root` at all. This matters because an undefined `{{root}}` is a missing _property_ to Handlebars, not a missing helper: it renders **empty and says nothing**, so the line still builds and the stylesheet resolves from whatever directory the page happens to sit in — correct at the top level, broken one folder down. If your pages are all at one depth, or you serve from the domain root, use `/{{asset …}}` and skip `root` entirely.

### An asset pipeline

`config.assets.pipeline` runs an external tool as part of the build — a CSS toolchain, an icon sprite, anything with a command line. Each step is `{ name?, run, watch?, cwd? }`, and kiss knows nothing about the tool itself:

```js
const kiss = new Kiss({
  dev: process.argv.includes('--dev'),
  assets: {
    pipeline: [
      {
        name: 'tailwind',
        run: 'npx @tailwindcss/cli -i src/styles/site.css -o src/assets/css/site.css --minify',
        watch:
          'npx @tailwindcss/cli -i src/styles/site.css -o src/assets/css/site.css --minify --watch=always',
      },
    ],
  },
})
```

Every `run` is executed through a shell, in order, awaited, **before the asset copy** — so a tool that writes into your assets folder has its output copied into the build like any other asset — and again before the copy on every whole-site `watch` rebuild. A step that exits non-zero (or cannot be spawned) fails the build like a failed page: `complete()` rejects and the failure is named `<pipeline: tailwind>`, while the pages and the asset copy still run so the whole build is still reported. `report().pipeline` carries `{ name, ok, duration }` per step.

`name` defaults to the first word of `run`, `cwd` to `process.cwd()`, and each command inherits `process.env` plus `KISS_BUILD`, `KISS_ASSETS` and `KISS_DEV` (`'1'` or `'0'`). `watch` is the dev-mode half: in `dev: true` only, it is started once — after that step's `run` has succeeded — kept for the session with its output going through kiss's logger, and ended by `close()`. A watch process that dies on its own is logged, not a build failure, and a rebuild never starts a second one. Editing a page, a partial or a layout does **not** re-run the steps; a tool that must see those edits is what `watch` is for.

A watch command gets no stdin from kiss, so a tool that stops when stdin closes needs its keep-alive flag — Tailwind's is `--watch=always`; plain `--watch` exits at once and the log says `pipeline watch "tailwind" exited (code 0)`. Scoped re-renders — a page view, a partial or a layout edit under `watch` — deliberately do **not** re-run the steps; a tool that must see those edits is what `watch` is for. `kiss-ssg check` runs the pipeline exactly as a build does, so a check is not read-only over your working tree: it regenerates whatever the steps generate. `examples/10-asset-pipeline/` (`npm run eg10`) is a runnable version that needs nothing installed.

#### Two silent traps in the Tailwind recipe

Neither of these is kiss's behaviour — both are Tailwind's — but the command above is what people copy, so they belong next to it.

**`@source` adds to Tailwind's project walk; it does not replace it.** Tailwind v4 scans your whole project for class-name candidates (everything not excluded by `.gitignore`, `node_modules`, a lockfile, a binary or a CSS file), and an `@source` line registers _additional_ paths. A site that writes an explicit `@source` list, reasonably reading it as _the_ source list, is still scanning its own markdown. Tailwind treats every file as plain text, so an ordinary English word is a candidate class — and with `assets.hash: true` the stylesheet's content hash is its filename. Typing the word `invisible` into a tracked `README.md` compiles `.invisible{visibility:hidden}`, gives `css/site.<hash>.css` a new name, and changes the `<link href>` on **every** page; `kiss-ssg check` then reports the whole site as changed with nothing in the page sources to explain it. On Tailwind 4.3.3 that single word moved the stylesheet from 4,381 to 4,410 bytes.

It is intermittent, which is what makes it expensive: a word counts only if it forms a clean candidate token, so `capitalize` in a sentence compiles a rule while `capitalize.` or `capitalize,` does not, and a word matching an already-compiled utility changes nothing. The hash therefore moves on some documentation edits and not others.

To scan only what you mean, disable the walk and list your sources — remembering that an `@source` path resolves against the **stylesheet's own folder**, not the working directory:

```css
@import 'tailwindcss' source(none);
@source '../views';
@source '../partials';
```

A path that matches nothing is silent as well: `source(none)` plus an `@source` that resolves nowhere compiles an empty utility layer rather than failing.

**Guard it rather than remember it.** Both failures are silent and both produce a plausible file, so a few lines in the build — a `pipeline` step, or a CI check — that fail when `source(none)` is missing from the entry stylesheet, or when any `@source` path no longer resolves, catch the whole class. It needs nothing built, and it is what caught this on a real site.

**Keep the `-i`.** Running `npx @tailwindcss/cli -o out.css` without `-i` exits 0, prints a normal timing line and writes a plausible stylesheet — but it never reads your entry file. The CLI substitutes a default input of `@import 'tailwindcss'`, so what is lost is not a handful of rules but everything you authored: every `@layer components` class, every `@theme` token, every `@font-face`, every plugin import and every `@source` line. Verified on 4.3.3 — an entry file declaring `.btn`, `.card`, `.callout` and a self-hosted `@font-face` compiled all of them with `-i` and none of them without; on a real 20-page site the output fell from 66,384 to 24,990 bytes, leaving generic utilities. Nothing reports an error. A project whose dev command passes `-i` while its build command does not is correct on every developer's machine and wrong only on the deployed site, which is how this survives for months.

## Cleaning the build folder

`cleanBuild` decides what happens to `folders.build`, and it takes three values.

`true` (the default) empties the build folder **in the `Kiss` constructor** — before a single model has resolved or page rendered — and nothing puts it back if the build then fails. For a build folder you regenerate from scratch every time that is exactly right. For one that holds output you have already published, it is not: a re-run to fix one typo destroys the old output first, and a build that fails leaves the folder empty or half-built.

`false` never cleans; files from earlier builds stay where they are.

`'atomic'` is the safe re-run. The build goes into a staging folder beside the build folder, and the whole thing is swapped into place only when `complete()` resolves:

```js
const kiss = new Kiss({
  cleanBuild: 'atomic',
  folders: { build: `./handbooks/${cohort}` },
})
kiss.scan().generate()
await kiss.complete() // the folder is replaced here, in one step
```

Until that line, the previous output is untouched — and if any page fails, `complete()` rejects, the staging folder is deleted and the old output is still there, byte for byte. If the staging folder cannot be deleted — a Windows antivirus or indexer lock that outlasts a few retries — kiss logs one warning naming it; nothing was published from it, so delete it by hand, and the next `cleanBuild: 'atomic'` build sweeps leftovers when it starts. Everything the build writes follows the staging folder: pages, copied assets, `sitemap.xml`, and a `.copyAssets()` you aimed explicitly at the build folder. The swap itself is two renames — your old output is renamed aside, the new build is renamed into place, and the old folder is then deleted — so there is no moment where the folder is half-copied, and a failed swap puts the old output straight back. The usual reason a swap fails is on Windows: a program holding a file open in the build folder — a preview server such as VS Code's Live Server, an editor, antivirus. kiss retries for about a second and a half, then `complete()` rejects with an error naming the folder and that likely cause; the old output is left in place and the staging folder is deleted. Close the program, or serve another folder, and build again. A build killed mid-flight leaves a `.kiss-staging-…` or `.kiss-old-…` folder beside your build folder; the next build removes it and says so. Two things to know: only `complete()` promotes, so a chain that ends at `.generate()` swaps nothing in; and in `dev: true` it behaves as `true` and says so in one line, because the dev server has been serving the build folder since it started.

The staging folder is a sibling named `<build>.kiss-staging-<pid>-<random>`, and `close()` removes it. Any `cleanBuild` value other than `true`, `false` and `'atomic'` throws.

`'atomic'` is for one-shot builds: in `dev: true` it degrades to `true` (the dev server serves the build folder from the start) and logs one notice saying so. **The consequence, which is the part that bites: a dev run writes its output into `folders.build` like any other build, so if that folder is what you publish (GitHub Pages' `./docs`, a committed `public/`), one `npm run dev` leaves a dev build in the published folder** — carrying the injected livereload `<script>`, expanded rather than compressed CSS, no HTML minification, and the per-page `.json` siblings. Point dev at a different, git-ignored `build` folder (`build: dev ? './.kiss-dev' : './docs'`) rather than relying on remembering, and only `complete()` promotes — a chain that ends at `.generate()` never swaps anything in. Folder safety is checked **before the constructor creates, empties, copies, or stages anything**, whatever `cleanBuild` is set to (including `false`):

-   `folders.src` must be a dedicated source folder, never the working project root (`.`, `./`, its absolute path, or an alias) or a filesystem root. Use `./src` or another dedicated directory.
-   `folders.build` must not be the working project root or a filesystem root, even when `src` is disabled or located elsewhere.
-   The build folder must not equal or contain any configured source folder: `src`, `pages`, `layouts`, `partials`, `models`, `controllers`, `assets`, `helpers`, or `aikb`.
-   The build folder must not sit inside any of those content folders either. `src` is the exception: `src/public` is allowed when it is separate from every individual content folder.

The checks cover both the configured paths and their real filesystem locations, including symlinks, Windows junctions and case differences, and missing descendants below an existing alias. A folder set to `null` is disabled and excluded; an unreadable or dangling link is rejected rather than assumed safe. Errors name the conflicting folder setting. Move overlapping inputs and output into separate folders; changing `cleanBuild` does not bypass the guard.

This protects configured source locations, not arbitrary files or custom code: validate variable output names (`./handbooks/${cohort}`) so an empty value cannot select an archive root. Pipeline commands and explicitly directed extra copies remain the site's responsibility.

**Atomic watch limitation:** `cleanBuild: 'atomic'` is supported for one-shot builds only. A non-dev `.watch()` session does not reset atomic promotion after failure: later replays can report success while the published output stays unchanged. Use ordinary watch mode for preview and a separate one-shot atomic build for publication.

## Building more than one site from one source tree

kiss has no notion of "versions" or "sites" — it is one `Kiss` instance building to one `folders.build`. That is enough to build several outputs from one shared `src/`, each frozen once and never touched again: an archive of per-intake handbooks, a menu rebuilt every season, a docs site published per release. Four things kiss already gives you, combined:

1.  **One `Kiss` instance per output, `folders.build` as the discriminator.** Everything else — pages, partials, models, controllers — is shared; only the build folder differs between runs:
    
    ```js
    const kiss = new Kiss({ folders: { build: `./menus/${season}` } })
    ```
    
2.  **An arbitrary config key, carried into every view.** Pass whatever varies between outputs straight into `new Kiss({...})` and read it back as `config.<key>` — it is the only thing that needs to differ in the template:
    
    ```js
    new Kiss({ season, folders: { build: `./menus/${season}` } })
    ```
    
    ```hbs
    <h1>The {{config.season}} menu</h1>
    ```
    
3.  **`folders.assets: null` plus an explicit `copyAssets(src, buildDir)`** when each output must own its assets outright, rather than sharing a folder kiss would otherwise keep re-copying from:
    
    ```js
    const kiss = new Kiss({ folders: { build: menuDir, assets: null } })
    kiss.copyAssets('./shared/assets', menuDir).scan().generate()
    ```
    
4.  **`cleanBuild: 'atomic'`**, so a re-run that fixes a typo in this output can never destroy — or half-build — an output already published (see **Cleaning the build folder** above).
    

The one thing kiss cannot validate for you: the value that becomes `folders.build` is yours before it ever reaches the constructor. Check it looks like a slug — not empty, no `..`, no path separators — before building, since an empty or malformed value resolves against the parent of every output you have already published, not just the one you meant to build.

See `examples/7-versioned-outputs/router.js` for a full runnable version: one seasonal menu per season, each with its own copied assets, plus a small second build that lists every season folder found on disk. `examples/` ships in the published package, so `node_modules/kiss-ssg/examples/README.md` is a copy you can run without cloning the repo. Examples 1–6 and 10 are the feature reference, one idea each; 7–9, 11 and 12 are exemplars — whole sites to copy by shape: versioned outputs, a data-fed site with one broken record, the v1 → v2 migration recipes, a blog with pagination, tag pages, a feed, a generated `robots.txt` and a redirect, and a single-file page converted into a kiss site. Each example is a site in its own folder with its own `router.js`, run from that folder the way a real site is. Every example builds and exits by default (`npm run eg1` … `eg11`); pass `--dev` to run examples 1–6, 8, 9, 10 and 11 as a live dev server instead (7 takes a season slug in place of `--dev`, and 8 exits 1 by design).

## Development file changes

The development watcher handles asset additions, edits, renames and deletions, removing only outputs tracked for those copies. It watches configured content folders outside `src` too, excludes build output, and applies intentionally empty saves after a short grace period. Asset updates and page rebuilds share a serial queue. Pages re-render when emitted CSS/JS URLs change under hashing, including directory deletions; image/font edits keep the fast path. One changed Sass output swaps its stylesheet, while multiple affected outputs reload the page. Writers register output ownership after successful writes: collisions warn, and generated pages and auxiliary outputs take precedence over later asset copies and cleanup. Changes to the build script or cached imported modules still require the documented restart.
