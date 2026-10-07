# Getting started

How a kiss-ssg site is laid out: starting one, the router.js build script, and the TypeScript types that ship with the package.

## Starting a site

`npx kiss-ssg init` sets a folder up for a coding agent — `package.json` scripts, `CLAUDE.md` and `AGENTS.md` pointing at `llms.txt`, kiss-ssg's plugins declared in `.claude/settings.json` and `.codex/config.toml`, and a one-page starter site when it finds no project there — and never overwrites a file. `npx kiss-ssg init --help` lists exactly what it writes; the [README (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/README.md#quick-start) is the walkthrough.

In detail, `npx kiss-ssg init` sets the current folder up for a coding agent and never overwrites a file: it creates or merges `package.json` (the `build` / `dev` / `check` / `aikb` scripts, and — only when it writes the starter — `"type": "module"` and `"main": "router.js"`; a site with `src/` and no `router.js` gets no scripts at all), appends `@node_modules/kiss-ssg/llms.txt` to `CLAUDE.md`, and to `AGENTS.md` a pointer and a section naming the skills and the three `codex plugin` install lines — each checked for on its own, so re-running `init` on a site set up before the Codex section existed adds it, declares the `kiss-ssg` marketplace and both plugins in `.claude/settings.json` and in `.codex/config.toml` (appending to an existing TOML file only the tables it does not define, and leaving one that defines them some other way untouched), installs `kiss-ssg` at its own version unless `--no-install` or `package.json` already asks for a version (then `npm install` is the command), and — only when it finds no project (no `router.js`, no `src/`, no `package.json` `main` naming a real file, no `build` script of its own) — adds `node_modules/` and `public/` to any `.gitignore` already there and drops a one-page starter whose `router.js` begins `` // Started by `npx kiss-ssg init` ``. Grow that starter; do not write a second build script beside it. It ends by printing the three `claude plugin … --scope project` install commands (Claude Code does not install a plugin because the settings file names it), then the three `codex plugin` commands, which install once per user (`.codex/config.toml` enables the plugins for the folder once Codex trusts it, but does not install them). Running `init` twice changes nothing. The same two plugins carry kiss-ssg's skills for Claude Code and for Codex, from one marketplace, and `init` ends by printing both agents' install commands. Claude Code's install at project scope, recorded in the site's `.claude/settings.json`. For Codex, `init` writes the same marketplace and plugins to `.codex/config.toml`, which enables them for this site once Codex trusts the folder. Codex still installs plugins per user, so its three lines run once per user, and `codex plugin add` also switches the plugins on for every folder. `AGENTS.md` (the file Codex reads) names the skills and those lines:

```sh
codex plugin marketplace add cprobert/kiss-ssg
codex plugin add kiss-ssg@kiss-ssg
codex plugin add kiss-memory@kiss-ssg
```

A site set up before the Codex lines existed gains them by running `npx kiss-ssg init` again: it adds the section to an `AGENTS.md` that lacks it, writes `.codex/config.toml` (or appends to one only the tables it does not define, leaving a file that defines them some other way untouched), always after everything already there, and rewrites none of it.

## The build script

Call it `router.js`, at the project root, and point `package.json`'s `main` and its `build`/`dev` scripts at it. It is a router: the config, the `.page()`/`.pages()`/`.scan()` table, the terminal `.generate()`/`.sitemap()`/`.llms()`/`.feed()`/`.robots()` chain, and the `complete()`/`catch()` pair. Custom helpers need no line here — kiss imports `config.folders.helpers` (`./helpers` by default) and calls its `registerHelpers` export itself. Helper bodies, the facts a site states in both its markup and its JSON-LD, and the completion callbacks once they outgrow a few lines all belong in modules beside it.

How much is extracted follows what the site has earned, not the size of the file. **File length is never the trigger** — a long router is a symptom worth looking at, not a reason to split. `helpers/` is earned by the site's **first** custom helper (one, not three and not a proportion of the file: a helper inside `router.js` cannot be imported, so it cannot be unit-tested, and that is as true of the first as of the fourth); `config/` is earned the moment one fact appears in both the markup a visitor reads and the JSON-LD or feed a machine reads. Each trigger is a yes/no question on purpose, because a threshold you have to adjudicate is one two readers answer differently. The tiers in full, the reasons, and the three mistakes the shape invites are under **The tiers, in full** below — chief among them that renaming an existing build script to `router.js` silently orphans whatever names it, from `package.json` to a CSS toolchain's source globs.

Pages are registered three ways:

-   `.page()` — one page
-   `.pages()` — one view, many pages, from an array
-   `.scan()` — every `\*.hbs` under the pages folder you have not already registered (a `.page()` earlier in the chain wins, so no view is built twice)

Those are the registration methods, not the whole API — a build script also ends in the terminal chain (`.generate()`, optionally `.sitemap()`/`.llms()`/`.feed()`/`.robots()`, then `.complete()`), and **`.complete()` is the one that decides whether the build passed**. The simplest usage is `.scan()`, which scans your pages folder for `\*.hbs` files and writes them to the build folder:

```js
import Kiss from 'kiss-ssg'

const kiss = new Kiss()
kiss.scan()
kiss.generate()

await kiss.complete().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})
```

**The last three lines are not optional, and leaving them off is the most expensive mistake on this page.** Measured, on exactly this script with `.complete()` removed: a page whose partial is missing prints its error in red, is left out of the build entirely, and **the process still exits 0**. Nothing rejects, nothing is thrown, and a deploy step that checks the exit code publishes the site with the page gone. `.complete()` waits for everything queued and rejects with an `AggregateError` carrying every failure — that rejection is the only thing that makes a broken build fail a deploy. See **Reading a failure** below for `err.failures` and `err.report`.

**Note**: kiss will generate the default folders for you when you first run the script. You can override the folder locations by passing a config to the kiss constructor.

The default config options are:

```js
{
  dev: false,
  verbose: false,
  cleanBuild: true,
  extensionLess: false,
  sass: { includePaths: [] },
  fetch: {
    headers: {},
    timeout: 10000,
    retries: 0,
    cache: false
  },
  assets: {
    hash: false,
    version: null,
    pipeline: []
  },
  markdown: {
    html: true,
    xhtmlOut: true,
    breaks: false
  },
  links: {
    check: true,
    canonical: false,
    trailingSlash: true,
    hostServed: []
  },
  redirects: {
    format: null
  },
  audit: {
    check: true,
    ignore: []
  },
  markdownCopies: {
    write: true,
    selector: 'main'
  },
  port: 3001,
  livereloadPort: 35729,
  devHost: '127.0.0.1',
  folders: {
    src: './src',
    build: './public',
    assets: './src/assets',
    layouts: './src/layouts',
    pages: './src/pages',
    partials: './src/partials',
    models: './src/models',
    controllers: './src/controllers',
    aikb: './AIKB',
    helpers: './helpers'
  }
}
```

Partials can be `.hbs`, `.html` or `.md` (rendered as Markdown first), all compiled as templates, or `.txt`, which is shown as text and never compiled. See `.registerPartials()` under **Other methods**.

| Option | Default | Purpose |
| --- | --- | --- |
| dev | false | Dev mode will start a local live-reload server and rebuild on file change. Model and controller changes are picked up too: a rebuild re-runs models and controllers, and edited controller files are reloaded from disk. |
| verbose | false | Enables additional output on the terminal, when set to true |
| cleanBuild | true | `true`, `false` or `'atomic'`. `true` empties the build dir — in the constructor, before anything is rendered. `'atomic'` builds into a staging folder and swaps it in only when `complete()` resolves. See **Cleaning the build folder** below. |
| extensionLess | false | When `true`, a non-index page builds to `<path>/<slug>/index.html` instead of `<path>/<slug>.html` — a URL like `/about/` instead of `/about.html`. |
| sass | `{ includePaths: [] }` | `includePaths` is passed to sass as `loadPaths`, so `@use`/`@import` can resolve from those directories too. |
| fetch | see below | The policy for `http(s)` models: `headers` sent with every request, `timeout` in ms, `retries` after a network error or a 5xx, and `cache` (`false`, or a directory to cache successful bodies in). See **Remote models** below. |
| assets | `{ hash: false, version: null, pipeline: [] }` | Cache busting for the files copied into the build, plus the external commands run before the copy. `hash: true` renames every emitted `.css`/`.js` to carry a content hash; `version: '1.4.5'` renames nothing and makes `{{asset}}` append `?v=1.4.5`; `pipeline` is an ordered list of `{ name?, run, watch?, cwd? }` steps. All off is today's build, unchanged. See **Cache-busting asset URLs** and **An asset pipeline** below. |
| links | `{ check: true, canonical: false, trailingSlash: true, hostServed: [] }` | The broken-internal-link scan, and what `{{link}}` emits. `check: true` scans every written page for internal references that resolve to nothing and reports them as `report().links` — advisory, never changing `ok` or the exit code. `canonical: true` makes a bare `{{link}}` emit the extension-less form (`/about` rather than `/about.html`) for a host that serves it, with the per-call `canonical=` hash still overriding. `trailingSlash: false` drops the slash from a directory index (`/courses`) in every URL kiss emits, for a host that serves the bare form; `hostServed` lists paths the host serves that no build writes. See **Host URL policy**, **Broken internal links** and the `link` helper below. |
| redirects | `{ format: null }` | How page `aliases` are emitted. `redirects.json` is always written when a page has an alias; `format` names the host files beside it (`'netlify'`, `'firebase'`, `'vercel'`, `'htaccess'`, `'none'`, a writer function, or a list of those). Unset writes no host file. See **Redirects** below. |
| audit | `{ check: true, ignore: [] }` | The launch-readiness audit: whether the built site looks finished (titles, descriptions, `og:image`, alt text, headings, a favicon, a 404 page, stray files). Advisory, reported as `report().audit`. `ignore` lists check ids not to run; `audit: false` turns it off. See **Launch-readiness audit** below. |
| markdownCopies | `{ write: true, selector: 'main' }` | A Markdown copy of every HTML page, beside it (`about.md`, `courses/index.md`), converted from the page's `<main>` (or `<body>` when it has none), and the page `llms.txt` links to. `selector` names a different element; `markdownCopies: false` turns them off, site-wide or for one page. See **Markdown copies for agents** below. |
| port | 3001 | The port the dev server listens on (`dev: true` only). A port already in use fails the build with one message naming it — nothing can be served, so give a second site its own `port` rather than letting them clash. |
| livereloadPort | 35729 | The port the live-reload server listens on, and the one the injected reload script talks to (`dev: true` only). Give a second site its own value to run both at once — a clash is now logged and live reload simply switched off, rather than killing the process. |
| devHost | '127.0.0.1' | The interface the dev and live-reload servers bind to. Loopback only by default; set `'0.0.0.0'` to reach the preview from another device on your network — live reload follows the host the page was loaded from, so the preview reloads there too. |
| folders | see above | A JSON object of alternative folder locations |
| folders.aikb | './AIKB' | Where `npx kiss-ssg aikb` records the site's knowledge base. Source, not output: it sits outside `folders.build`, is never derived from `folders.src`, is not created until you record one, and is meant to be committed. `null` switches it off |
| siteUrl | undefined | The site's base URL, required by `.sitemap()` (see below) and by the `canonical` / `absUrl` helpers |

A key you pass explicitly as `undefined` takes its default — `new Kiss({ port: process.env.PORT })` with `PORT` unset still gets 3001, and the same holds inside `folders` and `sass`. `null` is a real value: set a folder to `null` to switch it off.

Setting `folders.src` re-derives `pages`, `assets`, `layouts`, `partials`, `models` and `controllers` from it (`${src}/${key}`), unless a given key is also set explicitly in the same `folders` object — `build` is independent and always defaults to `./public` regardless of `src`. Folder strings are normalised on the way in — a trailing slash or a backslash separator is tolerated (`'./src/assets/'` and `'.\\src\\assets'` both resolve to `'./src/assets'`).

  

**Note**: All config settings are available in the view under "this.config"

Each page gets its **own shallow copy** of the resolved config, so a controller that mutates `options.config` changes that page only — never the other pages, `kiss.config`, or the sitemap. Pass `config` in a page's options to override settings for that page alone (nested objects such as `folders` are shared with the global config, and kiss never mutates them).

### The tiers, in full

Beside `build` and `dev`, add `check` and `aikb` scripts (`"check": "kiss-ssg check router.js"`, `"aikb": "kiss-ssg aikb router.js"`), so both are reachable as `npm run check` / `npm run aikb` rather than an `npx` form somebody has to remember. Name the file `router.js` from the first commit even while it is one file: renaming it later is the first of the three things that bite, below.

Each seam has **one trigger, and they are independent** — a site can reach tier 2 while its helpers are still at tier 0, and the tiers are not stages to pass through in order. Each trigger is a yes/no question with no judgement in it, deliberately: a threshold you have to adjudicate is one two readers will answer differently.

-   **Tier 0 — one file.** Config, routes, the terminal chain. No custom helpers and no fact stated twice: nothing has been earned, so nothing is extracted. Most sites are born here and plenty stay. File length on its own never moves a site off tier 0 — a long router is a symptom to look at, not a trigger to act on.
-   **Tier 1 — extract `helpers/`.** The moment the site has its **first** custom helper. Not three, not a proportion of the file: one. A helper that lives inside `router.js` cannot be imported, so it cannot be unit-tested, and that is true of the first one exactly as much as the fourth — testability is not a size question. The folder costs one file and one import; the migration you avoid by starting there is the expensive part. One module per _kind_ of thing (pure transformations, JSON-LD builders, anything derived from the page being rendered), each exporting a `register*Helpers(kiss)`, composed by an `index.js` that exports a single `registerHelpers(kiss)`. **You do not call it: kiss does.** `config.folders.helpers` defaults to `./helpers` beside the build script, and kiss imports that folder's `index.js` (or `.mjs`/`.cjs`) and calls its `registerHelpers` export — or its default export — itself. A site with no such folder is the ordinary case and says nothing. A folder that **breaks** — an entry that throws on import, or a registrar that throws — is a build failure named `<site helpers>`, because the alternative is every `{{helper}}` rendering as nothing on a green build. A folder whose entry exports no registrar **at all** depends on who chose the folder: if you set `folders.helpers`, that is a build failure too; if kiss defaulted to `./helpers`, it is a warning and the build continues, so a project that already had a root `helpers/` of unrelated utilities is not broken by the upgrade. Set `folders.helpers` to put it elsewhere, or to `null` if this site has none.

**It is watched in dev**, and an edit to that entry re-imports it on a cache-busted URL, re-registers, and re-renders every page — so a helper edit takes effect without a restart, the way an edited controller does; a helper the edited entry no longer registers is unregistered, and deleting the entry unregisters them all. A module the entry _imports_ is the exception: ESM has no cache-invalidation API, so busting the entry's URL does not reach `./format.js`, and kiss prints the restart notice and does **not** rebuild rather than re-rendering against the cached copy and calling it done. Keeping it out of `src` is still the better shape for everything else the build script imports (the tier 2 `config/` below included): `src` is what `.watch()` watches for content and `folders` derives exactly six folders from it (`pages`, `assets`, `layouts`, `partials`, `models`, `controllers`), so a module in any _other_ folder under `src` is none of those and every save triggers a whole-site replay that cannot pick the edit up — the module is already in the ESM cache and a replay never re-runs the build script. kiss prints a notice naming the restart rather than letting the rebuild imply it worked. Two exceptions, both because they have watchers of their own: `folders.assets` is re-copied, and `folders.helpers` is re-imported — so a helpers folder pointed inside `src` still works and is not nagged about.

-   **Tier 2 — extract `config/` and the build report.** The moment one fact appears both in the markup a visitor reads and in the JSON-LD or feed metadata a machine reads (a phone number, a postal address, the social URLs), it belongs in a module the router spreads into `new Kiss()` as an arbitrary config key — which puts it on both sides at once, `{{config.business.telephone}}` in a template and `kiss.config.business` in a helper. When the `complete()`/`catch()` callbacks outgrow a few lines, they go to their own module too; a callback passed to `complete()` is invoked with `callback.call(this)`, so it must stay a `function` rather than an arrow if it reads `this.config` or `this.report()`.

Three things that bite:

-   **Renaming an existing build script to `router.js` breaks references nothing will report.** A CSS toolchain's source globs, `package.json`'s `main` and scripts, a CI or host build command, and any `npx kiss-ssg check <script>` invocation all name the old file, and none of them fails loudly when it stops matching — a Tailwind `@source` that matches nothing is scanned in silence and its classes simply stop compiling. Rename, then grep the whole repo for the old name before building.
-   **Export the pure function; register a thin adapter over it.** Moving a helper into `helpers/` buys nothing if its body still lives entirely inside the `register*Helpers(kiss)` closure — it is no more importable there than it was in the router. Export `buildBreadcrumb(pageURL, model, linkTo)` and let the registered helper be the three lines that unpack `options.data.root` and call it.
-   **Helpers are registered once per process, so anything they read at registration time is frozen for the whole dev session.** A watch rebuild — including the one an edit to `router.js` itself triggers — replays the recorded `.page()`/`.pages()`/`.scan()` registrations on the same `Kiss` instance; it never re-imports the build script. A helper that reads a models folder with `fs.readdirSync` as it registers will still be serving that first reading after you have edited those models, and editing a helper module has no effect at all until you restart. Read the data inside the helper, at render time, and memoise it there if the cost matters.

### Building a site well

Five habits that separate a site that builds from a site that keeps working. They are short because each one is checkable, and all five came from watching an agent convert a real site unaided.

-   **Never hand-write an internal URL.** `{{link "about"}}` for a page, `{{asset "css/site.css"}}` for a file — a path you typed is a path nothing will ever check, and it breaks silently the first time a slug changes. **Both fail the build when they are wrong**, which is the entire reason to use them: `{{link}}` on an id no page claims, and `{{asset}}` on a path no `.copyAssets()` emitted. In **dev** each warns and carries on instead — `{{link}}` renders `#`, `{{asset}}` renders the path exactly as written — because the page or file you are about to add legitimately is not there yet. The broken-internal-link scan stays the advisory net under the hand-written references beside them.
    
    Two cases call for a hand-written internal URL. One is a build meant to be opened straight off the file system, where a leading slash cannot resolve: then it is `{{root}}` plus a relative path (see `asset` under **Helpers**, and `examples/11-blog`), and the link scan still checks it. The other is a file another kiss method writes — `/feed.xml`, `/sitemap.xml`, `/llms.txt` — which is not a page, so no `{{link}}` id names it, and not a copied asset, so `{{asset}}` does not either: write its path, as example 11's RSS links do, and the link scan checks that too.
    
-   **Content that repeats is data, not markup.** The same block appearing N times with different words is a JSON model and one partial, not N copies. Do it while you are writing it; the second copy is where drift starts, and later never comes.
    
-   **`npx kiss-ssg check <script> --summary` is the bar, and the bar is zero broken links.** "It renders" is not a verdict. The check publishes nothing, so there is no reason not to run it.
    
-   **Record the knowledge base when the work closes** (`npx kiss-ssg aikb <script>`) and commit it — and write the _retired-feedback_ entries in `AIKB/site.md` while you still remember which decisions were contested and why. Nothing prompts you to do that, and it is the only thing that stops the next agent re-proposing what you just rejected. You will not remember tomorrow.
    
-   **Read one example's page and its layout together**, not separately. `examples/4-layouts-and-partials/src/` is the smallest pair. The layout/page relationship is the one thing you cannot guess from a page alone, and reading them apart is how an hour disappears.
    

## Types

TypeScript declarations ship with the package, generated from the JSDoc in the engine — so a plain-JavaScript site gets completion, hover docs and checking from `// @ts-check` alone, with no TypeScript of its own and no `@types/` package to install:

```js
// @ts-check
import Kiss from 'kiss-ssg'

/** @type {import('kiss-ssg').KissConfigInput} */
const config = { siteUrl: 'https://example.com', cleanBuild: 'atomic' }

const kiss = new Kiss(config)
```

The same applies to `PageOptions`, `PagesOptions`, `KissController` (a controller function), `BuildError` (the error `complete()` rejects with, carrying `err.failures`) and `BuildReport` (what `.report()` returns).

The package's `exports` map has one `.` entry, resolving `types` → `./types/kiss.d.ts` and both `import` and `require` → `./lib/kiss.js`. Also exported: `KissConfig` (the resolved config a view sees), `KissFolders`, `PageOptionsPatch` (what a controller returns), `BuildData`, `BuildFailure`, `BuildPage`, `BuildAsset`, `BuildReportFailure`, `SitemapOptions`, `SitemapUrl`, `LlmsOptions` and `WatchOptions`. Arbitrary keys are allowed on the config and on page options — they reach the template — so only the documented keys are checked; `folders` is closed, so a misspelled folder name is an error.
