# kiss-ssg v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the single-file `kiss-ssg.js` engine into focused ESM modules under `lib/`, covered by a Vitest suite, with an `AIKB/` knowledge base and a `CLAUDE.md` lookup table — without changing what the public `Kiss` API does.

**Architecture:** Characterization tests are written against the existing monolith first, then two lifecycle defects are fixed so those tests are deterministic, then the monolith is converted to ESM in place, then responsibilities are extracted one batch at a time into `lib/*.js` (each with unit tests) while the integration suite stays green, and finally the orchestrator moves to `lib/kiss.js` and the docs/knowledge base are written.

**Tech Stack:** Node ≥22.12 (ESM), Vitest, Handlebars + handlebars-layouts, Remarkable, sass, fs-extra, glob v7, chokidar, html-minifier-terser, connect/serve-static/livereload.

**Spec:** `planning/specs/2026-09-02-v2-solid-refactor-design.md` — read it first; every task below argues from it.

## Model delegation

Every task carries a `model:` tag. The executor dispatches each task to a subagent with that model (`Agent` tool, `model: "sonnet" | "opus" | "fable"`). The main Fable session reviews `git diff` + test output between tasks and writes no implementation code itself. Subagent prompts must be self-contained: paste the task verbatim plus the spec sections it cites; tell the subagent not to re-explore the repo beyond the files named.

## Global Constraints

- `engines.node` is `>=22.12.0` (set in Task 4). Everything runs on the machine's Node 24; no transpilation, no bundler.
- ESM everywhere from Task 4 on (`"type": "module"`); before Task 4 the repo is still CommonJS — tasks 1–3 must not add ESM syntax to engine files.
- Engine modules live in **`lib/`**, never `src/` (`src/` is the docs site's source that `docs.js` builds).
- Public API preserved exactly as listed in the spec's "Compatibility stance": `.page()`, `.pages()`, `.scan()`, `.generate(cb)`, `.complete(cb)`, `.sitemap(opts, cb)`, `.watch()`, `.copyAssets()`, `.registerPartials()`, `.viewStats()`, `.getModelByID()`, `kiss.handlebars`, `kiss.remarkable`, config shape, `generate(cb)` data shape `[{ id, data }]`. Additive only: `close()`, `watch({ entry })`, `utils` named export.
- Only `lib/logger.js` may import `colors`; no `'text'.red` prototype-extension style anywhere else after Task 6.
- Temp-dir paths in tests are normalised to forward slashes (`glob` v7 rejects backslashes on Windows).
- No new features beyond the spec. YAGNI.
- Prettier style: no semicolons, single quotes (see `.prettierrc`).
- Commit after every task with the trailer:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_014wk8sPH2eWktWj7Gqqcy9c`.

## File structure (end state)

| File                         | Responsibility                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `lib/kiss.js`                | Orchestrator, public API, owns `_stack`/`_promises`/`_generating`, per-instance Handlebars/Remarkable, watcher/dev-server handles |
| `lib/kiss-page.js`           | One page's render/write lifecycle                                                                                                 |
| `lib/logger.js`              | Coloured console logger factory (only `colors` importer)                                                                          |
| `lib/config.js`              | Default config, folder derivation, folders-to-ensure (pure)                                                                       |
| `lib/utils.js`               | Pure string/path helpers + `hashId`                                                                                               |
| `lib/handlebars-helpers.js`  | Registers the six built-in helpers on a given Handlebars env                                                                      |
| `lib/partials.js`            | Registers partials/layouts on a given Handlebars env                                                                              |
| `lib/assets.js`              | Sass compile + asset copy, always-resolving promise                                                                               |
| `lib/model-resolver.js`      | `options.model` → `{ id, data }`                                                                                                  |
| `lib/controller-resolver.js` | `options.controller` → patched options                                                                                            |
| `lib/sitemap.js`             | Sitemap entries, XML, write                                                                                                       |
| `lib/dev-server.js`          | connect + serve-static + livereload, `close()`                                                                                    |
| `lib/watcher.js`             | chokidar watchers, `ready`, `close()`                                                                                             |
| `test/helpers/site.js`       | Temp-dir site fixture + `waitFor`                                                                                                 |
| `test/helpers/kiss.js`       | Re-exports the engine entry (path changes once, in Task 12)                                                                       |
| `test/integration/*.test.js` | Real `Kiss` against temp dirs                                                                                                     |
| `test/unit/*.test.js`        | One per `lib/` module                                                                                                             |
| `test/aikb.test.js`          | `lib/` ↔ `AIKB/` ↔ `CLAUDE.md` sync                                                                                               |
| `AIKB/*.md`                  | One doc per `lib/` module + `testing.md`                                                                                          |
| `eslint.config.js`           | Flat ESLint config                                                                                                                |

---

### Task 1: Vitest harness — `model: sonnet`

**Files:**

- Modify: `package.json` (scripts, devDependencies)
- Create: `vitest.config.mjs`
- Create: `test/unit/utils.test.js`

**Interfaces:**

- Produces: `npm test` (single run), `npm run test:watch`, `npm run test:coverage`. Test files live under `test/**/*.test.js`.

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest @vitest/coverage-v8
```

- [ ] **Step 2: Add config and scripts**

Create `vitest.config.mjs` (`.mjs` because the package is still CommonJS until Task 4; leave the name alone afterwards):

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'kiss-ssg.js', 'libs/**'],
    },
  },
})
```

In `package.json` `scripts` add:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 3: Write a failing smoke test against the existing CJS utils**

`test/unit/utils.test.js`:

```js
import { describe, it, expect } from 'vitest'
import utils from '../../libs/utils.js'

describe('utils.toSlug', () => {
  it('lower-cases and replaces runs of non-word characters with a dash', () => {
    expect(utils.toSlug('  Hello World! ')).toBe('hello-world-')
  })
})

describe('utils.sanitizePath', () => {
  it('trims surrounding slashes and slugifies each segment', () => {
    expect(utils.sanitizePath('/About Us/Our Team/')).toBe('about-us/our-team')
  })
})
```

- [ ] **Step 4: Run it — it must pass (this proves Vitest can load the CJS engine files)**

Run: `npm test`
Expected: 2 passed. If the import of `libs/utils.js` fails, that is a harness problem to fix here (do not change `libs/utils.js`).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.mjs test/unit/utils.test.js
git commit -m "Add Vitest harness with a smoke test against libs/utils"
```

---

### Task 2: Characterization tests against the monolith — `model: opus`

**Files:**

- Create: `test/helpers/site.js`, `test/helpers/kiss.js`
- Create: `test/integration/characterization.test.js`

**Interfaces:**

- Produces: `makeSite(files) → { root, src, build, folders, read(rel), exists(rel), touch(rel, content), cleanup() }`, `waitFor(predicate, { timeout, interval })`; `test/helpers/kiss.js` default-exports the `Kiss` class and exports `ENTRY` (absolute path of the engine entry file).
- Notes for the implementer: `Kiss` today is fire-and-forget (files appear some time after `generate()` returns) — every test polls with `waitFor`. Do **not** use `dev: true` (it starts a real HTTP server). Do **not** test file-based controllers here: `require.main` is undefined under Vitest so `require.main.require` throws until Task 4 replaces it. Do not assert on `title` for non-index pages (an existing quirk sets it to `'Index'`).

- [ ] **Step 1: Write the helpers**

`test/helpers/site.js`:

```js
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'

// Creates an isolated site under the OS temp dir. Paths are returned with
// forward slashes because glob v7 (used by the engine) rejects backslashes.
export async function makeSite(files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-'))
  const root = dir.replace(/\\/g, '/')
  for (const [rel, content] of Object.entries(files)) {
    const body = typeof content === 'string' ? content : JSON.stringify(content)
    await fs.outputFile(path.join(dir, rel), body)
  }
  return {
    root,
    src: `${root}/src`,
    build: `${root}/public`,
    folders: { src: `${root}/src`, build: `${root}/public` },
    read: (rel) => fs.readFile(path.join(dir, rel), 'utf8'),
    exists: (rel) => fs.pathExists(path.join(dir, rel)),
    touch: (rel, content) => fs.outputFile(path.join(dir, rel), content),
    cleanup: () => fs.remove(dir),
  }
}

export async function waitFor(
  predicate,
  { timeout = 5000, interval = 25 } = {},
) {
  const start = Date.now()
  for (;;) {
    if (await predicate()) return
    if (Date.now() - start > timeout) throw new Error('waitFor: timed out')
    await new Promise((r) => setTimeout(r, interval))
  }
}
```

`test/helpers/kiss.js`:

```js
import path from 'node:path'
export { default } from '../../kiss-ssg.js'
export const ENTRY = path.resolve('kiss-ssg.js')
```

- [ ] **Step 2: Write the characterization tests**

`test/integration/characterization.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { makeSite, waitFor } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

describe('scan + generate', () => {
  it('builds every .hbs under pages, inferring slug and path from the view path', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '<h1>{{title}}</h1>',
      'src/pages/about/us.hbs': '<p>{{path}}/{{slug}}</p>',
    })
    new Kiss({ folders: site.folders }).scan().generate()
    await waitFor(() => site.exists('public/about/us.html'))
    expect(await site.read('public/index.html')).toBe('<h1>Index</h1>')
    expect(await site.read('public/about/us.html')).toBe('<p>about/us</p>')
  })

  it('auto-maps a model file with the same name as the view', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '<h1>{{title}}</h1><p>{{model.name}}</p>',
      'src/models/index.json': { title: 'Home', name: 'kiss' },
    })
    new Kiss({ folders: site.folders }).scan().generate()
    await waitFor(() => site.exists('public/index.html'))
    expect(await site.read('public/index.html')).toBe(
      '<h1>Home</h1><p>kiss</p>',
    )
  })
})

describe('page()', () => {
  it('accepts an object model, a function controller, and explicit path/slug', async () => {
    site = await makeSite({
      'src/pages/item.hbs': '<i>{{title}}|{{model.name}}</i>',
    })
    new Kiss({ folders: site.folders })
      .page({
        view: 'item.hbs',
        model: { name: 'kiss' },
        path: 'things',
        slug: 'One Thing',
        controller: ({ model }) => ({ title: model.name.toUpperCase() }),
      })
      .generate()
    await waitFor(() => site.exists('public/things/one-thing.html'))
    expect(await site.read('public/things/one-thing.html')).toBe(
      '<i>KISS|kiss</i>',
    )
  })

  it('renders a string view with an explicit slug', async () => {
    site = await makeSite({})
    new Kiss({ folders: site.folders })
      .page({
        view: 'Hello {{model.name}}',
        model: { name: 'world' },
        slug: 'hello-snippet',
      })
      .generate()
    await waitFor(() => site.exists('public/hello-snippet.html'))
    expect(await site.read('public/hello-snippet.html')).toBe('Hello world')
  })

  it('honours a custom extension', async () => {
    site = await makeSite({ 'src/pages/feed.hbs': '<rss>{{model.name}}</rss>' })
    new Kiss({ folders: site.folders })
      .page({ view: 'feed.hbs', ext: 'xml', model: { name: 'x' } })
      .generate()
    await waitFor(() => site.exists('public/feed.xml'))
    expect(await site.read('public/feed.xml')).toBe('<rss>x</rss>')
  })

  it('passes [{ id, data }] to the generate callback with `this` bound to the instance', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'x',
      'src/models/index.json': { title: 'Home' },
    })
    let seen = null
    const kiss = new Kiss({ folders: site.folders })
    kiss
      .page({ view: 'index.hbs', model: 'index.json' })
      .generate(function (data) {
        seen = { self: this, data }
      })
    await waitFor(() => seen)
    expect(seen.self).toBe(kiss)
    const entry = seen.data.find((d) => d.id === 'index.json')
    expect(entry.data).toEqual({ title: 'Home' })
    expect(kiss.getModelByID('index.json', seen.data)).toEqual({
      title: 'Home',
    })
  })
})

describe('pages()', () => {
  it('fans out one page per array item, appending -N to the slug', async () => {
    site = await makeSite({ 'src/pages/course.hbs': '{{model.name}}' })
    new Kiss({ folders: site.folders })
      .pages({ view: 'course.hbs', model: [{ name: 'a' }, { name: 'b' }] })
      .generate()
    await waitFor(() => site.exists('public/course-2.html'))
    expect(await site.read('public/course-1.html')).toBe('a')
    expect(await site.read('public/course-2.html')).toBe('b')
  })

  it('lets the controller derive the slug from the model', async () => {
    site = await makeSite({ 'src/pages/course.hbs': '{{model.name}}' })
    new Kiss({ folders: site.folders })
      .pages({
        view: 'course.hbs',
        model: [{ name: 'alpha' }, { name: 'beta' }],
        controller: ({ model }) => ({ slug: model.name }),
      })
      .generate()
    await waitFor(() => site.exists('public/beta.html'))
    expect(await site.read('public/alpha.html')).toBe('alpha')
  })

  it('loads every *.json in a models folder as the array', async () => {
    site = await makeSite({
      'src/pages/member.hbs': '{{model.name}}',
      'src/models/team/a.json': { name: 'a' },
      'src/models/team/b.json': { name: 'b' },
    })
    new Kiss({ folders: site.folders })
      .pages({ view: 'member.hbs', model: 'team' })
      .generate()
    await waitFor(() => site.exists('public/member-2.html'))
    expect(await site.read('public/member-1.html')).toBe('a')
  })
})

describe('extensionLess', () => {
  it('writes non-index pages to <path>/<slug>/index.html', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'home',
      'src/pages/about/us.hbs': 'us',
    })
    new Kiss({ folders: site.folders, extensionLess: true }).scan().generate()
    await waitFor(() => site.exists('public/about/us/index.html'))
    expect(await site.exists('public/index.html')).toBe(true)
  })
})

describe('assets', () => {
  it('compiles scss to css and copies everything else, excluding sass sources', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'x',
      'src/assets/css/site.scss': '$c: red; body { color: $c; }',
      'src/assets/robots.txt': 'User-agent: *',
    })
    new Kiss({ folders: site.folders }).scan().generate()
    await waitFor(() => site.exists('public/css/site.css'))
    await waitFor(() => site.exists('public/robots.txt'))
    expect(await site.read('public/css/site.css')).toContain('color:red')
    expect(await site.exists('public/css/site.scss')).toBe(false)
  })
})

describe('partials, layouts and helpers', () => {
  it('renders hbs/html/md partials inside a layout', async () => {
    site = await makeSite({
      'src/layouts/layout.hbs': '<main>{{#block "body"}}{{/block}}</main>',
      'src/partials/nav.hbs': '<nav>{{title}}</nav>',
      'src/partials/note.md': '# Note',
      'src/partials/foot.html': '<footer>f</footer>',
      'src/pages/index.hbs':
        '{{#extend "layout"}}{{#content "body"}}{{> nav}}{{> note}}{{> foot}}{{/content}}{{/extend}}',
    })
    new Kiss({ folders: site.folders }).scan().generate()
    await waitFor(() => site.exists('public/index.html'))
    const html = await site.read('public/index.html')
    expect(html).toContain('<nav>Index</nav>')
    expect(html).toContain('<h1>Note</h1>')
    expect(html).toContain('<footer>f</footer>')
  })

  it('exposes markdown, stringify, env and isActive helpers', async () => {
    site = await makeSite({
      'src/pages/about.hbs': [
        '{{#markdown}}# Hi{{/markdown}}',
        '{{{stringify model}}}',
        '{{#env is="prod"}}PROD{{else}}DEV{{/env}}',
        '{{#isActive this href="/about"}}<a class="{{active}}">A</a>{{/isActive}}',
      ].join(''),
    })
    new Kiss({ folders: site.folders })
      .page({ view: 'about.hbs', model: { a: 1 } })
      .generate()
    await waitFor(() => site.exists('public/about.html'))
    const html = await site.read('public/about.html')
    expect(html).toContain('<h1>Hi</h1>')
    expect(html).toContain('"a": 1')
    expect(html).toContain('PROD')
    expect(html).toContain('<a class="active">A</a>')
  })
})

describe('sitemap()', () => {
  it('writes sitemap.xml from registered pages with per-page overrides', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'x',
      'src/pages/about.hbs': 'x',
      'src/pages/hidden.hbs': 'x',
    })
    new Kiss({ folders: site.folders, siteUrl: 'https://example.com/' })
      .page({ view: 'index.hbs' })
      .page({
        view: 'about.hbs',
        sitemapPriority: '0.5',
        sitemapChangefreq: 'weekly',
      })
      .page({ view: 'hidden.hbs', ignoreSitemap: true })
      .generate()
      .sitemap()
    await waitFor(() => site.exists('public/sitemap.xml'))
    const xml = await site.read('public/sitemap.xml')
    expect(xml).toContain('<loc>https://example.com/</loc>')
    expect(xml).toContain('<loc>https://example.com/about</loc>')
    expect(xml).not.toContain('hidden')
    expect(xml).toContain('<priority>0.5</priority>')
    expect(xml).toContain('<changefreq>weekly</changefreq>')
  })
})
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all pass. If a test fails, first decide whether it records the engine's _actual_ behaviour incorrectly (fix the test) or exposes a real defect (leave the test out and note it in the commit message — defects are fixed in Task 3, not here).

- [ ] **Step 4: Commit**

```bash
git add test/
git commit -m "Add characterization tests for the v1 engine"
```

---

### Task 3: Lifecycle fixes — tracked page chains, awaited writes, draining `complete()` — `model: fable`

**Files:**

- Modify: `kiss-ssg.js` — `KissPage.generate()` (lines ~222–272), `Kiss` fields, `copyAssets` (~418–489), `_processPageModel` (~613–658), `page()` (~678–772), `generate()` (~826–837), `complete()` (~839–843), `sitemap()` (~845–911)
- Create: `test/integration/lifecycle.test.js`

**Interfaces:**

- Consumes: `makeSite`, `waitFor`, `Kiss` from the Task 2 helpers.
- Produces: `Kiss._promises` only ever holds handled promises resolving to `{ id, data, error? }`; `Kiss._generating` (array of in-flight `generate()`/`sitemap()` promises); `Kiss._drain()`; `complete(cb)` resolves only when everything queued (including work queued _by_ callbacks) has finished. These carry over into `lib/kiss.js` in Task 12.

- [ ] **Step 1: Write the failing tests**

`test/integration/lifecycle.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import Kiss from '../helpers/kiss.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

describe('a bad model', () => {
  it('is logged and skipped; the rest of the site still builds and nothing rejects', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'ok',
      'src/pages/broken.hbs': 'never',
      'src/models/index.json': { title: 'Home' },
    })
    const kiss = new Kiss({ folders: site.folders })
      .page({ view: 'index.hbs' })
      .page({ view: 'broken.hbs', model: 'missing.json' })
      .generate()
    const data = await kiss.complete()
    expect(await site.exists('public/index.html')).toBe(true)
    expect(await site.exists('public/broken.html')).toBe(false)
    const failed = data.find((d) => d.id === 'missing.json')
    expect(failed.data).toBeNull()
    expect(failed.error).toBeInstanceOf(Object)
  })
})

describe('generate()', () => {
  it('invokes the callback only after the page files exist', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    let existedWhenCalled = null
    const kiss = new Kiss({ folders: site.folders }).scan().generate(() => {
      existedWhenCalled = fs.existsSync(`${site.build}/index.html`)
    })
    await kiss.complete()
    expect(existedWhenCalled).toBe(true)
  })

  it('complete() resolves after pages queued by a generate callback are written too', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'x',
      'src/pages/later.hbs': 'y',
    })
    const kiss = new Kiss({ folders: site.folders })
    kiss.page({ view: 'index.hbs' }).generate(function () {
      this.page({ view: 'later.hbs' }).generate()
    })
    await kiss.complete()
    expect(await site.exists('public/later.html')).toBe(true)
  })

  it('complete() resolves after sitemap.xml is written', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    const kiss = new Kiss({ folders: site.folders, siteUrl: 'https://e.com' })
      .scan()
      .generate()
      .sitemap()
    await kiss.complete()
    expect(await site.exists('public/sitemap.xml')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/integration/lifecycle.test.js`
Expected: the bad-model test fails with an unhandled rejection error reported by Vitest; the callback-timing test fails with `expected false to be true`; the others time out or fail on the missing file.

- [ ] **Step 3: Make `KissPage.generate()` await its writes**

In `kiss-ssg.js` replace the two callback-style writes inside `KissPage.generate()`:

```js
try {
  await fs.outputFile(this.buildTo, minifiedHtml)
} catch (err) {
  console.error(`Error creating ${this.buildTo}`.red)
  console.error(colors.yellow(err))
}

if (this.options && this._dev) {
  try {
    await fs.outputJson(this.buildTo.replace(this._ext, 'json'), this.options, {
      spaces: 2,
    })
  } catch (err) {
    console.error(`Error creating ${this.buildTo}`.red)
    console.error(colors.yellow(err))
  }
}
```

- [ ] **Step 4: Track the whole page chain, never a raw model promise**

In `_processPageModel` delete the line `this._promises.push(p)` (keep `return p`). In `copyAssets`, make the promise resolve on error as well:

```js
            if (err) {
              console.error(`Error copying assets (${sourceDir} => ${targetDir}): `.red)
              console.error(err)
              resolve({ id: assetID, data: null, error: err })
            } else {
```

In `page()`, replace `this._processPageModel(options.model).then((response) => { ... }).catch((error) => { ... })` with a chain that is stored and tracked:

```js
const chain = this._processPageModel(options.model)
  .then((response) => {
    // ...existing body of the .then unchanged...
    return response
  })
  .catch((error) => {
    console.error(colors.red(error.message || error))
    if (error.error) console.error(colors.yellow(error.error))
    return {
      id: typeof options.model === 'string' ? options.model : undefined,
      data: null,
      error,
    }
  })
this._promises.push(chain)
```

- [ ] **Step 5: Await renders in `generate()`, add `_generating` and `_drain()`, make `complete()` drain, track `sitemap()`**

Add the class field `_generating = []` next to `_promises = []`. Replace `generate`, `complete`, and the body of `sitemap` as follows:

```js
  async _drain() {
    let seen = -1
    while (seen !== this._promises.length + this._generating.length) {
      seen = this._promises.length + this._generating.length
      await Promise.all([...this._promises, ...this._generating])
    }
  }

  generate(callback) {
    const run = Promise.all(this._promises)
      .then(async (data) => {
        const pending = []
        this._stack.forEach((entry) => {
          if (entry.runCount === 0) pending.push(entry.page.generate())
          entry.runCount++
        })
        await Promise.all(pending)
        if (callback) callback.call(this, data)
      })
      .catch((err) => {
        console.error('Error generating site'.red)
        console.error(colors.yellow(err))
      })
    this._generating.push(run)
    return this
  }

  complete(callback) {
    return this._drain().then(async () => {
      const data = await Promise.all(this._promises)
      if (callback) callback.call(this, data)
      return data
    })
  }
```

In `sitemap()`: wrap the existing `Promise.all(this._promises).then(() => { ... })` as `const run = Promise.all(this._promises).then(async () => { ... }).catch((err) => { console.error('Error creating sitemap.xml'.red); console.error(colors.yellow(err)) })` and push it: `this._generating.push(run)`. Inside, replace the callback-style `fs.outputFile(sitemapPath, xml, ...)` with `await fs.outputFile(sitemapPath, xml)` followed by `console.log(sitemapPath.green)`, keeping the `if (callback) callback.call(this, urls)` after the write.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: all pass, including Task 2's characterization tests (they poll, so the new timing is fine).

- [ ] **Step 7: Commit**

```bash
git add kiss-ssg.js test/integration/lifecycle.test.js
git commit -m "Track whole page chains, await page writes, make complete() drain queued work"
```

---

### Task 4: ESM conversion of the engine, examples and docs.js — `model: opus`

**Files:**

- Modify: `package.json` (`type`, `engines`, remove `node-fetch`), `kiss-ssg.js`, `libs/utils.js`, `kiss-serve.js`, `docs.js`, `examples/1-scan.js` … `examples/6-sitemap.js`, `examples/2-page/controllers/index.js`, `examples/2-page/controllers/about.js`
- Create: `test/integration/esm.test.js`

**Interfaces:**

- Produces: `kiss-ssg.js` is an ES module with `export default Kiss`, `export { Kiss as 'module.exports' }`, `export { utils }`. `_detectControllerType` and `_prepareMultiplePages` become `async`. `watch()` uses `process.argv[1]`.

- [ ] **Step 1: Write the failing tests**

`test/integration/esm.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import Kiss, { ENTRY } from '../helpers/kiss.js'
import { makeSite } from '../helpers/site.js'

const run = promisify(execFile)
let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

describe('file controllers', () => {
  it('loads an auto-mapped legacy module.exports controller', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{model.name}}',
      'src/models/index.json': { name: 'kiss' },
      'src/controllers/index.js':
        'module.exports = ({ model }) => ({ model: { ...model, name: model.name.toUpperCase() } })',
    })
    const kiss = new Kiss({ folders: site.folders }).scan().generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('KISS')
  })

  it('loads an explicit export-default controller', async () => {
    site = await makeSite({
      'src/pages/about.hbs': '{{title}}',
      'src/controllers/about.mjs':
        'export default () => ({ title: "From ESM" })',
    })
    const kiss = new Kiss({ folders: site.folders })
      .page({ view: 'about.hbs', controller: 'about.mjs' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/about.html')).toBe('From ESM')
  })
})

describe('package entry', () => {
  it('can still be require()d from CommonJS and yields the Kiss class', async () => {
    site = await makeSite({
      'use.cjs': `const Kiss = require(${JSON.stringify(ENTRY)}); console.log(typeof Kiss, typeof Kiss.prototype.page)`,
    })
    const { stdout } = await run(process.execPath, [
      path.join(site.root, 'use.cjs'),
    ])
    expect(stdout.trim()).toBe('function function')
  })

  it('exposes utils as a named export', () => {
    expect(typeof Kiss).toBe('function')
    expect(utils.toSlug('A B')).toBe('a-b')
  })
})
```

Change the first import line of that file to `import Kiss, { ENTRY, utils } from '../helpers/kiss.js'`, and update `test/helpers/kiss.js` so it re-exports the named export too (this only works once the engine is ESM, which is what this task delivers):

```js
import path from 'node:path'
export { default, utils } from '../../kiss-ssg.js'
export const ENTRY = path.resolve('kiss-ssg.js')
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/integration/esm.test.js`
Expected: the file fails to load (`utils` is not exported by the CJS engine) — that is the failing state; after Step 6 the four tests must pass individually.

- [ ] **Step 3: Flip the package to ESM**

In `package.json`: add `"type": "module"`, set `"engines": { "node": ">=22.12.0" }`, set `"version": "2.0.0-alpha.0"`, and remove `"node-fetch"` from dependencies (`npm uninstall node-fetch`).

- [ ] **Step 4: Convert `libs/utils.js`**

Replace `const utils = {` … `module.exports = utils` with the same object as `const utils = { ... }` followed by `export default utils` and drop `resolve` and `stripStartingSlash` (dead code). Keep `trimLines`, `toSlug`, `toTitleCase`, `trimPath`, `sanitizePath` unchanged.

- [ ] **Step 5: Convert `kiss-serve.js`**

```js
import connect from 'connect'
import serveStatic from 'serve-static'
import colors from 'colors'

export default async (httpRoot, port) => {
  if (!httpRoot) httpRoot = '/public'
  if (!port) port = 3000
  const app = connect()
  app.use(function (req, res, next) {
    console.log(req.url)
    next()
  })
  app.use(
    serveStatic(httpRoot, {
      cacheControl: false,
      extensions: ['html', 'htm'],
      index: ['index.html', 'index.htm'],
    }),
  )
  console.log(
    `Serving (${httpRoot}): `.grey,
    colors.yellow('http://localhost:' + port),
  )
  app.listen(port)
  const { default: livereload } = await import('livereload')
  const server = livereload.createServer()
  server.watch(httpRoot)
}
```

- [ ] **Step 6: Convert `kiss-ssg.js`**

Replace the header (lines 1–22) with:

```js
import fs from 'fs-extra'
import glob from 'glob'
import * as sass from 'sass'
import chokidar from 'chokidar'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { minify as htmlMinify } from 'html-minifier-terser'
import colors from 'colors'
import handlebars from 'handlebars'
import layouts from 'handlebars-layouts'
import { Remarkable } from 'remarkable'
import utils from './libs/utils.js'

handlebars.registerHelper(layouts(handlebars))

const md5 = (input) =>
  createHash('md5')
    .update(typeof input === 'string' ? input : JSON.stringify(input))
    .digest('hex')

const remarkable = new Remarkable({ html: true, xhtmlOut: true, breaks: true })
```

(The stray `console.log(typeof utils.trimLines)` goes.) Then:

- In the constructor, replace `const kissServe = require('./kiss-serve')` + call with `import('./kiss-serve.js').then(({ default: kissServe }) => kissServe(publicDir, this.config.port)).catch((error) => { console.error('Error running live reload server'.red); console.log(error.message) })`.
- In `_processPageModel`, no change is needed for `fetch(model)`: with the `node-fetch` import gone it resolves to Node's global `fetch`.
- Make `_detectControllerType` async and load files with `import()`:

```js
  async _detectControllerType(options) {
    if (options.controller) {
      switch (typeof options.controller) {
        case 'string': {
          const controllerPath = path.resolve(
            `${this.config.folders.controllers}/${options.controller}`
          )
          if (fs.existsSync(controllerPath)) {
            const mod = await import(pathToFileURL(controllerPath).href)
            options = this._controllerRun(options, mod.default ?? mod)
          } else {
            console.log(`Failed to find "controller: ${controllerPath}`.red)
          }
          break
        }
        case 'function':
          options = this._controllerRun(options, options.controller)
          break
        default:
          console.error('Unknown controller type: '.red, options.controller, typeof options.controller)
      }
    }
    if (!options.title && options.model && options.model.title) {
      options.title = options.model.title
    }
    return options
  }
```

- Make `_prepareMultiplePages` async, iterating with `for (const model of data) { ...; options = await this._detectControllerType(options); this._preparePage(options); i++ }`.
- In `page()`, make the `.then` handler `async (response) => { ... }`, `await this._prepareMultiplePages(...)`, and `options = await this._detectControllerType(options)`.
- In `watch()`, replace the `if (module.parent.filename) { chokidar.watch(module.parent.filename)...` block with `const entry = process.argv[1]; if (entry) { chokidar.watch(entry).on('change', ...) }`.
- Replace `module.exports = Kiss` with:

```js
export default Kiss
export { Kiss as 'module.exports' }
export { utils }
```

- [ ] **Step 7: Convert the examples and docs.js**

Pattern for every `examples/N-*.js`: `const Kiss = require('../kiss-ssg')` → `import Kiss from '../kiss-ssg.js'`. `examples/3-pages.js` additionally: delete `const utils = require('../libs/utils.js')` and use `import Kiss, { utils } from '../kiss-ssg.js'`. Controllers: `examples/2-page/controllers/index.js` and `about.js` — `module.exports = (...) =>` → `export default (...) =>`. `docs.js` becomes:

```js
import Kiss from './kiss-ssg.js'

new Kiss({
  dev: true,
  verbose: true,
  folders: { build: 'docs' },
})
  .scan()
  .generate()
```

- [ ] **Step 8: Run tests and smoke-run the non-dev examples**

Run: `npm test` — Expected: all pass.
Run (bash tool; `timeout` kills the dev-mode examples after their build): `cd examples && for n in 1-scan 2-page 3-pages 4-layouts-and-partials 5-helpers 6-sitemap; do timeout 10 node $n.js > /dev/null 2>&1; echo "$n exit $?"; done; ls ../public`
Expected: each example prints exit `0` or `124` (killed while serving — fine) and `../public/` contains a folder per example with html inside. Any stack trace mentioning `require`, `module`, or `ERR_REQUIRE_ESM` is a conversion miss.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json kiss-ssg.js libs/utils.js kiss-serve.js docs.js examples test/integration/esm.test.js
git commit -m "Convert the engine, examples and docs to ESM; load controllers with import()"
```

---

### Task 5: Flat ESLint config and dependency pruning — `model: sonnet`

**Files:**

- Delete: `.eslintrc.js`
- Create: `eslint.config.js`
- Modify: `package.json` (devDependencies, `lint` script, remove `pretty`, `highlight.js`, `md5`), `kiss-ssg.js` (the `md5` import is already gone in Task 4 — verify), `libs/utils.js` (add `hashId`)
- Modify: `test/unit/utils.test.js`

**Interfaces:**

- Produces: `npm run lint`; `utils.hashId(input: string | object) → string` (md5 hex of the string, or of `JSON.stringify(object)`).

- [ ] **Step 1: Write the failing `hashId` test**

Append to `test/unit/utils.test.js`:

```js
describe('utils.hashId', () => {
  it('hashes strings and objects deterministically, and objects by content', () => {
    expect(utils.hashId('a')).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(utils.hashId({ a: 1 })).toBe(utils.hashId({ a: 1 }))
    expect(utils.hashId({ a: 1 })).not.toBe(utils.hashId({ a: 2 }))
  })
})
```

Run: `npm test` — Expected: FAIL, `utils.hashId is not a function`.

- [ ] **Step 2: Add `hashId`, remove the packages**

In `libs/utils.js` add `import { createHash } from 'node:crypto'` at the top and this member to the object:

```js
  hashId(input) {
    const text = typeof input === 'string' ? input : JSON.stringify(input)
    return createHash('md5').update(text).digest('hex')
  },
```

In `kiss-ssg.js` replace the local `const md5 = ...` helper (from Task 4) with calls to `utils.hashId(...)` at the two call sites (`copyAssets` asset id, `_processPageModel` object case), and delete the `createHash` import there.

```bash
npm uninstall pretty highlight.js md5
```

- [ ] **Step 3: Replace `.eslintrc.js` with a flat config**

```bash
git rm .eslintrc.js
npm install --save-dev eslint @eslint/js globals eslint-config-prettier@latest
```

`eslint.config.js`:

```js
import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none' }],
    },
  },
  {
    ignores: [
      'docs/**',
      'public/**',
      'examples/**/assets/**',
      'src/**',
      'coverage/**',
    ],
  },
]
```

Add `"lint": "eslint ."` to `package.json` scripts.

- [ ] **Step 4: Verify**

Run: `npm test` — Expected: all pass.
Run: `npm run lint` — Expected: exits 0 (warnings allowed, no errors). Fix any _error_ it reports in files you touched; do not silence rules.
Run: `grep -rn "require('md5')\|from 'md5'\|node-fetch\|pretty\|highlight.js" kiss-ssg.js libs docs.js examples/*.js package.json` — Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Replace .eslintrc with flat config; drop pretty, highlight.js, md5 and node-fetch"
```

---

### Task 6: Extract `lib/utils.js`, `lib/logger.js`, `lib/config.js`; route all logging through the logger — `model: sonnet`

**Files:**

- Create: `lib/utils.js`, `lib/logger.js`, `lib/config.js`
- Create: `test/unit/logger.test.js`, `test/unit/config.test.js`; move `test/unit/utils.test.js` import to `../../lib/utils.js`
- Delete: `libs/` (whole folder, including `libs/on-ice/`)
- Modify: `kiss-ssg.js` (import from `./lib/...`; constructor uses `resolveConfig`; `_setupFolders` uses `foldersToEnsure`; **every** `console.*` and `'…'.colour` replaced by logger calls), `kiss-serve.js` (same), `vitest.config.mjs` (coverage include drop `libs/**`)
- Create: `test/integration/config.test.js`

**Interfaces:**

- Produces:
  - `lib/utils.js`: named exports `trimLines`, `toSlug`, `toTitleCase`, `trimPath`, `sanitizePath`, `hashId`; default export is the object of all six.
  - `lib/logger.js`: `createLogger({ verbose = false, silent = false } = {})` → `{ verbose, banner, info, success, highlight, notice, warn, error, debug, plain }` (each `(...args) => void`); `silentLogger`; default export `createLogger()`.
  - `lib/config.js`: `DEFAULT_FOLDERS`, `DEFAULT_CONFIG`, `resolveFolders(userFolders)`, `resolveConfig(userConfig)` (returns a config with `.folders` resolved and `.logger` **not** touched), `foldersToEnsure(folders)` → string[].
  - `Kiss` accepts `config.logger` (a logger object); otherwise creates `createLogger({ verbose: config.verbose })`. Stored as `this.logger`.

- [ ] **Step 1: Write the failing unit tests**

`test/unit/logger.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { createLogger, silentLogger } from '../../lib/logger.js'

const METHODS = [
  'banner',
  'info',
  'success',
  'highlight',
  'notice',
  'warn',
  'error',
  'debug',
  'plain',
]

describe('createLogger', () => {
  it('exposes the full interface', () => {
    const logger = createLogger()
    for (const m of METHODS) expect(typeof logger[m]).toBe('function')
  })

  it('writes errors to console.error and info to console.log', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = createLogger()
    logger.info('hello')
    logger.error('bad')
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0][0])).toContain('hello')
    expect(String(error.mock.calls[0][0])).toContain('bad')
    log.mockRestore()
    error.mockRestore()
  })

  it('only emits debug when verbose', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    createLogger().debug('x')
    expect(debug).not.toHaveBeenCalled()
    createLogger({ verbose: true }).debug('x')
    expect(debug).toHaveBeenCalledTimes(1)
    debug.mockRestore()
  })

  it('silentLogger writes nothing', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    silentLogger.info('x')
    silentLogger.banner('x')
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
```

`test/unit/config.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  resolveConfig,
  resolveFolders,
  foldersToEnsure,
  DEFAULT_FOLDERS,
} from '../../lib/config.js'

describe('resolveFolders', () => {
  it('returns the defaults when nothing is given', () => {
    expect(resolveFolders()).toEqual(DEFAULT_FOLDERS)
  })

  it('re-derives every subfolder from src, unless explicitly set', () => {
    const f = resolveFolders({ src: './site', build: 'out', models: null })
    expect(f.pages).toBe('./site/pages')
    expect(f.partials).toBe('./site/partials')
    expect(f.build).toBe('out')
    expect(f.models).toBeNull()
  })
})

describe('resolveConfig', () => {
  it('applies defaults and merges sass options', () => {
    const c = resolveConfig({ verbose: true, sass: { includePaths: ['x'] } })
    expect(c.dev).toBe(false)
    expect(c.cleanBuild).toBe(true)
    expect(c.port).toBe(3001)
    expect(c.verbose).toBe(true)
    expect(c.sass.includePaths).toEqual(['x'])
    expect(c.folders.pages).toBe('./src/pages')
  })
})

describe('foldersToEnsure', () => {
  it('lists every non-null folder that Kiss must create, regardless of assets', () => {
    const list = foldersToEnsure(resolveFolders({ src: 's', assets: null }))
    expect(list).toContain('s/layouts')
    expect(list).toContain('s/partials')
    expect(list).toContain('s/models')
    expect(list).toContain('s/controllers')
    expect(list).not.toContain(null)
  })
})
```

`test/integration/config.test.js` (proves behavior fix 3 through the real constructor):

```js
import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

describe('folder creation', () => {
  it('creates partials/layouts/models/controllers even when assets is null', async () => {
    site = await makeSite({})
    new Kiss({
      folders: { ...site.folders, assets: null },
      logger: silentLogger,
    })
    expect(await site.exists('src/partials')).toBe(true)
    expect(await site.exists('src/layouts')).toBe(true)
    expect(await site.exists('src/models')).toBe(true)
    expect(await site.exists('src/controllers')).toBe(true)
  })
})
```

Update the import at the top of `test/unit/utils.test.js` to `import utils from '../../lib/utils.js'`.

Run: `npm test` — Expected: the new files fail to import (`lib/...` missing).

- [ ] **Step 2: Create the three modules**

`lib/utils.js`:

```js
import { createHash } from 'node:crypto'

export function trimLines(lines) {
  let text = ''
  lines.split('\n').forEach((line) => {
    text = text + line.trim() + '\n'
  })
  return text
}

export function toSlug(slug) {
  return slug
    .toLowerCase()
    .trim()
    .replace(/[\W_]+/g, '-')
}

export function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function trimPath(path) {
  if (path.startsWith('/')) path = path.substring(1)
  if (path.endsWith('/')) path = path.substring(0, path.length - 1)
  return path
}

export function sanitizePath(path) {
  if (!path) return path
  return trimPath(path)
    .split('/')
    .map((segment) => toSlug(segment).trim())
    .join('/')
}

export function hashId(input) {
  const text = typeof input === 'string' ? input : JSON.stringify(input)
  return createHash('md5').update(text).digest('hex')
}

const utils = { trimLines, toSlug, toTitleCase, trimPath, sanitizePath, hashId }
export default utils
```

`lib/logger.js`:

```js
// The only module allowed to import `colors`. It extends String.prototype as
// a side effect; nothing else in lib/ may rely on that.
import colors from 'colors'

const paint = (color, args) =>
  args.map((a) => (typeof a === 'string' ? colors[color](a) : a))

export function createLogger({ verbose = false, silent = false } = {}) {
  const out =
    (fn, color) =>
    (...args) => {
      if (!silent) fn(...paint(color, args))
    }
  return {
    verbose,
    banner: out(console.log, 'zebra'),
    info: out(console.log, 'grey'),
    success: out(console.log, 'green'),
    highlight: out(console.log, 'blue'),
    notice: out(console.log, 'cyan'),
    warn: out(console.warn, 'yellow'),
    error: out(console.error, 'red'),
    debug: (...args) => {
      if (!silent && verbose) console.debug(...paint('grey', args))
    },
    plain: (...args) => {
      if (!silent) console.log(...args)
    },
  }
}

export const silentLogger = createLogger({ silent: true })
export default createLogger()
```

`lib/config.js`:

```js
export const DEFAULT_FOLDERS = Object.freeze({
  root: './',
  src: './src',
  pages: './src/pages',
  build: './public',
  assets: './src/assets',
  static: './src/static',
  layouts: './src/layouts',
  partials: './src/partials',
  models: './src/models',
  controllers: './src/controllers',
})

export const DEFAULT_CONFIG = Object.freeze({
  dev: false,
  verbose: false,
  cleanBuild: true,
  extensionLess: false,
  sass: { includePaths: [] },
  port: 3001,
})

const DERIVED_FROM_SRC = [
  'assets',
  'static',
  'layouts',
  'pages',
  'partials',
  'models',
  'controllers',
]

export function resolveFolders(userFolders = {}) {
  const folders = { ...DEFAULT_FOLDERS }
  if (userFolders.src) {
    folders.src = userFolders.src
    for (const key of DERIVED_FROM_SRC)
      folders[key] = `${userFolders.src}/${key}`
  }
  return { ...folders, ...userFolders }
}

export function resolveConfig(userConfig = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    sass: { ...DEFAULT_CONFIG.sass, ...(userConfig.sass || {}) },
  }
  config.folders = resolveFolders(userConfig.folders)
  return config
}

// Every folder Kiss creates on start-up. v1 only created most of these when
// `assets` was set (a copy-paste bug); each folder now stands on its own.
export function foldersToEnsure(folders) {
  return [
    'src',
    'pages',
    'build',
    'assets',
    'layouts',
    'partials',
    'models',
    'controllers',
  ]
    .map((key) => folders[key])
    .filter(Boolean)
}
```

- [ ] **Step 3: Wire them into `kiss-ssg.js` and `kiss-serve.js`; delete `libs/`**

- `import utils from './lib/utils.js'`, `import { createLogger } from './lib/logger.js'`, `import { resolveConfig, foldersToEnsure } from './lib/config.js'`. Remove `import colors from 'colors'` from `kiss-ssg.js` and `kiss-serve.js`.
- Constructor: replace the hand-rolled defaults/folders block (from `let folders = {` through `this.verbose = !!this.config.verbose`) with:

```js
this.config = resolveConfig(config)
this.logger =
  this.config.logger || createLogger({ verbose: this.config.verbose })
this.verbose = !!this.config.verbose
this.logger.banner('            Starting Kiss            \n')
this.logger.debug('config: ', this.config)
```

- `_setupFolders`: replace the eight `ensureDirSync` calls with `foldersToEnsure(this.config.folders).forEach((f) => fs.ensureDirSync(f))`, keeping the `cleanBuild` block.
- Pass the logger to `KissPage`: add a `logger` field on `KissPage`, set `kissPage.logger = this.logger` in `_preparePage`, and default it to `createLogger()` in the `KissPage` constructor so the class still works standalone.
- Replace every remaining `console.*` call and every `'text'.colour` / `colors.colour(x)` in both files using this mapping: `.zebra` → `logger.banner`; `.grey`/`.gray` → `logger.info`; `.green` → `logger.success`; `.blue` → `logger.highlight`; `.cyan` → `logger.notice`; `.yellow` / `console.warn` → `logger.warn`; `.red` / `console.error` → `logger.error`; `console.debug` / `if (this.verbose) console.log` → `logger.debug`; uncoloured `console.log` (e.g. the request-url line in `kiss-serve.js`, the `viewStats` object) → `logger.plain`. `kiss-serve.js`'s export gains a third parameter `logger` (default `createLogger()`), and the constructor passes `this.logger`.
- `git rm -r libs`. In `vitest.config.mjs` change coverage `include` to `['lib/**', 'kiss-ssg.js', 'kiss-serve.js']`.

- [ ] **Step 4: Verify no stragglers, run everything**

Run: `grep -n "console\.\|\.red\b\|\.grey\b\|\.gray\b\|\.green\b\|\.blue\b\|\.cyan\b\|\.yellow\b\|\.zebra\b\|from 'colors'" kiss-ssg.js kiss-serve.js`
Expected: no matches.
Run: `npm test` — Expected: all pass.
Run: `npm run lint` — Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Extract utils, logger and config into lib/; route all output through the logger"
```

---

### Task 7: Extract `handlebars-helpers`, `partials`, `assets`; per-instance Handlebars and Remarkable — `model: opus`

**Files:**

- Create: `lib/handlebars-helpers.js`, `lib/partials.js`, `lib/assets.js`
- Create: `test/unit/handlebars-helpers.test.js`, `test/unit/partials.test.js`, `test/unit/assets.test.js`
- Modify: `kiss-ssg.js` (delete `registerHandlebarsHelpers`, `registerPartials`/`_registerPartials`, `copyAssets` bodies; create per-instance envs; `KissPage` compiles on the instance env)
- Create: `test/integration/isolation.test.js`

**Interfaces:**

- Produces:
  - `registerHandlebarsHelpers(hbs, config, { markdown, logger })` → `hbs`.
  - `registerPartials(hbs, config, { markdown, logger })` → `string[]` of registered partial names; `registerPartialsFrom(hbs, folder, ext, deps)`.
  - `copyAssets(sourceDir, targetDir, { config, logger })` → `Promise<{ id, data, error? }>` (never rejects).
  - `Kiss` creates `this.handlebars = Handlebars.create()` (with `layouts` registered on it) and `this.remarkable = new Remarkable({ html: true, xhtmlOut: true, breaks: true })` per instance; `KissPage` receives `hbs` (field `hbs`) and calls `this.hbs.compile`.

- [ ] **Step 1: Write the failing tests**

`test/unit/handlebars-helpers.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import Handlebars from 'handlebars'
import { Remarkable } from 'remarkable'
import { registerHandlebarsHelpers } from '../../lib/handlebars-helpers.js'
import { silentLogger } from '../../lib/logger.js'

let hbs
const render = (src, ctx = {}) => hbs.compile(src)(ctx)

beforeEach(() => {
  hbs = Handlebars.create()
  registerHandlebarsHelpers(
    hbs,
    { dev: false, sass: { includePaths: [] } },
    {
      markdown: new Remarkable({ html: true, xhtmlOut: true, breaks: true }),
      logger: silentLogger,
    },
  )
})

describe('markdown', () => {
  it('renders a block and an inline string', () => {
    expect(render('{{#markdown}}# Hi{{/markdown}}')).toContain('<h1>Hi</h1>')
    expect(render('{{markdown text}}', { text: '**b**' })).toContain(
      '<strong>b</strong>',
    )
  })
})

describe('sass', () => {
  it('compiles an inline block', () => {
    expect(render('{{#sass}}$c: red; a { color: $c }{{/sass}}')).toContain(
      'color: red',
    )
  })
})

describe('offset and stringify', () => {
  it('offset adds one; stringify pretty-prints', () => {
    expect(render('{{offset i}}', { i: 0 })).toBe('1')
    expect(render('{{{stringify o}}}', { o: { a: 1 } })).toBe(
      JSON.stringify({ a: 1 }, null, 3),
    )
  })
})

describe('isActive', () => {
  const tpl = '{{#isActive page href=href}}[{{active}}]{{/isActive}}'
  it('matches the page URL exactly, treating index as /', () => {
    expect(
      render(tpl, { page: { pageURL: 'about.html' }, href: '/about' }),
    ).toBe('[active]')
    expect(render(tpl, { page: { pageURL: 'index.html' }, href: '/' })).toBe(
      '[active]',
    )
    expect(
      render(tpl, { page: { pageURL: 'about.html' }, href: '/contact' }),
    ).toBe('[]')
  })
  it('matches by folder when folderMatch is set', () => {
    const t =
      '{{#isActive page href="/docs" folderMatch=true}}[{{active}}]{{/isActive}}'
    expect(render(t, { page: { pageURL: 'docs/intro.html' } })).toBe('[active]')
  })
})

describe('env', () => {
  it('chooses the branch by config.dev', () => {
    expect(render('{{#env is="prod"}}P{{else}}D{{/env}}')).toBe('P')
    const dev = Handlebars.create()
    registerHandlebarsHelpers(
      dev,
      { dev: true, sass: { includePaths: [] } },
      {
        markdown: new Remarkable(),
        logger: silentLogger,
      },
    )
    expect(dev.compile('{{#env is="dev"}}D{{else}}P{{/env}}')({})).toBe('D')
  })
})
```

`test/unit/partials.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import Handlebars from 'handlebars'
import { Remarkable } from 'remarkable'
import { registerPartials } from '../../lib/partials.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})

describe('registerPartials', () => {
  it('registers hbs, html and md partials by path-derived name, and layouts', async () => {
    site = await makeSite({
      'src/partials/nav.hbs': '<nav/>',
      'src/partials/layout/footer.html': '<footer/>',
      'src/partials/note.md': '# Note',
      'src/layouts/main.hbs': '<main/>',
    })
    const hbs = Handlebars.create()
    const names = registerPartials(
      hbs,
      {
        folders: {
          partials: `${site.src}/partials`,
          layouts: `${site.src}/layouts`,
        },
      },
      { markdown: new Remarkable(), logger: silentLogger },
    )
    expect(names.sort()).toEqual(['layout/footer', 'main', 'nav', 'note'])
    expect(hbs.partials['note']).toContain('<h1>Note</h1>')
  })

  it('skips null folders', () => {
    const hbs = Handlebars.create()
    const names = registerPartials(
      hbs,
      { folders: { partials: null, layouts: null } },
      { markdown: new Remarkable(), logger: silentLogger },
    )
    expect(names).toEqual([])
  })
})
```

`test/unit/assets.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import { copyAssets } from '../../lib/assets.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})
const deps = {
  config: { dev: false, sass: { includePaths: [] } },
  logger: silentLogger,
}

describe('copyAssets', () => {
  it('compiles sass and copies the rest', async () => {
    site = await makeSite({
      'a/css/x.scss': '$c: red; b { color: $c }',
      'a/robots.txt': 'ok',
    })
    const result = await copyAssets(`${site.root}/a`, `${site.root}/out`, deps)
    expect(typeof result.id).toBe('string')
    expect(result.data).toContain('Copied assets')
    expect(await site.read('out/css/x.css')).toContain('color:red')
    expect(await site.read('out/robots.txt')).toBe('ok')
    expect(await site.exists('out/css/x.scss')).toBe(false)
  })

  it('resolves (does not reject or hang) when the source is missing', async () => {
    site = await makeSite({})
    const result = await copyAssets(
      `${site.root}/nope`,
      `${site.root}/out`,
      deps,
    )
    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it('resolves with null data when a folder is not given', async () => {
    const result = await copyAssets(null, 'x', deps)
    expect(result.data).toBeNull()
  })
})
```

`test/integration/isolation.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

const sites = []
afterEach(async () => {
  while (sites.length) await sites.pop().cleanup()
})

describe('per-instance Handlebars', () => {
  it('does not leak partials or helpers between Kiss instances', async () => {
    const a = await makeSite({
      'src/partials/p.hbs': 'A',
      'src/pages/index.hbs': '{{> p}}',
    })
    const b = await makeSite({ 'src/pages/index.hbs': '{{> p}}' })
    sites.push(a, b)
    const ka = new Kiss({ folders: a.folders, logger: silentLogger })
    ka.handlebars.registerHelper('only', () => 'x')
    const kb = new Kiss({ folders: b.folders, logger: silentLogger })
    expect(ka.handlebars).not.toBe(kb.handlebars)
    expect(kb.handlebars.partials['p']).toBeUndefined()
    expect(kb.handlebars.helpers['only']).toBeUndefined()
    expect(typeof kb.handlebars.helpers['extend']).toBe('function') // handlebars-layouts applied per instance
    await ka.scan().generate().complete()
    expect(await a.read('public/index.html')).toBe('A')
  })
})
```

Run: `npm test` — Expected: new files fail on missing modules / `kb.handlebars.partials['p']` is defined (global leak).

- [ ] **Step 2: Create the three modules**

`lib/handlebars-helpers.js`:

```js
import path from 'node:path'
import * as sass from 'sass'
import { trimLines } from './utils.js'

export function registerHandlebarsHelpers(hbs, config, { markdown, logger }) {
  hbs.registerHelper('markdown', function (obj) {
    let text = ''
    if (typeof obj === 'object') {
      text = obj.fn(this)
    } else if (typeof obj === 'string') {
      text = obj
    } else if (typeof obj === 'undefined') {
      logger.warn('Undefined value passed to markdown helper:')
    } else {
      logger.error('Unexpected object in the bagging area!')
      logger.warn(
        'Markdown helper has an unexpected object type of:',
        typeof obj,
      )
    }
    return new hbs.SafeString(markdown.render(trimLines(text)))
  })

  hbs.registerHelper('sass', function (context, options) {
    const style = config.dev ? 'expanded' : 'compressed'
    const loadPaths = config.sass.includePaths
    let output = ''
    if (typeof context === 'string') {
      const result = sass.compile(path.join(process.cwd(), context), {
        loadPaths,
        style,
      })
      output = `${output} \n${result.css}`
    }
    const block =
      options && options.fn ? options : context && context.fn ? context : null
    if (block) {
      const result = sass.compileString(block.fn(this), { loadPaths })
      output = `${output} \n${result.css}`
    }
    return new hbs.SafeString(output)
  })

  hbs.registerHelper('offset', (index) => index + 1)

  hbs.registerHelper('stringify', (obj) => JSON.stringify(obj, null, 3))

  hbs.registerHelper('isActive', function (pageOptions, options) {
    let context = { href: '', active: 'active', folderMatch: false }
    if (options && options.hash) context = { ...context, ...options.hash }
    const activeClass = context.active
    context.active = ''
    let pageURL = pageOptions.pageURL
    pageURL = pageURL.substring(0, pageURL.lastIndexOf('.'))
    pageURL = pageURL.replace(/index$/, '')
    context.pageURL = pageURL
    const noSlashHref = context.href.replace(/^\//, '')
    if (context.folderMatch) {
      if (pageURL.includes(noSlashHref)) context.active = activeClass
    } else if (pageURL == noSlashHref) {
      context.active = activeClass
    }
    return options.fn(context)
  })

  hbs.registerHelper('env', function (options) {
    if (!options.hash.is) {
      logger.error('Environment helper missing "is" property', '{{#env}')
      return ''
    }
    const envIs = options.hash.is.toLowerCase()
    if (envIs.includes('dev') && config.dev) return options.fn(this)
    if (envIs.includes('prod') && !config.dev) return options.fn(this)
    return options.inverse(this)
  })

  return hbs
}
```

`lib/partials.js`:

```js
import fs from 'fs-extra'
import glob from 'glob'

export function registerPartialsFrom(hbs, folder, ext, { markdown, logger }) {
  if (!folder) return []
  const files = glob.sync(`${folder}/**/*.${ext}`)
  return files.map((file) => {
    let name = file.slice(folder.length).replace(new RegExp(`\\.${ext}$`), '')
    if (name.startsWith('/')) name = name.slice(1)
    let source = fs.readFileSync(file, 'utf8')
    if (ext === 'md') source = markdown.render(source)
    hbs.registerPartial(name, source)
    logger.highlight(name)
    return name
  })
}

export function registerPartials(hbs, config, deps) {
  deps.logger.info('Registering partials:')
  const { partials, layouts } = config.folders
  return [
    ...registerPartialsFrom(hbs, partials, 'html', deps),
    ...registerPartialsFrom(hbs, partials, 'md', deps),
    ...registerPartialsFrom(hbs, partials, 'hbs', deps),
    ...registerPartialsFrom(hbs, layouts, 'hbs', deps),
  ]
}
```

`lib/assets.js`:

```js
import fs from 'fs-extra'
import glob from 'glob'
import * as sass from 'sass'
import { hashId } from './utils.js'

const isSass = (file) => /\.(scss|sass)$/i.test(file)

export function compileSassFiles(sourceDir, targetDir, { config, logger }) {
  return glob.sync(`${sourceDir}/**/*.+(scss|sass)`).map(async (sassFile) => {
    const cssFile =
      sassFile.replace(sourceDir, targetDir).replace(/\.[^.]+$/, '') + '.css'
    try {
      const { css } = sass.compile(sassFile, {
        loadPaths: config.sass.includePaths,
        style: config.dev ? 'expanded' : 'compressed',
      })
      await fs.outputFile(cssFile, css)
      logger.success(cssFile)
    } catch (err) {
      logger.error('Error parsing sass file: ', sassFile)
      logger.warn(err.message)
    }
  })
}

// Always resolves: generate() waits on this, and a rejected or forever-pending
// promise here would hang or crash the whole build.
export async function copyAssets(sourceDir, targetDir, { config, logger }) {
  const id = hashId(`${sourceDir} - ${targetDir}`)
  if (!sourceDir || !targetDir) return { id, data: null }
  await Promise.all(compileSassFiles(sourceDir, targetDir, { config, logger }))
  try {
    await fs.copy(sourceDir, targetDir, { filter: (src) => !isSass(src) })
    const msg = `Copied assets: ${sourceDir} to ${targetDir}`
    logger.info(msg)
    return { id, data: msg }
  } catch (err) {
    logger.error(`Error copying assets (${sourceDir} => ${targetDir}): `)
    logger.error(err)
    return { id, data: null, error: err }
  }
}
```

- [ ] **Step 3: Wire into `kiss-ssg.js`**

- Delete the module-level `handlebars.registerHelper(layouts(handlebars))`, the module-level `remarkable`, the whole `registerHandlebarsHelpers` function, `registerPartials`/`_registerPartials`, and the body of `copyAssets`.
- Class fields: remove `handlebars = handlebars` / `remarkable = remarkable`. In the constructor, right after the logger is set up:

```js
this.handlebars = handlebars.create()
this.handlebars.registerHelper(layouts(this.handlebars))
this.remarkable = new Remarkable({ html: true, xhtmlOut: true, breaks: true })
```

and replace `registerHandlebarsHelpers(this.config)` / `this.registerPartials()` with `registerHandlebarsHelpers(this.handlebars, this.config, { markdown: this.remarkable, logger: this.logger })` and `this.registerPartials()` where:

```js
  registerPartials() {
    return registerPartials(this.handlebars, this.config, {
      markdown: this.remarkable,
      logger: this.logger,
    })
  }

  copyAssets(sourceDir, targetDir) {
    this._promises.push(
      copyAssets(sourceDir, targetDir, { config: this.config, logger: this.logger })
    )
    return this
  }
```

- `KissPage`: add a `hbs` field; `_getTemplate` uses `this.hbs.compile(viewText)`; `_preparePage` sets `kissPage.hbs = this.handlebars`.
- Imports: `import Handlebars from 'handlebars'` (used as `Handlebars.create()`), keep `layouts`, `Remarkable`; add the three `./lib/...` imports; drop `sass`, `glob` imports if now unused in `kiss-ssg.js` (`glob` is still used by `scan()` and `_prepareModelsFromFolder`).

- [ ] **Step 4: Run everything**

Run: `npm test` — Expected: all pass. Run: `npm run lint` — no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Extract handlebars helpers, partials and assets; isolate Handlebars/Remarkable per instance"
```

---

### Task 8: Extract `model-resolver` and `controller-resolver` — `model: opus`

**Files:**

- Create: `lib/model-resolver.js`, `lib/controller-resolver.js`
- Create: `test/unit/model-resolver.test.js`, `test/unit/controller-resolver.test.js`
- Modify: `kiss-ssg.js` (delete `_readModel`, `_prepareModelsFromFolder`, `_processPageModel`, `_controllerRun`, `_detectControllerType`; call the modules)

**Interfaces:**

- Produces:
  - `resolveModel(model, { modelsDir, logger, fetchImpl = globalThis.fetch })` → `Promise<{ id?, data }>`; rejects with `Error` (message as v1: `Skipping: <file>`, `Invalid model <name>`, `Error getting model from <url>`, `Unexpected model type: <type>`; the fetch error is attached as `.error`).
  - `readModelFile(modelsDir, file, { logger })` → object | null; `readModelsFromFolder(modelsDir, folder, { logger })` → object[].
  - `applyController(options, { controllersDir, logger })` → `Promise<options>`; `runController(options, fn, { logger })` → options; `loadController(controllersDir, file, { logger })` → `Promise<fn | null>`.

- [ ] **Step 1: Write the failing tests**

`test/unit/model-resolver.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import { resolveModel } from '../../lib/model-resolver.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})
const deps = (modelsDir, extra = {}) => ({
  modelsDir,
  logger: silentLogger,
  ...extra,
})

describe('resolveModel', () => {
  it('reads a json file relative to modelsDir', async () => {
    site = await makeSite({ 'm/a.json': { x: 1 } })
    await expect(
      resolveModel('a.json', deps(`${site.root}/m`)),
    ).resolves.toEqual({ id: 'a.json', data: { x: 1 } })
  })

  it('rejects a missing json file with a Skipping message', async () => {
    site = await makeSite({})
    await expect(
      resolveModel('nope.json', deps(`${site.root}/m`)),
    ).rejects.toThrow('Skipping: nope.json')
  })

  it('loads every json in a folder as an array', async () => {
    site = await makeSite({
      'm/team/a.json': { n: 'a' },
      'm/team/b.json': { n: 'b' },
    })
    const { data } = await resolveModel('team', deps(`${site.root}/m`))
    expect(data).toEqual([{ n: 'a' }, { n: 'b' }])
  })

  it('rejects an unknown folder', async () => {
    site = await makeSite({})
    await expect(resolveModel('ghost', deps(`${site.root}/m`))).rejects.toThrow(
      'Invalid model ghost',
    )
  })

  it('fetches http(s) models with the injected fetch', async () => {
    const fetchImpl = async (url) => ({ json: async () => ({ url }) })
    await expect(
      resolveModel('https://x/y', deps('m', { fetchImpl })),
    ).resolves.toEqual({
      id: 'https://x/y',
      data: { url: 'https://x/y' },
    })
  })

  it('rejects when fetch fails, attaching the cause', async () => {
    const fetchImpl = async () => {
      throw new Error('boom')
    }
    await expect(
      resolveModel('http://x', deps('m', { fetchImpl })),
    ).rejects.toMatchObject({ message: 'boom' })
  })

  it('passes objects through with a content hash id, and undefined as {}', async () => {
    const a = await resolveModel({ k: 1 }, deps('m'))
    const b = await resolveModel({ k: 1 }, deps('m'))
    expect(a.data).toEqual({ k: 1 })
    expect(a.id).toBe(b.id)
    await expect(resolveModel(undefined, deps('m'))).resolves.toEqual({
      data: {},
    })
  })

  it('rejects other types', async () => {
    await expect(resolveModel(42, deps('m'))).rejects.toThrow(
      'Unexpected model type: number',
    )
  })
})
```

`test/unit/controller-resolver.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import { applyController } from '../../lib/controller-resolver.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})
const deps = (controllersDir = 'c') => ({
  controllersDir,
  logger: silentLogger,
})

describe('applyController', () => {
  it('merges what a function controller returns', async () => {
    const out = await applyController(
      { view: 'v', controller: () => ({ title: 'T' }) },
      deps(),
    )
    expect(out.title).toBe('T')
    expect(out.view).toBe('v')
  })

  it('loads a module.exports controller and an export-default controller by filename', async () => {
    site = await makeSite({
      'c/legacy.js': 'module.exports = () => ({ title: "legacy" })',
      'c/modern.mjs': 'export default () => ({ title: "modern" })',
    })
    expect(
      (
        await applyController(
          { controller: 'legacy.js' },
          deps(`${site.root}/c`),
        )
      ).title,
    ).toBe('legacy')
    expect(
      (
        await applyController(
          { controller: 'modern.mjs' },
          deps(`${site.root}/c`),
        )
      ).title,
    ).toBe('modern')
  })

  it('leaves options alone when the file is missing or the controller throws', async () => {
    site = await makeSite({})
    const missing = await applyController(
      { controller: 'nope.js', title: 'keep' },
      deps(`${site.root}/c`),
    )
    expect(missing.title).toBe('keep')
    const thrown = await applyController(
      {
        title: 'keep',
        controller: () => {
          throw new Error('x')
        },
      },
      deps(),
    )
    expect(thrown.title).toBe('keep')
  })

  it('falls back to model.title when no title is set', async () => {
    const out = await applyController(
      { model: { title: 'From model' } },
      deps(),
    )
    expect(out.title).toBe('From model')
  })
})
```

Run: `npm test` — Expected: the two new files fail on missing modules.

- [ ] **Step 2: Create the modules**

`lib/model-resolver.js`:

```js
import fs from 'fs-extra'
import glob from 'glob'
import { hashId } from './utils.js'

export function readModelFile(modelsDir, file, { logger }) {
  const modelPath = `${modelsDir}/${file}`
  if (fs.existsSync(modelPath))
    return JSON.parse(fs.readFileSync(modelPath, 'utf8'))
  logger.error('Can not find model on file system', modelPath)
  return null
}

export function readModelsFromFolder(modelsDir, folder, { logger }) {
  const folderPath = `${modelsDir}/${folder}`
  if (!fs.existsSync(folderPath) || !fs.lstatSync(folderPath).isDirectory())
    return []
  return glob
    .sync(`${folderPath}/*.json`)
    .map((file) =>
      readModelFile(modelsDir, file.slice(modelsDir.length + 1), { logger }),
    )
    .filter(Boolean)
}

export async function resolveModel(
  model,
  { modelsDir, logger, fetchImpl = globalThis.fetch },
) {
  switch (typeof model) {
    case 'string': {
      if (model.startsWith('http')) {
        try {
          const response = await fetchImpl(model)
          return { id: model, data: await response.json() }
        } catch (error) {
          logger.error(`Error getting model from ${model}`)
          throw Object.assign(new Error(error.message), { error })
        }
      }
      if (model.endsWith('.json')) {
        const data = readModelFile(modelsDir, model, { logger })
        if (data) return { id: model, data }
        throw new Error(`Skipping: ${model}`)
      }
      const data = readModelsFromFolder(modelsDir, model, { logger })
      if (data.length > 0) return { id: model, data }
      throw new Error(`Invalid model ${model}`)
    }
    case 'object':
      return { id: hashId(model), data: model }
    case 'undefined':
      return { data: {} }
    default:
      throw new Error(`Unexpected model type: ${typeof model}`)
  }
}
```

`lib/controller-resolver.js`:

```js
import fs from 'fs-extra'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export function runController(options, controller, { logger }) {
  if (typeof controller !== 'function') {
    logger.error('Invalid controller - not a function')
    return options
  }
  try {
    return { ...options, ...controller(options) }
  } catch (err) {
    logger.error(`Error in controller for ${options.view}`)
    logger.warn(err)
    return options
  }
}

// import() caches per URL exactly as require() did: controllers do not
// hot-reload in watch mode. Accepts `export default fn` and legacy
// `module.exports = fn` (which import() surfaces as `.default`).
export async function loadController(controllersDir, file, { logger }) {
  const controllerPath = path.resolve(`${controllersDir}/${file}`)
  if (!fs.existsSync(controllerPath)) {
    logger.error(`Failed to find "controller: ${controllerPath}`)
    return null
  }
  const mod = await import(pathToFileURL(controllerPath).href)
  return mod.default ?? mod
}

export async function applyController(options, { controllersDir, logger }) {
  const { controller } = options
  if (controller) {
    switch (typeof controller) {
      case 'string': {
        const fn = await loadController(controllersDir, controller, { logger })
        if (fn) options = runController(options, fn, { logger })
        break
      }
      case 'function':
        options = runController(options, controller, { logger })
        break
      default:
        logger.error('Unknown controller type: ', controller, typeof controller)
    }
  }
  if (!options.title && options.model && options.model.title) {
    options.title = options.model.title
  }
  return options
}
```

- [ ] **Step 3: Wire into `kiss-ssg.js`**

Delete `_readModel`, `_prepareModelsFromFolder`, `_processPageModel`, `_controllerRun`, `_detectControllerType`. In `page()` the chain starts with `resolveModel(options.model, { modelsDir: this.config.folders.models, logger: this.logger })`; every `await this._detectControllerType(options)` becomes `await applyController(options, { controllersDir: this.config.folders.controllers, logger: this.logger })` (also inside `_prepareMultiplePages`). Remove the now-unused `pathToFileURL` import and `hashId` usage for models.

- [ ] **Step 4: Run everything**

Run: `npm test` and `npm run lint` — Expected: all pass, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Extract model and controller resolution into lib/"
```

---

### Task 9: Extract `sitemap` — `model: sonnet`

**Files:**

- Create: `lib/sitemap.js`, `test/unit/sitemap.test.js`
- Modify: `kiss-ssg.js` (`sitemap()` becomes a thin wrapper)

**Interfaces:**

- Produces: `buildSitemapEntries(stack, { siteUrl, buildDir, now })` → `[{ loc, lastmod, priority, changefreq? }]`; `renderSitemapXml(urls)` → string; `writeSitemap(stack, { config, logger, overwrite = true })` → `Promise<{ status: 'written' | 'skipped' | 'no-site-url', urls: array | null }>`.
- Consumes: stack entries shaped `{ view, buildTo, page: { options }, runCount }`.

- [ ] **Step 1: Write the failing tests**

`test/unit/sitemap.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import {
  buildSitemapEntries,
  renderSitemapXml,
  writeSitemap,
} from '../../lib/sitemap.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

const entry = (buildTo, options = {}) => ({
  view: 'v',
  buildTo,
  page: { options },
  runCount: 0,
})

describe('buildSitemapEntries', () => {
  it('maps build paths to site URLs, treating index as the folder root', () => {
    const urls = buildSitemapEntries(
      [
        entry('out/index.html'),
        entry('out/about/us.html'),
        entry('out/blog/index.html'),
      ],
      { siteUrl: 'https://e.com/', buildDir: 'out', now: 'T' },
    )
    expect(urls.map((u) => u.loc)).toEqual([
      'https://e.com/',
      'https://e.com/about/us',
      'https://e.com/blog',
    ])
    expect(urls[0]).toMatchObject({ lastmod: 'T', priority: '1.00' })
  })

  it('honours per-page overrides and ignoreSitemap', () => {
    const urls = buildSitemapEntries(
      [
        entry('out/a.html', {
          sitemapPriority: '0.2',
          sitemapChangefreq: 'daily',
          sitemapLastmod: 'L',
        }),
        entry('out/b.html', { ignoreSitemap: true }),
      ],
      { siteUrl: 'https://e.com', buildDir: 'out' },
    )
    expect(urls).toHaveLength(1)
    expect(urls[0]).toMatchObject({
      priority: '0.2',
      changefreq: 'daily',
      lastmod: 'L',
    })
  })
})

describe('renderSitemapXml', () => {
  it('emits changefreq only when set', () => {
    const xml = renderSitemapXml([
      { loc: 'a', lastmod: 'T', priority: '1.00' },
      { loc: 'b', lastmod: 'T', priority: '0.5', changefreq: 'weekly' },
    ])
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    )
    expect(xml.match(/<changefreq>/g)).toHaveLength(1)
    expect(xml).toContain('<loc>a</loc>')
  })
})

describe('writeSitemap', () => {
  let site
  afterEach(async () => {
    if (site) await site.cleanup()
  })

  it('reports no-site-url without writing', async () => {
    site = await makeSite({})
    const r = await writeSitemap([], {
      config: { folders: { build: site.build } },
      logger: silentLogger,
    })
    expect(r.status).toBe('no-site-url')
    expect(await site.exists('public/sitemap.xml')).toBe(false)
  })

  it('writes, and skips when overwrite is false and a file exists', async () => {
    site = await makeSite({ 'public/sitemap.xml': 'old' })
    const config = { siteUrl: 'https://e.com', folders: { build: site.build } }
    const skipped = await writeSitemap([entry(`${site.build}/index.html`)], {
      config,
      logger: silentLogger,
      overwrite: false,
    })
    expect(skipped.status).toBe('skipped')
    expect(await site.read('public/sitemap.xml')).toBe('old')
    const written = await writeSitemap([entry(`${site.build}/index.html`)], {
      config,
      logger: silentLogger,
    })
    expect(written.status).toBe('written')
    expect(written.urls[0].loc).toBe('https://e.com/')
    expect(await site.read('public/sitemap.xml')).toContain(
      '<loc>https://e.com/</loc>',
    )
  })
})
```

Run: `npx vitest run test/unit/sitemap.test.js` — Expected: FAIL, module missing.

- [ ] **Step 2: Create `lib/sitemap.js`**

```js
import fs from 'fs-extra'

export function buildSitemapEntries(
  stack,
  { siteUrl, buildDir, now = new Date().toISOString() },
) {
  const baseUrl = siteUrl.replace(/\/$/, '')
  return stack
    .filter((entry) => !entry.page.options.ignoreSitemap)
    .map((entry) => {
      const options = entry.page.options
      let urlPath = entry.buildTo.slice(buildDir.length)
      urlPath = urlPath.replace(/\.[^./]+$/, '')
      urlPath = urlPath.replace(/\/index$/, '') || '/'
      return {
        loc: `${baseUrl}${urlPath}`,
        lastmod: options.sitemapLastmod || now,
        priority: options.sitemapPriority || '1.00',
        changefreq: options.sitemapChangefreq,
      }
    })
}

export function renderSitemapXml(urls) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  for (const url of urls) {
    xml += '  <url>\n'
    xml += `    <loc>${url.loc}</loc>\n`
    xml += `    <lastmod>${url.lastmod}</lastmod>\n`
    if (url.changefreq)
      xml += `    <changefreq>${url.changefreq}</changefreq>\n`
    xml += `    <priority>${url.priority}</priority>\n`
    xml += '  </url>\n'
  }
  return xml + '</urlset>'
}

export async function writeSitemap(
  stack,
  { config, logger, overwrite = true },
) {
  if (!config.siteUrl) {
    logger.error('Cannot generate sitemap.xml: config.siteUrl is not set')
    return { status: 'no-site-url', urls: null }
  }
  const buildDir = config.folders.build
  const sitemapPath = `${buildDir}/sitemap.xml`
  if (!overwrite && fs.existsSync(sitemapPath)) {
    logger.info('Skipping sitemap.xml: already exists')
    return { status: 'skipped', urls: null }
  }
  const urls = buildSitemapEntries(stack, { siteUrl: config.siteUrl, buildDir })
  try {
    await fs.outputFile(sitemapPath, renderSitemapXml(urls))
    logger.success(sitemapPath)
  } catch (err) {
    logger.error('Error creating sitemap.xml')
    logger.warn(err)
  }
  return { status: 'written', urls }
}
```

- [ ] **Step 3: Wire into `kiss-ssg.js`**

Replace the whole `sitemap()` body with:

```js
  sitemap(options, callback) {
    const overwrite = !options || options.overwrite !== false
    const run = Promise.all(this._promises)
      .then(async () => {
        const { status, urls } = await writeSitemap(this._stack, {
          config: this.config,
          logger: this.logger,
          overwrite,
        })
        if (status === 'no-site-url') return
        if (callback) callback.call(this, urls)
      })
      .catch((err) => {
        this.logger.error('Error creating sitemap.xml')
        this.logger.warn(err)
      })
    this._generating.push(run)
    return this
  }
```

- [ ] **Step 4: Run everything and commit**

Run: `npm test`, `npm run lint` — Expected: all pass.

```bash
git add -A
git commit -m "Extract sitemap generation into lib/sitemap.js"
```

---

### Task 10: Extract `kiss-page.js` with the dedupe fix — `model: opus`

**Files:**

- Create: `lib/kiss-page.js`, `test/unit/kiss-page.test.js`
- Modify: `kiss-ssg.js` (delete the `KissPage` class; `_preparePage` returns the stack entry or `null` on duplicate; `page()` no longer computes `pageToGenerate`)
- Create: `test/integration/dedupe.test.js`

**Interfaces:**

- Produces: `export class KissPage` — `new KissPage(view, { hbs, logger })`; fields `options`, `buildDir`, `pagesDir`; setters `path`, `slug`, `ext`, `extLess`, `isDev`, `debug`; getters `slug`, `buildTo`; `pageURL()`; `prepare()` → this; `async generate()` → `buildTo`. Identical semantics to v1 except writes are awaited.
- `Kiss._preparePage(options)` → stack entry `{ view, buildTo, page, runCount }` or `null` if an entry with the same `buildTo` already exists.

- [ ] **Step 1: Write the failing tests**

`test/unit/kiss-page.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import Handlebars from 'handlebars'
import { KissPage } from '../../lib/kiss-page.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

const make = (view, opts = {}) => {
  const page = new KissPage(view, {
    hbs: Handlebars.create(),
    logger: silentLogger,
  })
  page.buildDir = opts.buildDir || 'out'
  page.pagesDir = opts.pagesDir || 'pages'
  page.path = opts.path
  page.slug = opts.slug
  if (opts.ext) page.ext = opts.ext
  page.extLess = !!opts.extLess
  page.isDev = !!opts.dev
  page.options = opts.options || {}
  return page.prepare()
}

describe('url inference', () => {
  it('builds <path>/<slug>.<ext> with a slugified path and slug', () => {
    const p = make('v.hbs', {
      path: '/About Us/',
      slug: 'Our Team',
      ext: '.xml',
    })
    expect(p.pageURL()).toBe('about-us/our-team.xml')
    expect(p.buildTo).toBe('out/about-us/our-team.xml')
  })

  it('defaults to index.html at the root', () => {
    expect(make('v.hbs').pageURL()).toBe('index.html')
  })

  it('extension-less mode nests non-index pages under <slug>/index.html', () => {
    expect(make('v.hbs', { slug: 'about', extLess: true }).pageURL()).toBe(
      'about/index.html',
    )
    expect(make('v.hbs', { slug: 'index', extLess: true }).pageURL()).toBe(
      'index.html',
    )
  })

  it('prepare() fills default title/path/slug/generate without clobbering options', () => {
    const p = make('v.hbs', { slug: 'x', options: { title: 'T' } })
    expect(p.options).toMatchObject({ title: 'T', slug: 'x', generate: true })
  })
})

describe('generate', () => {
  let site
  afterEach(async () => {
    if (site) await site.cleanup()
  })

  it('renders a string view, minifies, and resolves after the file is written', async () => {
    site = await makeSite({})
    const p = make('<p>  {{model.a}}  </p>', {
      buildDir: site.build,
      slug: 's',
      options: { model: { a: 1 } },
    })
    const out = await p.generate()
    expect(out).toBe(`${site.build}/s.html`)
    expect(await site.read('public/s.html')).toBe('<p>1</p>')
  })

  it('in dev mode injects livereload, keeps whitespace, and writes a debug json', async () => {
    site = await makeSite({})
    const p = make('<body>\n<p>x</p>\n</body>', {
      buildDir: site.build,
      slug: 'd',
      dev: true,
      options: { model: {} },
    })
    await p.generate()
    const html = await site.read('public/d.html')
    expect(html).toContain('livereload.js')
    expect(html).toContain('\n')
    expect(JSON.parse(await site.read('public/d.json')).pageURL).toBe('d.html')
  })

  it('reads .hbs views from pagesDir', async () => {
    site = await makeSite({ 'pages/a.hbs': 'A={{title}}' })
    const p = make('a.hbs', {
      buildDir: site.build,
      pagesDir: `${site.root}/pages`,
      slug: 'a',
      options: { title: 'T' },
    })
    await p.generate()
    expect(await site.read('public/a.html')).toBe('A=T')
  })

  it('skips when options.generate is false', async () => {
    site = await makeSite({})
    const p = make('x', {
      buildDir: site.build,
      slug: 'n',
      options: { generate: false },
    })
    await p.generate()
    expect(await site.exists('public/n.html')).toBe(false)
  })
})
```

`test/integration/dedupe.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})

describe('duplicate pages', () => {
  it('are stacked once, including in extension-less mode and for non-html ext', async () => {
    site = await makeSite({
      'src/pages/about.hbs': 'x',
      'src/pages/feed.hbs': 'y',
    })
    const kiss = new Kiss({
      folders: site.folders,
      extensionLess: true,
      logger: silentLogger,
    })
      .page({ view: 'about.hbs' })
      .page({ view: 'about.hbs' })
      .page({ view: 'feed.hbs', ext: 'xml' })
      .page({ view: 'feed.hbs', ext: 'xml' })
    await kiss.complete()
    expect(kiss._stack).toHaveLength(2)
  })
})
```

Run: `npm test` — Expected: unit file fails (module missing); dedupe test fails with length 4.

- [ ] **Step 2: Create `lib/kiss-page.js`**

Move the `KissPage` class out of `kiss-ssg.js` verbatim (it already has awaited writes, `hbs`, and `logger` from Tasks 3, 6, 7), converting `import` lines to: `import fs from 'fs-extra'`, `import { minify as htmlMinify } from 'html-minifier-terser'`, `import { toSlug, toTitleCase, sanitizePath } from './utils.js'`, `import { createLogger } from './logger.js'`. Change the constructor to:

```js
  constructor(view, { hbs, logger } = {}) {
    this.view = view
    this.hbs = hbs
    this.logger = logger || createLogger()
    this._title = toTitleCase(this._slug)
  }
```

Export with `export class KissPage`. All log lines use `this.logger.*` (they already do after Task 6).

- [ ] **Step 3: Fix the dedupe in `kiss-ssg.js`**

`import { KissPage } from './lib/kiss-page.js'`. Change `_preparePage` to construct with `new KissPage(options.view, { hbs: this.handlebars, logger: this.logger })`, and end with:

```js
const preparedPage = kissPage.prepare()
const buildTo = preparedPage.buildTo
if (this._stack.some((entry) => entry.buildTo === buildTo)) {
  this.logger.error('Page already processed', buildTo)
  return null
}
const entry = {
  view: preparedPage.view,
  buildTo,
  page: preparedPage,
  runCount: 0,
}
this._stack.push(entry)
return entry
```

In `page()`, delete the `pathSlug` / `pageToGenerate` / `existingPage` block and just call `this._preparePage(options)`.

- [ ] **Step 4: Run everything and commit**

Run: `npm test`, `npm run lint` — Expected: all pass.

```bash
git add -A
git commit -m "Extract KissPage into lib/; dedupe pages by their real build path"
```

---

### Task 11: Extract `dev-server` and `watcher` with handles; add `close()` — `model: fable`

**Files:**

- Create: `lib/dev-server.js`, `lib/watcher.js`
- Create: `test/unit/dev-server.test.js`, `test/unit/watcher.test.js`, `test/integration/watch.test.js`
- Delete: `kiss-serve.js`
- Modify: `kiss-ssg.js` (`watch({ entry })`, `close()`, constructor dev branch), `vitest.config.mjs` (coverage include drop `kiss-serve.js`)

**Interfaces:**

- Produces:
  - `startDevServer(httpRoot, port, { logger })` → `{ server, livereload, ready: Promise<void>, close(): Promise<void> }` (`ready` resolves on the HTTP server's `listening` event; port `0` picks a free port).
  - `createWatcher({ config, getStack, entry = process.argv[1], rebuildSite, rebuildPage, assetsChanged, logger })` → `{ ready: Promise<void>, close(): Promise<void> }`. `rebuildPage(entry)` receives a stack entry.
  - `Kiss.watch({ entry } = {})` → `this`; stores the handle on `this._watcher`. `Kiss.close()` → `Promise<void>` closes `this._watcher` and `this._devServer` if present.

- [ ] **Step 1: Write the failing tests**

`test/unit/dev-server.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'

vi.mock('livereload', () => ({
  default: { createServer: () => ({ watch: vi.fn(), close: vi.fn() }) },
}))

import { startDevServer } from '../../lib/dev-server.js'
import { silentLogger } from '../../lib/logger.js'

describe('startDevServer', () => {
  it('listens, serves files from httpRoot, and closes cleanly', async () => {
    const handle = startDevServer('public', 0, { logger: silentLogger })
    await handle.ready
    const { port } = handle.server.address()
    expect(port).toBeGreaterThan(0)
    const res = await fetch(`http://127.0.0.1:${port}/definitely-missing.html`)
    expect(res.status).toBe(404)
    await handle.close()
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow()
  })
})
```

`test/unit/watcher.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import { createWatcher } from '../../lib/watcher.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

let site, handle
afterEach(async () => {
  if (handle) await handle.close()
  if (site) await site.cleanup()
})

describe('createWatcher', () => {
  it('rebuilds a matched page, the whole site otherwise, and the assets on asset change', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'a',
      'src/partials/p.hbs': 'p',
      'src/assets/x.txt': 'x',
      'entry.js': '// entry',
    })
    const calls = { page: [], site: 0, assets: 0 }
    const stack = [{ view: 'index.hbs', buildTo: 'x', page: {}, runCount: 0 }]
    handle = createWatcher({
      config: {
        folders: {
          src: site.src,
          pages: `${site.src}/pages`,
          assets: `${site.src}/assets`,
        },
      },
      getStack: () => stack,
      entry: `${site.root}/entry.js`,
      rebuildSite: () => calls.site++,
      rebuildPage: (e) => calls.page.push(e.view),
      assetsChanged: () => calls.assets++,
      logger: silentLogger,
    })
    await handle.ready
    await site.touch('src/pages/index.hbs', 'b')
    await waitFor(() => calls.page.includes('index.hbs'))
    await site.touch('src/partials/p.hbs', 'q')
    await waitFor(() => calls.site >= 1)
    await site.touch('src/assets/x.txt', 'y')
    await waitFor(() => calls.assets >= 1)
    const before = calls.site
    await site.touch('entry.js', '// changed')
    await waitFor(() => calls.site > before)
  })
})
```

`test/integration/watch.test.js`:

```js
import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({ close: async () => {} }),
}))

import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

let site, kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
})

describe('watch()', () => {
  it('rebuilds a changed page and can be closed', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'v1' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/pages/index.hbs', 'v2')
    await waitFor(async () => (await site.read('public/index.html')) === 'v2')
  })

  it('dev mode starts the (mocked) server and watcher; close() stops both', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    kiss = new Kiss({ folders: site.folders, dev: true, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(kiss._devServer).toBeTruthy()
    expect(kiss._watcher).toBeTruthy()
    await kiss.close()
    expect(kiss._watcher).toBeNull()
    expect(kiss._devServer).toBeNull()
  })
})
```

Run: `npm test` — Expected: the three new files fail on missing modules / missing methods.

- [ ] **Step 2: Create the modules**

`lib/dev-server.js`:

```js
import connect from 'connect'
import serveStatic from 'serve-static'
import livereload from 'livereload'

export function startDevServer(httpRoot = 'public', port = 3000, { logger }) {
  const app = connect()
  app.use((req, res, next) => {
    logger.plain(req.url)
    next()
  })
  app.use(
    serveStatic(httpRoot, {
      cacheControl: false,
      extensions: ['html', 'htm'],
      index: ['index.html', 'index.htm'],
    }),
  )
  const server = app.listen(port)
  const ready = new Promise((resolve) => server.once('listening', resolve))
  logger.info(`Serving (${httpRoot}): `, `http://localhost:${port}`)
  const lr = livereload.createServer()
  lr.watch(httpRoot)
  return {
    server,
    livereload: lr,
    ready,
    close: () =>
      new Promise((resolve) => {
        lr.close()
        server.close(() => resolve())
      }),
  }
}
```

`lib/watcher.js`:

```js
import chokidar from 'chokidar'

const posix = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '')

// `entry` is the script that configured Kiss (process.argv[1] by default —
// module.parent.filename does not exist under ESM); a change to it rebuilds
// everything because the page list itself may have changed.
export function createWatcher({
  config,
  getStack,
  entry = process.argv[1],
  rebuildSite,
  rebuildPage,
  assetsChanged,
  logger,
}) {
  const watchers = []
  logger.notice('Watching for file changes', config.folders.src)

  if (entry) {
    watchers.push(
      chokidar.watch(entry).on('change', (p) => {
        logger.notice(`Changed: ${p}: `)
        rebuildSite()
      }),
    )
  }

  const assetsDir = config.folders.assets || './src/assets'
  const pagesDir = posix(config.folders.pages)
  watchers.push(
    chokidar
      .watch(config.folders.src, { ignored: `${assetsDir}/*` })
      .on('all', (event, p) => {
        if (event.includes('add')) return
        const changed = posix(p)
        const lookup = changed.startsWith(`${pagesDir}/`)
          ? changed.slice(pagesDir.length + 1)
          : changed
        const matches = getStack().filter((e) => e.view === lookup)
        logger.info(`${event}: ${p}: `, matches.length)
        if (matches.length === 0) return rebuildSite()
        matches.forEach((m) => {
          logger.info('Rebuilding:', m.page.view)
          rebuildPage(m)
        })
      }),
  )

  watchers.push(
    chokidar.watch(assetsDir).on('change', (p) => {
      logger.info('Asset changed: ', p)
      assetsChanged()
    }),
  )

  return {
    ready: Promise.all(
      watchers.map((w) => new Promise((r) => w.on('ready', r))),
    ),
    close: async () => {
      await Promise.all(watchers.map((w) => w.close()))
    },
  }
}
```

- [ ] **Step 3: Wire into `kiss-ssg.js`; delete `kiss-serve.js`**

Add fields `_watcher = null` and `_devServer = null`. Constructor dev branch becomes:

```js
if (this.config.dev) {
  try {
    this._devServer = startDevServer(
      path.resolve(this.config.folders.build),
      this.config.port,
      {
        logger: this.logger,
      },
    )
  } catch (error) {
    this.logger.error('Error running live reload server')
    this.logger.plain(error.message)
  }
  this.watch()
}
```

Replace `watch()` with:

```js
  watch({ entry = process.argv[1] } = {}) {
    if (this._watcher) return this
    const rebuildSite = () => {
      this.logger.notice('Rebuilding site:')
      this.registerPartials()
      this._stack.forEach((entry) => entry.page.generate())
    }
    this._watcher = createWatcher({
      config: this.config,
      getStack: () => this._stack,
      entry,
      rebuildSite,
      rebuildPage: (entry) => entry.page.generate(),
      assetsChanged: () => this.copyAssets(this.config.folders.assets, this.config.folders.build),
      logger: this.logger,
    })
    return this
  }

  async close() {
    if (this._watcher) await this._watcher.close()
    this._watcher = null
    if (this._devServer) await this._devServer.close()
    this._devServer = null
  }
```

`git rm kiss-serve.js`; update `vitest.config.mjs` coverage include to `['lib/**', 'kiss-ssg.js']`; imports `startDevServer` and `createWatcher` from `./lib/...`; drop the `chokidar` import from `kiss-ssg.js`.

- [ ] **Step 4: Run everything and commit**

Run: `npm test` — Expected: all pass and **the process exits** (no dangling watchers). Run: `npm run lint`.

```bash
git add -A
git commit -m "Extract dev server and watcher into lib/ with close() handles"
```

---

### Task 12: Move the orchestrator to `lib/kiss.js`; delete `kiss-ssg.js` — `model: fable`

**Files:**

- Create: `lib/kiss.js`
- Delete: `kiss-ssg.js`
- Modify: `package.json` (`main`), `test/helpers/kiss.js`, `docs.js`, `examples/*.js` (import path), `vitest.config.mjs`

**Interfaces:**

- Produces: `lib/kiss.js` — `export default Kiss`, `export { Kiss as 'module.exports' }`, `export { utils }`. Public API exactly as the spec's Compatibility list plus `close()`, `watch({ entry })`.

- [ ] **Step 1: Repoint the entry (tests fail until the file exists)**

`test/helpers/kiss.js`:

```js
import path from 'node:path'
export { default, utils } from '../../lib/kiss.js'
export const ENTRY = path.resolve('lib/kiss.js')
```

`package.json`: `"main": "lib/kiss.js"`. `docs.js`: `import Kiss from './lib/kiss.js'`. Every `examples/*.js`: `from '../kiss-ssg.js'` → `from '../lib/kiss.js'`. `vitest.config.mjs` coverage include: `['lib/**']`.

Run: `npm test` — Expected: everything fails on the missing `lib/kiss.js`.

- [ ] **Step 2: Write `lib/kiss.js`**

This is what `kiss-ssg.js` has become after Tasks 3–11, reduced to wiring. Reference implementation:

```js
import fs from 'fs-extra'
import glob from 'glob'
import path from 'node:path'
import Handlebars from 'handlebars'
import layouts from 'handlebars-layouts'
import { Remarkable } from 'remarkable'
import utils, { toSlug } from './utils.js'
import { createLogger } from './logger.js'
import { resolveConfig, foldersToEnsure } from './config.js'
import { registerHandlebarsHelpers } from './handlebars-helpers.js'
import { registerPartials } from './partials.js'
import { copyAssets } from './assets.js'
import { resolveModel } from './model-resolver.js'
import { applyController } from './controller-resolver.js'
import { writeSitemap } from './sitemap.js'
import { KissPage } from './kiss-page.js'
import { startDevServer } from './dev-server.js'
import { createWatcher } from './watcher.js'

class Kiss {
  _stack = []
  _promises = []
  _generating = []
  _watcher = null
  _devServer = null

  constructor(config = {}) {
    this.config = resolveConfig(config)
    this.logger =
      this.config.logger || createLogger({ verbose: this.config.verbose })
    this.verbose = !!this.config.verbose
    this.logger.banner('            Starting Kiss            \n')
    this.logger.debug('config: ', this.config)

    this.handlebars = Handlebars.create()
    this.handlebars.registerHelper(layouts(this.handlebars))
    this.remarkable = new Remarkable({
      html: true,
      xhtmlOut: true,
      breaks: true,
    })

    this._setupFolders()
    this.copyAssets(this.config.folders.assets, this.config.folders.build)
    registerHandlebarsHelpers(this.handlebars, this.config, {
      markdown: this.remarkable,
      logger: this.logger,
    })
    this.registerPartials()

    if (this.config.dev) {
      try {
        this._devServer = startDevServer(
          path.resolve(this.config.folders.build),
          this.config.port,
          {
            logger: this.logger,
          },
        )
      } catch (error) {
        this.logger.error('Error running live reload server')
        this.logger.plain(error.message)
      }
      this.watch()
    }
    this.logger.info('Generating:')
  }

  _setupFolders() {
    foldersToEnsure(this.config.folders).forEach((folder) =>
      fs.ensureDirSync(folder),
    )
    if (this.config.cleanBuild) {
      try {
        fs.emptyDirSync(this.config.folders.build)
      } catch (err) {
        this.logger.error(err.message)
      }
    }
    fs.ensureDirSync(this.config.folders.build)
  }

  registerPartials() {
    return registerPartials(this.handlebars, this.config, {
      markdown: this.remarkable,
      logger: this.logger,
    })
  }

  copyAssets(sourceDir, targetDir) {
    this._promises.push(
      copyAssets(sourceDir, targetDir, {
        config: this.config,
        logger: this.logger,
      }),
    )
    return this
  }

  _preparePage(options) {
    const kissPage = new KissPage(options.view, {
      hbs: this.handlebars,
      logger: this.logger,
    })
    kissPage.options = options
    kissPage.buildDir = this.config.folders.build
    kissPage.pagesDir = this.config.folders.pages
    kissPage.path = options.path
    kissPage.slug = options.slug
    if (options.ext) kissPage.ext = options.ext
    kissPage.debug = this.config.verbose
    kissPage.isDev = this.config.dev
    kissPage.extLess = this.config.extensionLess
    const preparedPage = kissPage.prepare()
    const buildTo = preparedPage.buildTo
    if (this._stack.some((entry) => entry.buildTo === buildTo)) {
      this.logger.error('Page already processed', buildTo)
      return null
    }
    const entry = {
      view: preparedPage.view,
      buildTo,
      page: preparedPage,
      runCount: 0,
    }
    this._stack.push(entry)
    return entry
  }

  _controllerDeps() {
    return {
      controllersDir: this.config.folders.controllers,
      logger: this.logger,
    }
  }

  async _prepareMultiplePages(options, data) {
    if (!Array.isArray(data)) {
      this.logger.error('Data in dynamic model must be an array')
      return
    }
    const slug = options.slug ? options.slug : options.view.replace('.hbs', '')
    let i = 1
    for (const model of data) {
      options.slug = `${slug}-${i}`
      options.model = model
      options = await applyController(options, this._controllerDeps())
      this._preparePage(options)
      i++
    }
  }

  _inferSlugAndPath(options) {
    if (!options.slug) {
      if (options.view.endsWith('.hbs')) {
        options.slug = toSlug(
          options.view
            .substring(options.view.lastIndexOf('/') + 1)
            .replace('.hbs', ''),
        )
      } else {
        options.slug = 'snippet-' + Math.floor(Math.random() * 1000000000)
        this.logger.error(
          'A string view had been provided without an accompanying slug',
        )
        this.logger.info(`generating random slug: ${options.slug}`)
      }
    }
    if (!options.path)
      options.path = options.view.substring(0, options.view.lastIndexOf('/'))
    return options
  }

  page(options) {
    if (!options.view) {
      this.logger.error('No view specified', options)
      return this
    }
    options.config = this.config

    if (!options.model) {
      const matchingModel = options.view.replace(/\.hbs$/, '.json')
      if (fs.existsSync(`${this.config.folders.models}/${matchingModel}`)) {
        this.logger.debug('Found matching model: ', matchingModel)
        options.model = matchingModel
      }
    }
    if (!options.controller) {
      const matchingController = options.view.replace(/\.hbs$/, '.js')
      if (
        fs.existsSync(
          `${this.config.folders.controllers}/${matchingController}`,
        )
      ) {
        this.logger.debug('Found matching controller: ', matchingController)
        options.controller = matchingController
      }
    }

    const chain = resolveModel(options.model, {
      modelsDir: this.config.folders.models,
      logger: this.logger,
    })
      .then(async (response) => {
        if (options.dynamic) {
          await this._prepareMultiplePages(options, response.data)
        } else {
          options.model = response.data
          options = await applyController(options, this._controllerDeps())
          this._preparePage(this._inferSlugAndPath(options))
        }
        return response
      })
      .catch((error) => {
        this.logger.error(error.message || error)
        if (error.error) this.logger.warn(error.error)
        return {
          id: typeof options.model === 'string' ? options.model : undefined,
          data: null,
          error,
        }
      })
    this._promises.push(chain)
    return this
  }

  pages(options) {
    options.dynamic = true
    return this.page(options)
  }

  scan() {
    const pagesDir = this.config.folders.pages
    glob.sync(`${pagesDir}/**/*.hbs`).forEach((pagePath) => {
      const view = pagePath.slice(pagesDir.length + 1)
      if (!this._stack.some((p) => p.view === view)) {
        this.logger.info('Auto added:', view)
        this.page({ view })
      }
    })
    return this
  }

  viewStats() {
    if (this.verbose) {
      fs.outputJson(`${this.config.folders.build}/debug.json`, this._stack, {
        spaces: 2,
      }).catch((err) => this.logger.plain(err))
    }
    this.logger.plain({
      promise: this._promises.length,
      stack: this._stack.length,
    })
    return this
  }

  async _drain() {
    let seen = -1
    while (seen !== this._promises.length + this._generating.length) {
      seen = this._promises.length + this._generating.length
      await Promise.all([...this._promises, ...this._generating])
    }
  }

  generate(callback) {
    const run = Promise.all(this._promises)
      .then(async (data) => {
        const pending = []
        this._stack.forEach((entry) => {
          if (entry.runCount === 0) pending.push(entry.page.generate())
          entry.runCount++
        })
        await Promise.all(pending)
        if (callback) callback.call(this, data)
      })
      .catch((err) => {
        this.logger.error('Error generating site')
        this.logger.warn(err)
      })
    this._generating.push(run)
    return this
  }

  complete(callback) {
    return this._drain().then(async () => {
      const data = await Promise.all(this._promises)
      if (callback) callback.call(this, data)
      return data
    })
  }

  sitemap(options, callback) {
    const overwrite = !options || options.overwrite !== false
    const run = Promise.all(this._promises)
      .then(async () => {
        const { status, urls } = await writeSitemap(this._stack, {
          config: this.config,
          logger: this.logger,
          overwrite,
        })
        if (status === 'no-site-url') return
        if (callback) callback.call(this, urls)
      })
      .catch((err) => {
        this.logger.error('Error creating sitemap.xml')
        this.logger.warn(err)
      })
    this._generating.push(run)
    return this
  }

  getModelByID(id, data) {
    const result = data.find((d) => d.id === id)
    if (result) return result.data
    return { error: 'No data found for: ' + id }
  }

  watch({ entry = process.argv[1] } = {}) {
    if (this._watcher) return this
    const rebuildSite = () => {
      this.logger.notice('Rebuilding site:')
      this.registerPartials()
      this._stack.forEach((entry) => entry.page.generate())
    }
    this._watcher = createWatcher({
      config: this.config,
      getStack: () => this._stack,
      entry,
      rebuildSite,
      rebuildPage: (entry) => entry.page.generate(),
      assetsChanged: () =>
        this.copyAssets(this.config.folders.assets, this.config.folders.build),
      logger: this.logger,
    })
    return this
  }

  async close() {
    if (this._watcher) await this._watcher.close()
    this._watcher = null
    if (this._devServer) await this._devServer.close()
    this._devServer = null
  }
}

export default Kiss
export { Kiss as 'module.exports' }
export { utils }
```

Where `kiss-ssg.js` (as left by Task 11) differs from the above in _behaviour_, keep `kiss-ssg.js`'s behaviour — the tests are the arbiter. Then `git rm kiss-ssg.js`.

- [ ] **Step 3: Run everything, including the examples**

Run: `npm test` — Expected: all pass. Run: `npm run lint`.
Run (bash): `cd examples && for n in 1-scan 2-page 3-pages 4-layouts-and-partials 5-helpers 6-sitemap; do timeout 10 node $n.js > /dev/null 2>&1; echo "$n exit $?"; done; ls ../public`
Expected: each exit `0`/`124`; `../public/<example>/` populated. Also `node docs.js` for ~10 s regenerates `docs/index.html` (then kill it).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Move the orchestrator to lib/kiss.js and delete the monolith"
```

---

### Task 13: AIKB knowledge base, CLAUDE.md lookup table, sync test — `model: sonnet`

**Files:**

- Create: `AIKB/kiss.md`, `AIKB/kiss-page.md`, `AIKB/logger.md`, `AIKB/config.md`, `AIKB/handlebars-helpers.md`, `AIKB/partials.md`, `AIKB/assets.md`, `AIKB/model-resolver.md`, `AIKB/controller-resolver.md`, `AIKB/sitemap.md`, `AIKB/dev-server.md`, `AIKB/watcher.md`, `AIKB/utils.md`, `AIKB/testing.md`
- Create: `test/aikb.test.js`
- Modify: `CLAUDE.md` (rewrite)

**Interfaces:**

- Consumes: the final `lib/*.js` from Task 12 (read each module to fill Responsibility / Public interface / Depends on / Depended on by accurately).
- Produces: every module doc has exactly these five H2 headings in this order: `## Responsibility`, `## Public interface`, `## Depends on`, `## Depended on by`, `## Non-obvious behavior`. `testing.md` is free-form.

- [ ] **Step 1: Write the failing sync test**

`test/aikb.test.js`:

```js
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const strip = (ext) => (f) =>
  f.endsWith(ext) && f.replace(new RegExp(`\\${ext}$`), '')
const modules = fs
  .readdirSync(path.join(root, 'lib'))
  .map(strip('.js'))
  .filter(Boolean)
const docs = fs
  .readdirSync(path.join(root, 'AIKB'))
  .map(strip('.md'))
  .filter(Boolean)
const claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')
const HEADINGS = [
  '## Responsibility',
  '## Public interface',
  '## Depends on',
  '## Depended on by',
  '## Non-obvious behavior',
]

describe('AIKB stays in sync with lib/', () => {
  it.each(modules)('lib/%s.js has AIKB/%s.md', (m) => {
    expect(docs).toContain(m)
  })

  it.each(docs)('AIKB/%s.md is listed in the CLAUDE.md lookup table', (d) => {
    expect(claudeMd).toContain(`AIKB/${d}.md`)
  })

  it.each(docs.filter((d) => d !== 'testing'))(
    'AIKB/%s.md follows the module template',
    (d) => {
      const text = fs.readFileSync(path.join(root, 'AIKB', `${d}.md`), 'utf8')
      let last = -1
      for (const h of HEADINGS) {
        const at = text.indexOf(h)
        expect(at, `${d}.md missing "${h}"`).toBeGreaterThan(last)
        last = at
      }
    },
  )
})
```

Run: `npx vitest run test/aikb.test.js` — Expected: FAIL (no `AIKB/`).

- [ ] **Step 2: Write the module docs**

Use this template for each of the 13 module docs, filling every section from the actual code in `lib/<name>.js` (names, signatures, imports, and `grep -l "from './<name>.js'" lib/*.js` for "Depended on by"):

```markdown
# <name>.js

## Responsibility

<one paragraph>

## Public interface

<each export with its signature and return value>

## Depends on

<lib modules and npm packages it imports>

## Depended on by

<lib modules that import it>

## Non-obvious behavior

<bullets — the why, not the what>
```

The **Non-obvious behavior** sections must include at least these facts (add more if you find them in the code):

- `kiss.md`: the pipeline narrative — `.page()`/`.pages()`/`.scan()` queue work (model → controller → `_preparePage`) as one caught promise per page on `_promises`; nothing renders until `.generate()`; `.generate()` awaits `_promises`, renders every stack entry whose `runCount` is 0, awaits the writes, then fires the callback; `_generating` tracks `generate()`/`sitemap()` runs; `complete()` drains both lists repeatedly because callbacks may queue more work. Why `_promises` must only contain handled promises (v1 crashed with an unhandled rejection on a bad model). Why Handlebars/Remarkable are created per instance. `export { Kiss as 'module.exports' }` exists so CJS `require()` returns the class on Node ≥22.12. `config.logger` is the one DI seam.
- `kiss-page.md`: `_title` is computed from the default slug in the constructor, so pages without a title/model get `'Index'` (v1 quirk, preserved); `buildTo` is the dedupe key used by `Kiss._preparePage`; writes are awaited; dev mode injects the livereload `<script>` before `</body>` and writes a sibling `.json` of the resolved options; minification is skipped in dev.
- `logger.md`: only module that imports `colors`; strings are painted, non-strings passed through; `debug` is gated on `verbose`; `silentLogger` for tests.
- `config.md`: `folders.src` re-derives seven subfolders unless each is set explicitly; `null` folders are legal (skip creation, skip partial scanning, skip asset copy); `foldersToEnsure` fixes the v1 copy-paste guard; `sass.includePaths` is the public key mapped to sass's `loadPaths` by the consumers.
- `handlebars-helpers.md`: helpers register on the _given_ env; `sass` file mode resolves relative to `process.cwd()`, block mode compiles the block; `isActive` strips the extension and a trailing `index` from `pageURL` before comparing; `env` reads `config.dev`.
- `partials.md`: partial names are the path relative to the folder without extension; `.md` is rendered to HTML at registration time, not render time; registration order is html, md, hbs, then layouts (later registrations with the same name win).
- `assets.md`: always resolves (a rejected/pending promise here would hang `generate()`); Sass sources are excluded from the copy; the returned `{ id, data }` appears in `generate(cb)`'s data array.
- `model-resolver.md`: the four model shapes and the id each produces (`filename`, URL, `hashId(object)`, folder name); uses global `fetch`; `fetchImpl` is injectable for tests; rejects with `Error`s whose messages `Kiss` logs.
- `controller-resolver.md`: `import()` caches per URL so controllers do not hot-reload in watch mode; accepts `export default` and `module.exports` (`mod.default ?? mod`); a throwing controller leaves options untouched; title falls back to `model.title`.
- `sitemap.md`: URL derivation from `buildTo` (`slice(buildDir)`, strip extension, strip `/index`); `overwrite: false` only matters with `cleanBuild: false`; `status` values and what `Kiss.sitemap` does with each.
- `dev-server.md`: returns a handle; `close()` closes livereload then the HTTP server; port `0` picks a free port (used by tests).
- `watcher.md`: why `entry` defaults to `process.argv[1]` (no `module.parent` in ESM); `add` events are ignored; a change under `pages/` rebuilds only matching stack entries, anything else rebuilds the whole site; assets are watched separately; `ready` resolves when all chokidar watchers are ready; `close()` is required for the process to exit.
- `utils.md`: `toSlug` collapses non-word runs to `-` and can leave a trailing dash; `hashId` hashes objects by `JSON.stringify` (v1's `md5(object)` hashed `"[object Object]"`).
- `testing.md`: `npm test` / `npx vitest run <file>` / `npm run test:watch`; `test/helpers/site.js` (`makeSite`, `waitFor`, forward-slash paths and why); pass `logger: silentLogger` to keep output quiet; `vi.mock('../../lib/dev-server.js', ...)` for dev-mode tests; always `await kiss.close()` in `afterEach` after `watch()`; the `require()`-from-CJS test spawns a real `node`.

- [ ] **Step 3: Rewrite `CLAUDE.md`**

````markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`kiss-ssg` is a small, dependency-driven static site generator for Node (ESM, Node ≥22.12). The engine is the `lib/` folder — `lib/kiss.js` is the entry point and orchestrator; every other `lib/*.js` module has one responsibility. There is no build step, bundler, or transpilation.

`llms.txt` at the repo root is an LLM-oriented API cheat-sheet (per the [llmstxt.org](https://llmstxt.org) convention) that ships in the npm package so an agent working in a project that depends on `kiss-ssg` can read `node_modules/kiss-ssg/llms.txt` instead of the source. Keep it in sync with `lib/kiss.js` when the public API changes.

`src/` is **not** engine code: it is the source of this repo's own docs site (`docs.js` builds it into `docs/`). Treat `docs/` as build output.

## Architecture knowledge base

Detailed per-module notes live in `AIKB/` — read the relevant doc before changing that module, and update it in the same commit. `test/aikb.test.js` fails if a module has no doc, a doc is missing from this table, or a doc drops a template heading.

| Module                             | File                         | AIKB doc                      |
| ---------------------------------- | ---------------------------- | ----------------------------- |
| Orchestrator / public API          | `lib/kiss.js`                | `AIKB/kiss.md`                |
| Page renderer                      | `lib/kiss-page.js`           | `AIKB/kiss-page.md`           |
| Logger                             | `lib/logger.js`              | `AIKB/logger.md`              |
| Config + folder derivation         | `lib/config.js`              | `AIKB/config.md`              |
| Built-in Handlebars helpers        | `lib/handlebars-helpers.js`  | `AIKB/handlebars-helpers.md`  |
| Partials / layouts registration    | `lib/partials.js`            | `AIKB/partials.md`            |
| Assets + Sass                      | `lib/assets.js`              | `AIKB/assets.md`              |
| Model resolution                   | `lib/model-resolver.js`      | `AIKB/model-resolver.md`      |
| Controller resolution              | `lib/controller-resolver.js` | `AIKB/controller-resolver.md` |
| Sitemap                            | `lib/sitemap.js`             | `AIKB/sitemap.md`             |
| Dev server                         | `lib/dev-server.js`          | `AIKB/dev-server.md`          |
| File watcher                       | `lib/watcher.js`             | `AIKB/watcher.md`             |
| String/path utils                  | `lib/utils.js`               | `AIKB/utils.md`               |
| Cross-cutting: testing conventions | `test/`                      | `AIKB/testing.md`             |

## Commands

```bash
npm test                 # Vitest, single run
npm run test:watch
npm run test:coverage
npm run lint             # ESLint (flat config, eslint.config.js)
node docs                # regenerate docs/ (dev mode, starts a server — Ctrl-C to stop)
npm run eg1 … eg6        # run an example (examples/*.js); most start a dev server
```
````

Prettier config is in `.prettierrc` (no semicolons, single quotes).

## Pipeline in one paragraph

`new Kiss(config)` resolves config, creates a per-instance Handlebars env (with handlebars-layouts) and Remarkable renderer, ensures folders, queues an asset copy, registers helpers and partials, and in dev mode starts the server and watcher. `.page()`/`.pages()`/`.scan()` queue pages: each becomes one caught promise on `_promises` that resolves the model, runs the controller, and pushes a prepared `KissPage` onto `_stack`. Nothing renders until `.generate()`, which waits for `_promises`, renders each stack entry once, awaits the writes, then fires its callback. `.complete()` drains everything (including work queued by callbacks) and resolves. `.sitemap()` waits for `_promises` and writes `sitemap.xml`. Full detail: `AIKB/kiss.md`.

## Rules

- Engine code goes in `lib/`, one responsibility per file, with a unit test in `test/unit/` and an `AIKB/` doc.
- Only `lib/logger.js` imports `colors`. Everything else logs through the injected `logger`.
- Never push an unhandled promise onto `Kiss._promises` — see `AIKB/kiss.md`.
- Public API changes: update `llms.txt` and `README.md` in the same commit.

````

- [ ] **Step 4: Run and commit**

Run: `npm test` — Expected: all pass including `test/aikb.test.js`.

```bash
git add AIKB CLAUDE.md test/aikb.test.js
git commit -m "Add AIKB knowledge base, CLAUDE.md lookup table and sync test"
````

---

### Task 14: `llms.txt` and `README.md` for v2 — `model: sonnet`

**Files:**

- Modify: `llms.txt`, `README.md`

**Interfaces:**

- Consumes: the public API of `lib/kiss.js` (Task 12) and the spec's Compatibility stance.

- [ ] **Step 1: Rewrite `llms.txt`**

Keep the existing structure (intro, `## API`, `## Config`, `## Docs`) and make these changes:

- Intro: "Single-file engine (`kiss-ssg.js`)" → "ESM package (Node ≥22.12); engine in `lib/`, entry `lib/kiss.js`". Install line gains: `import Kiss from 'kiss-ssg'` (CJS `require('kiss-ssg')` also works on Node ≥22.12).
- `.generate(callback)`: replace "fires once all writes are scheduled … does not await file writes" with "fires after every page file has been written. Chainable — returns the `Kiss` instance. To await the whole build use `await kiss.complete()`."
- `.complete(callback)`: "resolves after every queued page (including pages queued from a `generate` callback) and any `sitemap()` call has finished writing; resolves with the same `data` array `generate` receives."
- Add `.close()` — "stops the file watcher and dev server (dev mode / after `.watch()`); returns a Promise."
- `.watch(options)` — add "`options.entry` (default `process.argv[1]`): the script whose change triggers a full rebuild."
- Add to the API list: "`import { utils } from 'kiss-ssg'` — `toSlug`, `sanitizePath`, `toTitleCase`, `trimLines`, `trimPath`, `hashId`."
- `kiss.handlebars`: note it is a per-instance environment (`Handlebars.create()`), so helpers registered on the global `handlebars` module are not seen.
- `## Docs`: replace the `kiss-ssg.js` bullet with: "[lib/](lib/): the engine — `kiss.js` (orchestrator, public API), `kiss-page.js` (one page's render), and one module per concern (`config`, `logger`, `handlebars-helpers`, `partials`, `assets`, `model-resolver`, `controller-resolver`, `sitemap`, `dev-server`, `watcher`, `utils`). Per-module notes: [AIKB/](AIKB/)."
- Add a short `## Migrating from v1` list: ESM-only; `generate` callback timing; per-instance Handlebars; `utils` via named export instead of `kiss-ssg/libs/utils.js`; controllers may be `export default`.

- [ ] **Step 2: Update `README.md`**

- Line 7: remove ", or just drop [kiss-ssg.js](…) somewhere".
- Every `const Kiss = require('kiss-ssg')` → `import Kiss from 'kiss-ssg'` (five occurrences).
- Add after the install paragraph:

```markdown
## Requirements

Node 22.12 or newer. kiss-ssg v2 is an ES module: use `import Kiss from 'kiss-ssg'`. Plain `require('kiss-ssg')` also works on Node ≥22.12.
```

- Add before `### Helpers`:

````markdown
### Waiting for the build

`.generate()` is chainable and returns immediately; its callback fires once every page has been written. To wait for the whole build (including a `.sitemap()` call and anything queued from a callback):

```js
await kiss.scan().generate().sitemap().complete()
```
````

In dev mode, or after calling `.watch()`, call `await kiss.close()` to stop the watcher and server.

````

- Append at the end:

```markdown
## Migrating from v1

- v2 is ESM-only (`import Kiss from 'kiss-ssg'`). `require()` still works on Node ≥22.12.
- The `.generate()` callback now fires **after** the files are written (v1 fired it before). Use `await kiss.complete()` to await the whole build.
- Each `Kiss` instance has its own Handlebars environment. Register custom helpers on `kiss.handlebars` (as the docs always said), not on the global `handlebars` module.
- `utils` moved from `kiss-ssg/libs/utils.js` to a named export: `import { utils } from 'kiss-ssg'`.
- Controller files may use `export default` (legacy `module.exports` still works).
- New: `kiss.close()` stops the dev server and file watcher.
````

- [ ] **Step 3: Verify and commit**

Run: `grep -n "require('kiss-ssg')\|kiss-ssg.js\|libs/utils" README.md llms.txt` — Expected: no matches except inside the migration notes. Run: `npm test`.

```bash
git add llms.txt README.md
git commit -m "Document v2: ESM, awaited generate, close(), utils export, migration notes"
```

---

## Final verification (Fable oversight)

- `npm test` — all green, process exits promptly.
- `npm run lint` — no errors.
- `npm run test:coverage` — every `lib/*.js` appears with non-trivial coverage.
- All six examples build their output (Task 12 Step 3 loop) and `node docs.js` regenerates `docs/index.html`.
- `git ls-files | grep -E "^(kiss-ssg.js|kiss-serve.js|libs/|.eslintrc.js)"` — empty.
- Spec coverage check against `planning/specs/2026-09-02-v2-solid-refactor-design.md`: Compatibility list, four behavior fixes, per-instance Handlebars, `close()`, ESM notes, dependency removals, AIKB enforcement, docs — each has a task above.
