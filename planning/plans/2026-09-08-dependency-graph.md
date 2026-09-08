# Dependency graph (partial → page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Under `watch()`, an edited partial or layout re-renders only the pages that rendered it, with today's every-page re-render as the fallback — plus the amendment that a `generate: false` page no longer claims its output path.

**Architecture:** Every partial is registered as a function that records "page X invoked me" into a per-instance `DependencyGraph` before delegating to the compiled template. The page identity travels in Handlebars' own data frame (`template(ctx, { data: { kissPage: buildTo } })`), which reaches nested, dynamic (`lookup`) and layout (`extend`) partial calls alike — verified by probe on 2026-09-08 — so there is no shared "current page" marker and no ordering invariant. `Kiss._handleChange` asks the graph for a partial's dependents and re-renders those stack entries through the existing serial rebuild queue; an unknown partial falls back to every entry and logs a notice naming the file.

**Tech Stack:** Node ≥22.12 ESM, Handlebars 4 (`hbs.registerPartial` accepts a function partial called as `partial(context, options)`), handlebars-layouts, Vitest, fs-extra. No new dependencies.

**Spec:** `planning/specs/2026-09-05-watch-dependency-graph-design.md` (read its "Step 3 — the traced graph", "Testing" and "Rollout order" sections; this plan supersedes its "current-page marker" mechanism with the data-frame one). Brief: `planning/sessions/2026-09-08-incremental-rebuild.md`.

## Global Constraints

- Engine code goes in `lib/`, one responsibility per file; every new or changed `lib/` module ships its `test/unit/` sibling and its `AIKB/` doc in the same commit; a new module also gets a `CLAUDE.md` table row. `test/aikb.test.js` enforces the docs (headings: `## Responsibility`, `## Public interface`, `## Depends on`, `## Depended on by`, `## Non-obvious behavior`).
- Only `lib/logger.js` imports `colors`; everything logs through the injected `logger`.
- Never push an unhandled promise onto `Kiss._promises`.
- Public-API-visible prose lives in `llms.txt` and `README.md`; regenerate `types/` with `npm run types` when a JSDoc signature changes (Task 4 adds a private field only, but run it to be sure the check stays green).
- JSDoc is type-checked: `npm run typecheck` runs `tsc --checkJs` over `lib/`. A private class field annotated with `@type` needs `@private` in the **same** JSDoc block.
- Prettier: no semicolons, single quotes (`npm run format`). `.hbs` files are not formatted.
- Per-instance Handlebars isolation is a pinned invariant (`test/integration/isolation.test.js`): the graph is a field on the `Kiss` instance, never module scope.
- Tracing must never affect rendering: a wrapper returns exactly `compiled(context, options)`; a failure inside `record()` is swallowed.
- Every step's commit message ends with the session's attribution trailer (see the repo's commit convention in the harness instructions).
- Run the cheap subset while iterating (`npx vitest run <file>`); `npm run gates` once at the end of each task.

### Model delegation (from the spec's § Model delegation)

| Task                                          | Model                | Why                                                              |
| --------------------------------------------- | -------------------- | ---------------------------------------------------------------- |
| 0 (amendment), 1 (pure module + docs)         | Sonnet               | well-specified, mechanical, the test names the behaviour         |
| 2, 3, 4                                       | Opus                 | judgement about current engine behaviour and Handlebars' runtime |
| Review of every diff, the pulse between tasks | Fable (this session) | cross-cutting                                                    |

---

## File structure

| File                                                                                                                                               | Responsibility                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/dependency-graph.js` (new)                                                                                                                    | Pure bidirectional index: partial name ↔ page key. No I/O, no Handlebars.                                                                                                                                                                                                        |
| `lib/partials.js`                                                                                                                                  | Registers every partial as a recording function; exports `partialNameFor(file, folders)` — the one place a file path becomes a partial name.                                                                                                                                     |
| `lib/kiss-page.js`                                                                                                                                 | Clears its own edges, then renders with `{ data: { kissPage: buildTo } }`; dev debug sibling lists the partials the page used.                                                                                                                                                   |
| `lib/kiss.js`                                                                                                                                      | Owns the `DependencyGraph`, hands it to partials and pages, clears it on replay, dispatches a partial edit to dependents with fallback + notice, writes `dependency-graph.json` in verbose dev. Amendment: `generate: false` pages neither claim a path nor protect a stale one. |
| `lib/sitemap.js`                                                                                                                                   | Amendment: skips `generate: false` entries.                                                                                                                                                                                                                                      |
| `test/unit/dependency-graph.test.js` (new), `test/unit/partials.test.js`, `test/unit/kiss-page.test.js`, `test/unit/sitemap.test.js`               | Unit coverage per module.                                                                                                                                                                                                                                                        |
| `test/integration/watch.test.js`, `test/integration/generate-false.test.js` (new)                                                                  | Scoped dispatch, fallback, dropped edge; the amendment.                                                                                                                                                                                                                          |
| `AIKB/dependency-graph.md` (new), `AIKB/partials.md`, `AIKB/kiss-page.md`, `AIKB/kiss.md`, `AIKB/sitemap.md`, `CLAUDE.md`, `llms.txt`, `README.md` | Docs, same commit as the code they describe.                                                                                                                                                                                                                                     |

---

### Task 0: Amendment — a `generate: false` page claims no output path

**Files:**

- Modify: `lib/kiss.js` — `_preparePage` (the `_stack.some(...)` dedupe, ~line 707) and the replay sweep's `current` set (~line 1358)
- Modify: `lib/sitemap.js:9` (`buildSitemapEntries` filter)
- Create: `test/integration/generate-false.test.js`
- Modify: `test/unit/sitemap.test.js` (one case)
- Modify: `AIKB/kiss.md`, `AIKB/sitemap.md`, `llms.txt` (the `.page()` bullet's `options.generate` sentence, line 9)

**Interfaces:**

- Consumes: `entry.page.options.generate` — `KissPage.prepare()` defaults it to `true`; a `.page()` option or a controller patch sets `false`.
- Produces: nothing new; behaviour only.

- [ ] **Step 1: Write the failing integration test**

```js
// test/integration/generate-false.test.js
import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})

describe('generate: false', () => {
  it('does not claim its output path, so a real page registered later builds', async () => {
    site = await makeSite({
      'src/pages/real.hbs': 'REAL',
      'src/pages/skipped.hbs': 'SKIPPED',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'skipped.hbs', slug: 'about', generate: false })
      .page({ view: 'real.hbs', slug: 'about' })
      .generate()
    await expect(kiss.complete()).resolves.toBeDefined()
    expect(await site.read('public/about.html')).toBe('REAL')
    expect(kiss.report().failures).toEqual([])
  })

  it('is dropped without a failure when a real page already holds the path', async () => {
    site = await makeSite({
      'src/pages/real.hbs': 'REAL',
      'src/pages/skipped.hbs': 'SKIPPED',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'real.hbs', slug: 'about' })
      .page({ view: 'skipped.hbs', slug: 'about', generate: false })
      .generate()
    await expect(kiss.complete()).resolves.toBeDefined()
    expect(await site.read('public/about.html')).toBe('REAL')
    expect(kiss.report().failures).toEqual([])
  })

  it('is left out of sitemap.xml', async () => {
    site = await makeSite({
      'src/pages/real.hbs': 'REAL',
      'src/pages/skipped.hbs': 'SKIPPED',
    })
    const kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      siteUrl: 'https://example.com',
    })
      .page({ view: 'real.hbs' })
      .page({ view: 'skipped.hbs', generate: false })
      .sitemap()
      .generate()
    await kiss.complete()
    const xml = await site.read('public/sitemap.xml')
    expect(xml).toContain('https://example.com/real')
    expect(xml).not.toContain('skipped')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/integration/generate-false.test.js`
Expected: the first two cases FAIL — `complete()` rejects with `1 page(s) failed to build: …about.html` (`Page already processed`); the third FAILS because `skipped` is in the XML.

- [ ] **Step 3: Implement — dedupe ignores pages that will not be written**

In `lib/kiss.js` `_preparePage`, replace the dedupe:

```js
const preparedPage = kissPage.prepare()
const buildTo = preparedPage.buildTo
// A page that will not be written claims no output path: it neither fails
// a real page registered after it nor fails itself when one came first.
const writes = (page) => page.options.generate !== false
const claimed = this._stack.some(
  (entry) => entry.buildTo === buildTo && writes(entry.page),
)
if (claimed && writes(preparedPage)) {
  this.logger.error('Page already processed', buildTo)
  // A build failure, not a skip: two pages claiming one output path means
  // one of them is missing from a build that would otherwise succeed.
  this._failures.push({
    view: preparedPage.view,
    buildTo,
    error: new Error(`Page already processed: ${buildTo}`),
  })
  return null
}
```

In the replay sweep (`finally` block of `_replay`, the line `const current = new Set(this._stack.map((entry) => entry.buildTo))`), a page that stops being written must not shield its old output from the sweep:

```js
const current = new Set(
  this._stack
    .filter((entry) => entry.page.options.generate !== false)
    .map((entry) => entry.buildTo),
)
```

In `lib/sitemap.js` `buildSitemapEntries`:

```js
return stack.filter(
  (entry) =>
    !entry.page.options.ignoreSitemap && entry.page.options.generate !== false,
)
```

- [ ] **Step 4: Add the sitemap unit case**

In `test/unit/sitemap.test.js`, next to the existing `ignoreSitemap` case (find it with `grep -n ignoreSitemap test/unit/sitemap.test.js`), following that file's stack-entry fixture shape:

```js
it('skips a page that is not generated', () => {
  const stack = [
    { buildTo: 'out/a.html', page: { options: {} } },
    { buildTo: 'out/b.html', page: { options: { generate: false } } },
  ]
  const urls = buildSitemapEntries(stack, {
    siteUrl: 'https://example.com',
    buildDir: 'out',
  })
  expect(urls.map((u) => u.loc)).toEqual(['https://example.com/a'])
})
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/integration/generate-false.test.js test/unit/sitemap.test.js test/integration/watch.test.js`
Expected: PASS. The three existing `Page already processed` cases in `watch.test.js` (lines ~153, ~184, ~556) still pass — they register real pages.

- [ ] **Step 6: Docs**

`AIKB/kiss.md` § Non-obvious behavior, one bullet: "**A `generate: false` page claims no output path.** `_preparePage`'s `buildTo` dedupe only counts entries that will be written, on both sides — a skipped page neither fails a real page registered after it nor fails itself when one came first — and the replay sweep's `current` set excludes them, so a page that turns `generate: false` between builds has its stale output removed. It still sits on `_stack` (so `.scan()`'s by-view dedupe and the `complete()` data array are unchanged) and is skipped by the sitemap." `AIKB/sitemap.md` § Public interface: add "and where `entry.page.options.generate === false`" to the skip sentence. `llms.txt` line 9, after "set `false` to skip building this one page entirely — nothing is written": add "and it claims no output path, so it cannot collide with a page that is".

- [ ] **Step 7: Gates and commit**

Run: `npm run gates`
Expected: all five pass.

```bash
git add lib/kiss.js lib/sitemap.js test/integration/generate-false.test.js test/unit/sitemap.test.js AIKB/kiss.md AIKB/sitemap.md llms.txt
git commit -m "A generate:false page claims no output path and is left out of the sitemap"
```

---

### Task 1: `lib/dependency-graph.js` — the pure index

**Files:**

- Create: `lib/dependency-graph.js`
- Create: `test/unit/dependency-graph.test.js`
- Create: `AIKB/dependency-graph.md`
- Modify: `CLAUDE.md` (the Architecture knowledge base table)

**Interfaces:**

- Produces (used by Tasks 2–4):
  - `class DependencyGraph`
  - `record(page: string, partial: string): void` — adds the edge in both directions.
  - `clearPage(page: string): void` — removes every edge of that page; a partial it used stays known, possibly with no dependents.
  - `clear(): void` — forgets everything.
  - `dependentsOf(partial: string): string[] | null` — `null` if the partial has never been recorded, else the page keys (sorted).
  - `usesOf(page: string): string[]` — the partial names that page recorded (sorted), `[]` if none.
  - `get size(): number` — how many partials are known.
  - `toJSON(): Record<string, string[]>` — `{ [partial]: pages[] }`, keys and values sorted, so a dump is stable.

- [ ] **Step 1: Write the failing unit test**

```js
// test/unit/dependency-graph.test.js
import { describe, it, expect } from 'vitest'
import { DependencyGraph } from '../../lib/dependency-graph.js'

describe('DependencyGraph', () => {
  it('answers null for a partial it has never seen', () => {
    const g = new DependencyGraph()
    expect(g.dependentsOf('nav')).toBeNull()
    expect(g.usesOf('a.html')).toEqual([])
    expect(g.size).toBe(0)
  })

  it('records an edge in both directions, once', () => {
    const g = new DependencyGraph()
    g.record('a.html', 'nav')
    g.record('a.html', 'nav')
    g.record('b.html', 'nav')
    g.record('a.html', 'footer')
    expect(g.dependentsOf('nav')).toEqual(['a.html', 'b.html'])
    expect(g.usesOf('a.html')).toEqual(['footer', 'nav'])
    expect(g.size).toBe(2)
  })

  it('clearPage drops that page from every partial but keeps the partials known', () => {
    const g = new DependencyGraph()
    g.record('a.html', 'nav')
    g.record('b.html', 'nav')
    g.clearPage('a.html')
    expect(g.dependentsOf('nav')).toEqual(['b.html'])
    expect(g.usesOf('a.html')).toEqual([])
    g.clearPage('b.html')
    // Known with no dependents is not the same as unknown: an edit to it
    // re-renders nothing, rather than everything.
    expect(g.dependentsOf('nav')).toEqual([])
  })

  it('clear forgets everything', () => {
    const g = new DependencyGraph()
    g.record('a.html', 'nav')
    g.clear()
    expect(g.dependentsOf('nav')).toBeNull()
    expect(g.size).toBe(0)
  })

  it('serialises sorted, partial to pages', () => {
    const g = new DependencyGraph()
    g.record('b.html', 'nav')
    g.record('a.html', 'nav')
    g.record('a.html', 'footer')
    expect(g.toJSON()).toEqual({
      footer: ['a.html'],
      nav: ['a.html', 'b.html'],
    })
    expect(JSON.stringify(g)).toBe(
      '{"footer":["a.html"],"nav":["a.html","b.html"]}',
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/dependency-graph.test.js`
Expected: FAIL — cannot find module `../../lib/dependency-graph.js`.

- [ ] **Step 3: Implement**

```js
// lib/dependency-graph.js
// Which pages rendered which partials, learned by watching renders happen.
//
// A partial is registered as a function that records "page X invoked me"
// (lib/partials.js) before delegating to the compiled template, and a page
// clears its own edges before each render (lib/kiss-page.js). So after any
// build the graph says, for every partial a page actually reached — through
// nesting, `{{> (lookup …)}}`, or a layout's `{{#extend}}` — which pages must
// be re-rendered when that partial changes. Nothing here parses a template:
// a dynamic partial name cannot be resolved statically, and this never tries.
//
// Two answers are deliberately different. `dependentsOf` returns `null` for a
// partial no page has ever recorded — the caller re-renders everything, because
// "never seen" usually means "not rendered yet" — and `[]` for one that was
// recorded and has since lost every page, which is a real answer: an edit to
// a partial no page uses changes no output.

export class DependencyGraph {
  /** @type {Map<string, Set<string>>} partial name → page keys @private */
  _dependents = new Map()
  /** @type {Map<string, Set<string>>} page key → partial names @private */
  _uses = new Map()

  /**
   * @param {string} page the page's key — its `buildTo`
   * @param {string} partial the partial's registered name
   */
  record(page, partial) {
    if (!this._dependents.has(partial)) this._dependents.set(partial, new Set())
    this._dependents.get(partial)?.add(page)
    if (!this._uses.has(page)) this._uses.set(page, new Set())
    this._uses.get(page)?.add(partial)
  }

  /** @param {string} page */
  clearPage(page) {
    for (const partial of this._uses.get(page) ?? [])
      this._dependents.get(partial)?.delete(page)
    this._uses.delete(page)
  }

  clear() {
    this._dependents.clear()
    this._uses.clear()
  }

  /**
   * @param {string} partial
   * @returns {string[] | null} sorted page keys, or `null` if never recorded
   */
  dependentsOf(partial) {
    const pages = this._dependents.get(partial)
    return pages ? [...pages].sort() : null
  }

  /**
   * @param {string} page
   * @returns {string[]} sorted partial names
   */
  usesOf(page) {
    return [...(this._uses.get(page) ?? [])].sort()
  }

  /** @returns {number} how many partials are known */
  get size() {
    return this._dependents.size
  }

  /** @returns {Record<string, string[]>} `{ [partial]: pages }`, both sorted */
  toJSON() {
    return Object.fromEntries(
      [...this._dependents.keys()]
        .sort()
        .map((partial) => [partial, this.dependentsOf(partial) ?? []]),
    )
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/unit/dependency-graph.test.js`
Expected: PASS, 5 cases.

- [ ] **Step 5: AIKB doc and CLAUDE.md row**

Create `AIKB/dependency-graph.md` with exactly these headings, following `AIKB/sitemap.md`'s voice:

```markdown
# dependency-graph.js

## Responsibility

A pure, per-instance index of which pages rendered which partials, populated as a side effect of rendering and read by `Kiss._handleChange` to decide which pages an edited partial or layout can affect.

## Public interface

- `new DependencyGraph()`
- `record(page, partial)` — adds the edge both ways; idempotent. `page` is the page's `buildTo`, `partial` its registered name.
- `clearPage(page)` — removes every edge of that page. A partial it used stays known, possibly with no dependents.
- `clear()` — forgets everything (a whole-site replay discards the stack, so the graph goes with it).
- `dependentsOf(partial)` → `string[] | null` — sorted page keys, or **`null` if the partial was never recorded**. `null` and `[]` mean different things to the caller: `null` re-renders every page (the safe fallback), `[]` re-renders none.
- `usesOf(page)` → `string[]` — sorted partial names that page recorded.
- `size` — how many partials are known.
- `toJSON()` → `{ [partial]: pages[] }`, keys and values sorted, so `dependency-graph.json` is stable across builds.

## Depends on

Nothing.

## Depended on by

`lib/kiss.js` (owns one per instance; dispatch and the verbose-dev dump), `lib/partials.js` (records), `lib/kiss-page.js` (clears before render; lists in the debug sibling).

## Non-obvious behavior

- **It is filled by rendering, never by parsing.** A partial is registered as a function that records the invoking page (`lib/partials.js`), so a `{{> (lookup this "name")}}` chosen at render time, a partial reached through another partial, and a layout reached through `{{#extend}}` are all recorded. An inline partial (`{{#*inline}}`) shadows the registered one and records nothing — correct, the page does not depend on the file at that call site.
- **The page identity travels in Handlebars' data frame**, not in shared state: `KissPage.generate()` renders with `{ data: { kissPage: buildTo } }` and the recording wrapper reads `options.data.kissPage`. Handlebars copies the frame into every nested partial call and handlebars-layouts passes `{ data }` through `extend`/`embed`, so the attribution is correct however many pages render at once or in whatever order. There is no "current page" marker and no ordering invariant.
- **`null` is the fallback signal.** A partial edited before any page has rendered it (a fresh dev session mid-first-build, a partial only a page that failed would reach) has no record; the dispatcher then re-renders every entry and logs a notice naming the file. A partial whose pages all stopped using it is known with `[]` dependents and re-renders nothing.
- Keys are `buildTo`, which is stable under `dev: true` (`cleanBuild: 'atomic'` degrades to `true` there, so no staging paths).
```

Add to `CLAUDE.md`'s table, after the `Partials / layouts registration` row:

```markdown
| Dependency graph (partial → page) | `lib/dependency-graph.js` | `AIKB/dependency-graph.md` |
```

- [ ] **Step 6: Run the docs check, lint, typecheck, format; commit**

Run: `npx vitest run test/aikb.test.js test/unit/dependency-graph.test.js && npm run lint && npm run typecheck && npm run format`
Expected: all pass.

```bash
git add lib/dependency-graph.js test/unit/dependency-graph.test.js AIKB/dependency-graph.md CLAUDE.md
git commit -m "Add lib/dependency-graph.js: the partial-to-page index, unused for dispatch yet"
```

---

### Task 2: `lib/partials.js` — every partial is a recording function

**Files:**

- Modify: `lib/partials.js` (`registerPartialsFrom` ~line 21, the `compiled` option, the two comment blocks above `registerPartials`; add `partialNameFor`)
- Modify: `test/unit/partials.test.js` (replace the "registers a layout as a function and every other partial as a string" case; add tracing and `partialNameFor` cases)
- Modify: `AIKB/partials.md` (the "Layouts are registered compiled" and "Only layouts, and that restraint is the compatibility contract" bullets)

**Interfaces:**

- Consumes: `DependencyGraph#record(page, partial)` from Task 1.
- Produces:
  - `registerPartials(hbs, config, deps, previous)` — unchanged signature; `deps` gains an optional `graph` (`{ markdown, logger, graph? }`).
  - `registerPartialsFrom(hbs, folder, ext, deps)` — the `{ compiled }` fourth option is removed: every partial is registered compiled.
  - `partialNameFor(file, folders): string | null` — `file` a posix or native path as chokidar reports it; `folders` is `config.folders` (`partials`, `layouts`, either may be null). Returns the name `registerPartialsFrom` would derive, or `null` if the file is under neither folder.

- [ ] **Step 1: Write the failing tests**

Replace the `describe('layouts are registered compiled', …)` block's first case and add two describes. Keep the other cases in that block (`compiles a layout once…`, `does not move a broken layout's failure…`) untouched.

```js
it('registers every partial as a function', async () => {
  site = await makeSite({
    'src/partials/nav.hbs': '<nav/>',
    'src/partials/note.md': '# Note',
    'src/partials/raw.html': '<b>raw</b>',
    'src/layouts/main.hbs': '<main>{{#block "body"}}{{/block}}</main>',
  })
  const hbs = Handlebars.create()
  registerPartials(hbs, folders(site), deps)
  for (const name of ['main', 'nav', 'note', 'raw'])
    expect(typeof hbs.partials[name]).toBe('function')
  // Rendered output is what Handlebars would have produced from the string.
  expect(hbs.compile('{{> nav}}|{{> note}}|{{> raw}}')({})).toBe(
    '<nav/>|<h1>Note</h1>\n|<b>raw</b>',
  )
})
```

```js
describe('tracing', () => {
  const folders = (site) => ({
    folders: {
      partials: `${site.src}/partials`,
      layouts: `${site.src}/layouts`,
    },
  })

  it('records the invoking page for direct, nested, dynamic and layout partials', async () => {
    site = await makeSite({
      'src/partials/inner.hbs': 'inner',
      'src/partials/outer.hbs': 'outer[{{> inner}}]',
      'src/layouts/main.hbs': '<L>{{#block "body"}}{{/block}}</L>',
    })
    const hbs = Handlebars.create()
    layouts.register(hbs)
    const graph = new DependencyGraph()
    registerPartials(hbs, folders(site), { ...deps, graph })
    const page = hbs.compile(
      '{{#extend "main"}}{{#content "body"}}{{> outer}} {{> (lookup this "dyn")}}{{#*inline "inl"}}i{{/inline}}{{> inl}}{{/content}}{{/extend}}',
    )
    const out = page({ dyn: 'inner' }, { data: { kissPage: 'about.html' } })
    expect(out).toBe('<L>outer[inner] inneri</L>')
    expect(graph.dependentsOf('main')).toEqual(['about.html'])
    expect(graph.dependentsOf('outer')).toEqual(['about.html'])
    expect(graph.dependentsOf('inner')).toEqual(['about.html'])
    expect(graph.dependentsOf('inl')).toBeNull()
  })

  it('records nothing, and still renders, without a graph or without a page id', async () => {
    site = await makeSite({ 'src/partials/nav.hbs': '<nav/>' })
    const hbs = Handlebars.create()
    registerPartials(hbs, folders(site), deps)
    expect(hbs.compile('{{> nav}}')({})).toBe('<nav/>')
    const graph = new DependencyGraph()
    registerPartials(hbs, folders(site), { ...deps, graph })
    expect(hbs.compile('{{> nav}}')({})).toBe('<nav/>')
    expect(graph.size).toBe(0)
  })

  it('a throwing recorder never reaches the render', async () => {
    site = await makeSite({ 'src/partials/nav.hbs': '<nav/>' })
    const hbs = Handlebars.create()
    const graph = {
      record() {
        throw new Error('boom')
      },
    }
    registerPartials(hbs, folders(site), { ...deps, graph })
    expect(hbs.compile('{{> nav}}')({}, { data: { kissPage: 'x.html' } })).toBe(
      '<nav/>',
    )
  })
})

describe('partialNameFor', () => {
  const folders = {
    partials: '/site/src/partials',
    layouts: '/site/src/layouts',
  }

  it('derives the registered name from a file under the partials folder', () => {
    expect(partialNameFor('/site/src/partials/nav.hbs', folders)).toBe('nav')
    expect(partialNameFor('/site/src/partials/a/b.md', folders)).toBe('a/b')
    expect(partialNameFor('/site/src/partials/raw.html', folders)).toBe('raw')
  })

  it('derives a layout name the same way', () => {
    expect(partialNameFor('/site/src/layouts/main.hbs', folders)).toBe('main')
  })

  it('accepts a Windows path', () => {
    expect(partialNameFor('\\site\\src\\partials\\a\\b.hbs', folders)).toBe(
      'a/b',
    )
  })

  it('is null outside both folders, or when a folder is null', () => {
    expect(partialNameFor('/site/src/pages/x.hbs', folders)).toBeNull()
    expect(
      partialNameFor('/site/src/partials/nav.hbs', {
        partials: null,
        layouts: null,
      }),
    ).toBeNull()
  })
})
```

Add the imports at the top of the test file:

```js
import layouts from 'handlebars-layouts'
import { registerPartials, partialNameFor } from '../../lib/partials.js'
import { DependencyGraph } from '../../lib/dependency-graph.js'
```

and `const deps = { markdown: new Remarkable(), logger: silentLogger }` at module scope if the existing one is inside the old describe (move it out, keep one).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/unit/partials.test.js`
Expected: FAIL — `partialNameFor` is not exported; `typeof hbs.partials['nav']` is `'string'`; `dependentsOf` is `null` for everything.

- [ ] **Step 3: Implement**

In `lib/partials.js`, replace `registerPartialsFrom`'s registration line and drop the `{ compiled }` option:

```js
export function registerPartialsFrom(
  hbs,
  folder,
  ext,
  { markdown, logger, graph },
) {
  if (!folder) return []
  const root = posixPath(folder)
  const files = globFiles(root, `**/*.${ext}`)
  return files.map((file) => {
    let name = file.slice(root.length).replace(new RegExp(`\\.${ext}$`), '')
    if (name.startsWith('/')) name = name.slice(1)
    let source = fs.readFileSync(file, 'utf8')
    if (ext === 'md') source = markdown.render(source)
    hbs.registerPartial(name, tracingPartial(hbs, name, source, graph))
    logger.highlight(name)
    return name
  })
}

// A function partial is called by Handlebars as `partial(context, options)`
// (runtime `invokePartial`) and by handlebars-layouts' `extend`/`embed` as
// `template(context, { data })`. Both hand over the data frame, which is where
// `KissPage.generate()` put the page's identity, so the wrapper knows who is
// rendering without any shared state. It must return exactly what the compiled
// template returns — a string — or Handlebars tries to compile the function
// (`undefined`) or splits a SafeString on newlines for an indented call.
function tracingPartial(hbs, name, source, graph) {
  const compiled = hbs.compile(source)
  return (context, options) => {
    const page = options?.data?.kissPage
    if (graph && page) {
      try {
        graph.record(page, name)
      } catch {
        // Tracing must never affect rendering.
      }
    }
    return compiled(context, options)
  }
}

/**
 * The name `registerPartialsFrom` derives for a file, from its path alone —
 * so a watcher event can be mapped to the partial it names. `null` when the
 * file is under neither folder.
 *
 * @param {string} file a path as chokidar reports it (native or posix)
 * @param {{ partials?: string | null, layouts?: string | null }} folders
 * @returns {string | null}
 */
export function partialNameFor(file, folders) {
  const target = posixPath(file)
  for (const folder of [folders.partials, folders.layouts]) {
    if (!folder) continue
    const root = posixPath(folder).replace(/\/+$/, '')
    if (!target.startsWith(`${root}/`)) continue
    return target.slice(root.length + 1).replace(/\.[^./]+$/, '')
  }
  return null
}
```

In `registerPartials`, the four calls lose their fourth argument:

```js
const names = [
  ...registerPartialsFrom(hbs, partials, 'html', deps),
  ...registerPartialsFrom(hbs, partials, 'md', deps),
  ...registerPartialsFrom(hbs, partials, 'hbs', deps),
  ...registerPartialsFrom(hbs, layouts, 'hbs', deps),
]
```

Delete the comment block that begins "Layouts are registered compiled; every other partial stays a source string." through "…registering eagerly moves no failure earlier." and replace it with:

```js
// Every partial is registered as a compiled, recording function — see
// `tracingPartial`. Two things that used to be true still hold: a layout is
// compiled once rather than on every `{{#extend}}` (handlebars-layouts
// compiles a string partial per render and never writes the result back), and
// `hbs.compile` is lazy, so a partial that will not parse still fails at
// render, against the page that used it, not at registration.
//
// `hbs.partials[name]` is therefore always a function. It was a string only
// until the first render anyway — Handlebars compiles a string partial on first
// use and writes the function back into the same object — so a consumer helper
// that reads an entry has always had to accept both shapes; the migration notes
// (llms.txt, README) give the one-line form.
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/unit/partials.test.js test/integration/watch.test.js test/integration/isolation.test.js`
Expected: PASS. (`watch.test.js`'s partial/layout cases exercise the new functions through real renders.)

- [ ] **Step 5: AIKB/partials.md**

Replace the two bullets "**Layouts are registered compiled; every other partial stays a source string.**" and "**Only layouts, and that restraint is the compatibility contract.**" with:

```markdown
- **Every partial is registered as a compiled, recording function** (`tracingPartial`). Handlebars calls a function partial as `partial(context, options)` and handlebars-layouts' `extend`/`embed` as `template(context, { data })`; the wrapper reads `options.data.kissPage` — the page identity `KissPage.generate()` puts in the render's data frame — records `(page, name)` on the injected `deps.graph` (`AIKB/dependency-graph.md`), and returns exactly `compiled(context, options)`. The return contract matters: `undefined` makes Handlebars try to compile the function, and a `SafeString` breaks an indented partial call, which splits the result on newlines. A recorder that throws is swallowed; tracing never affects rendering. Without a `graph` in `deps`, or without a page id in the data, the wrapper is a plain compiled partial.
- **Layouts keep their earlier win**: compiled once rather than per `{{#extend}}` — measured when that change landed: `fanout@500` **-27.1%**, `models@500` **-15.7%**, `watch@500` **-17.5%**, `scan@500` **-10.7%**, a watch replay after a model edit **455ms → 172ms**. Registering every partial compiled costs nothing extra: `hbs.compile` is lazy, so an unrendered partial is never parsed and a partial that will not parse still fails at render against the page that used it.
- **`hbs.partials[name]` is a function always** — the compatibility line moved. It was a string only until the first render anyway (Handlebars compiles a string partial on first use and writes the function back into the same object — `mergeIfNeeded` returns `env.partials` uncopied), so a consumer helper reading an entry has always had to accept both; `learna-kiss`'s `getSiteSpecificPartial` calls `handlebars.compile(partial)` unconditionally and would have broken on any partial after its first render. The one-line form is in `llms.txt` and `README.md`: `typeof p === 'function' ? p(ctx, opts) : kiss.handlebars.compile(p)(ctx)`.
- `partialNameFor(file, folders)` is the only place a file path becomes a partial name outside registration, and it reuses the same slice-and-strip; `Kiss._handleChange` calls it so a chokidar path maps to the name the graph knows. A collision (`foo.md` and `foo.hbs`) maps to one name from either path, which is right: whichever file changed, the registered `foo` is what pages invoked.
```

Also update `test/unit/partials.test.js`'s comment above the old describe (it says "Layouts are the one kind of partial registered compiled") to match.

- [ ] **Step 6: Gates and commit**

Run: `npm run gates`
Expected: pass.

```bash
git add lib/partials.js test/unit/partials.test.js AIKB/partials.md
git commit -m "Register every partial as a recording function; add partialNameFor"
```

---

### Task 3: `lib/kiss-page.js` — the page names itself to its partials

**Files:**

- Modify: `lib/kiss-page.js` (constructor deps ~line 85; `generate()` ~line 162–166; the dev debug sibling ~line 220)
- Modify: `test/unit/kiss-page.test.js`
- Modify: `AIKB/kiss-page.md`

**Interfaces:**

- Consumes: `DependencyGraph#clearPage(page)`, `#usesOf(page)` from Task 1.
- Produces: `new KissPage(view, { hbs, logger, graph? })` — `graph` optional. The render's data frame carries `kissPage: this.buildTo`. The dev-mode `.json` sibling gains a top-level `partials: string[]` when a graph is present.

- [ ] **Step 1: Write the failing tests**

Add to `test/unit/kiss-page.test.js` inside `describe('generate', …)`:

```js
it('names itself to its partials through the data frame, clearing its edges first', async () => {
  site = await makeSite({})
  const hbs = Handlebars.create()
  const seen = []
  hbs.registerPartial('p', (ctx, options) => {
    seen.push(options?.data?.kissPage)
    return 'P'
  })
  const calls = []
  const graph = {
    clearPage: (page) => calls.push(['clear', page]),
    usesOf: () => ['p'],
  }
  const page = new KissPage('<i>{{> p}}</i>', {
    hbs,
    logger: silentLogger,
    graph,
  })
  page.buildDir = site.build
  page.slug = 's'
  page.isDev = true
  page.options = {}
  page.prepare()
  await page.generate()
  expect(seen).toEqual([page.buildTo])
  expect(calls).toEqual([['clear', page.buildTo]])
  const sibling = JSON.parse(await site.read('public/s.json'))
  expect(sibling.partials).toEqual(['p'])
})

it('renders identically with no graph injected', async () => {
  site = await makeSite({})
  const p = make('<i>{{title}}</i>', { buildDir: site.build, slug: 't' })
  await p.generate()
  expect(await site.read('public/t.html')).toBe('<i>T</i>')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/unit/kiss-page.test.js`
Expected: the first FAILS — `seen` is `[undefined]`, `calls` is `[]`. The second passes already (it pins that nothing changes without a graph).

- [ ] **Step 3: Implement**

Constructor:

```js
  /**
   * @param {string} view a `.hbs` filename under `pagesDir`, or inline template
   *   source
   * @param {{ hbs?: any, logger?: any, graph?: import('./dependency-graph.js').DependencyGraph }} [deps]
   */
  constructor(view, { hbs, logger, graph } = {}) {
    this.view = view
    this.hbs = hbs
    this.logger = logger || createLogger()
    this.graph = graph
    this._title = toTitleCase(this._slug)
  }
```

In `generate()`, replace `let output = template(this.options)` with:

```js
// The page's identity rides in Handlebars' data frame, which every
// partial call inherits — nested, dynamic and layout alike — so the
// recording partials (lib/partials.js) know who is rendering with no
// shared state. Its old edges go first: a render is the whole truth
// about what this page uses now.
this.graph?.clearPage(this.buildTo)
let output = template(this.options, {
  data: { kissPage: this.buildTo },
})
```

In the dev debug sibling, replace the `this.options` argument of `fs.outputJson(...)`:

```js
              this.graph
                ? { ...this.options, partials: this.graph.usesOf(this.buildTo) }
                : this.options,
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/unit/kiss-page.test.js test/integration/`
Expected: PASS. (`test/integration/watch.test.js` line ~80's debug-sibling assertions, if any compare the whole object, need `partials` added — check with `grep -n "\.json" test/integration/*.js` and adjust only an exact-equality assertion on the sibling.)

- [ ] **Step 5: AIKB/kiss-page.md**

Add under § Non-obvious behavior:

```markdown
- **The render carries the page's identity in Handlebars' data frame**: `template(this.options, { data: { kissPage: this.buildTo } })`. Handlebars copies the frame into every nested partial invocation and handlebars-layouts passes `{ data }` through `extend`/`embed`, so a recording partial (`AIKB/partials.md`) reads `options.data.kissPage` and attributes itself to the right page whatever the render order — there is no "current page" variable and no assumption that pages render one at a time. Before rendering, the page calls `graph.clearPage(buildTo)` so its edge set is exactly what this render reached. `graph` is optional (`deps.graph`); without it the render is byte-identical to before — the extra `data` only adds a key to a frame Handlebars creates anyway.
- In dev mode the `.json` sibling gains `partials`: the names this page recorded, from `graph.usesOf(buildTo)` — the per-page view of `dependency-graph.json`.
```

- [ ] **Step 6: Gates and commit**

Run: `npm run gates`
Expected: pass.

```bash
git add lib/kiss-page.js test/unit/kiss-page.test.js AIKB/kiss-page.md
git commit -m "KissPage names itself to its partials through the data frame"
```

---

### Task 4: `lib/kiss.js` — own the graph, dispatch through it, show it

**Files:**

- Modify: `lib/kiss.js` — private fields (~line 200), constructor before `this.registerPartials()` (~line 345), `registerPartials()` (~line 466), `_preparePage` (~line 690), `_replay()` after `this._stack = []` (~line 1279), `_handleChange` partial branch (~line 1476–1485), `_finishBuild` (~line 650)
- Modify: `test/integration/watch.test.js` (three cases in `describe('partial and layout fast path', …)`)
- Modify: `AIKB/kiss.md`, `llms.txt` (lines 16 and 179), `README.md` (the watch paragraph and line ~642), `CLAUDE.md` ("Pipeline in one paragraph"), `planning/specs/2026-09-05-watch-dependency-graph-design.md` (status line)

**Interfaces:**

- Consumes: `DependencyGraph` (Task 1), `partialNameFor` (Task 2), `KissPage` deps `graph` (Task 3), the existing `_requestRebuild(entries)` / `_requestReplay()` queue.
- Produces: behaviour; `dependency-graph.json` in the build folder under `dev: true` + `verbose: true`.

- [ ] **Step 1: Write the failing integration tests**

Add inside `describe('partial and layout fast path', …)` in `test/integration/watch.test.js` (it already has `drained`, `makeSite`, `waitFor`, `sleep`, `silentLogger`, `vi`, `fs`):

```js
it('re-renders only the pages that rendered the edited partial', async () => {
  site = await makeSite({
    'src/pages/uses.hbs': '[{{> foo}}]',
    'src/pages/other.hbs': 'other',
    'src/partials/foo.hbs': 'V1',
  })
  kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    .scan()
    .generate()
  await kiss.complete()
  const before = (await fs.stat(`${site.build}/other.html`)).mtimeMs

  kiss.watch({ entry: null })
  await kiss._watcher.ready
  await site.touch('src/partials/foo.hbs', 'V2')
  await waitFor(async () => (await site.read('public/uses.html')) === '[V2]')
  await drained()
  await sleep(300)
  // Untouched output, not merely unchanged content: the other page was
  // never re-rendered.
  expect((await fs.stat(`${site.build}/other.html`)).mtimeMs).toBe(before)
  expect(await site.read('public/other.html')).toBe('other')
})

it('falls back to every page, and says so, for a partial no page has rendered', async () => {
  const notices = []
  const logger = {
    ...silentLogger,
    notice: (...args) => notices.push(args.join(' ')),
  }
  site = await makeSite({
    'src/pages/a.hbs': 'A',
    'src/pages/b.hbs': 'B',
    'src/partials/unused.hbs': 'U1',
  })
  kiss = new Kiss({ folders: site.folders, logger }).scan().generate()
  await kiss.complete()
  const a = (await fs.stat(`${site.build}/a.html`)).mtimeMs
  const b = (await fs.stat(`${site.build}/b.html`)).mtimeMs

  kiss.watch({ entry: null })
  await kiss._watcher.ready
  await site.touch('src/partials/unused.hbs', 'U2')
  await waitFor(async () => (await fs.stat(`${site.build}/b.html`)).mtimeMs > b)
  await drained()
  expect((await fs.stat(`${site.build}/a.html`)).mtimeMs).toBeGreaterThan(a)
  expect(notices.some((n) => n.includes('unused'))).toBe(true)
})

it('stops re-rendering a page that stopped using the partial', async () => {
  site = await makeSite({
    'src/pages/p.hbs': '[{{> foo}}]',
    'src/partials/foo.hbs': 'V1',
  })
  kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    .scan()
    .generate()
  await kiss.complete()
  kiss.watch({ entry: null })
  await kiss._watcher.ready

  await site.touch('src/pages/p.hbs', 'plain')
  await waitFor(async () => (await site.read('public/p.html')) === 'plain')
  await drained()
  const after = (await fs.stat(`${site.build}/p.html`)).mtimeMs

  await site.touch('src/partials/foo.hbs', 'V2')
  await sleep(500)
  await drained()
  expect((await fs.stat(`${site.build}/p.html`)).mtimeMs).toBe(after)
})
```

And one for the dump, in `describe('watch()', …)` or a new `describe('dependency graph dump', …)` at the end of the file:

```js
describe('dependency graph dump', () => {
  it('writes dependency-graph.json in verbose dev mode, partial to pages', async () => {
    site = await makeSite({
      'src/pages/a.hbs': '{{> foo}}',
      'src/pages/b.hbs': '{{> foo}}{{> bar}}',
      'src/partials/foo.hbs': 'F',
      'src/partials/bar.hbs': 'B',
    })
    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      dev: true,
      verbose: true,
      port: 0,
      livereloadPort: 0,
    })
      .scan()
      .generate()
    await kiss.complete()
    const dump = JSON.parse(await site.read('public/dependency-graph.json'))
    expect(dump).toEqual({
      bar: [`${site.build}/b.html`],
      foo: [`${site.build}/a.html`, `${site.build}/b.html`],
    })
  })
})
```

(The file already mocks the dev server — see its `vi.hoisted` block — so `dev: true` starts no real server; keep `port: 0, livereloadPort: 0` anyway so nothing binds if the mock is ever narrowed. If `kiss.close()` is what the file's `afterEach` calls, it already covers this case.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/integration/watch.test.js -t "fast path|dependency graph dump"`
Expected: `re-renders only…` FAILS (other.html's mtime advanced); `falls back…` FAILS (no notice); `stops re-rendering…` FAILS (p.html re-rendered); the dump FAILS (no file).

- [ ] **Step 3: Implement**

Imports at the top of `lib/kiss.js`:

```js
import { registerPartials, partialNameFor } from './partials.js'
import { DependencyGraph } from './dependency-graph.js'
```

Private field, next to `_partialNames`:

```js
/**
 * Which pages rendered which partials, learned from rendering. Read by
 * `_handleChange` to scope a partial edit; cleared by `_replay()`.
 * @type {DependencyGraph} @private
 */
_graph = new DependencyGraph()
```

`registerPartials()`:

```js
  registerPartials() {
    this._partialNames = registerPartials(
      this.handlebars,
      this.config,
      { markdown: this.remarkable, logger: this.logger, graph: this._graph },
      this._partialNames,
    )
    return this._partialNames
  }
```

`_preparePage`:

```js
const kissPage = new KissPage(options.view, {
  hbs: this.handlebars,
  logger: this.logger,
  graph: this._graph,
})
```

`_replay()`, immediately after `this._stack = []`:

```js
// The stack is gone, so is everything the graph knew about it; every page
// re-records itself as the replay renders it.
this._graph.clear()
```

`_handleChange`, the partial/layout branch — replace its body from `this.logger.info(\`${event}: ${changed}: \`, this._stack.length)`to`return this._requestRebuild(this._stack)` with:

```js
// Whether a rebuild already in flight read this file before or after the
// edit landed is a race nobody can reason about, so it is upgraded to a
// replay rather than scoped.
if (this._rebuildInFlight) return replay()
this.registerPartials()
const name = partialNameFor(changed, this.config.folders)
const dependents = name ? this._graph.dependentsOf(name) : null
// Never seen: not rendered yet, or only reachable from a page that
// failed. Every page is the safe answer, and the notice is what turns a
// slow-but-correct rebuild into a fixable gap.
if (dependents === null) {
  this.logger.notice(
    `No page has rendered ${changed} yet: re-rendering every page`,
  )
  this.logger.info(`${event}: ${changed}: `, this._stack.length)
  return this._requestRebuild(this._stack)
}
const wanted = new Set(dependents)
const entries = this._stack.filter((entry) => wanted.has(entry.buildTo))
this.logger.info(`${event}: ${changed}: `, entries.length)
entries.forEach((m) => this.logger.info('Rebuilding:', m.page.view))
return this._requestRebuild(entries)
```

`_finishBuild`, after `this._report = buildReport({ … })` and before `const reportFile = process.env.KISS_REPORT`:

```js
// The graph as data, for a human to look at: which pages each partial
// reaches. Dev only — a one-shot build has no watcher to use it — and
// verbose only, beside debug.json. A failure to write it is logged, never
// a build failure.
if (this.config.dev && this.config.verbose)
  await fs
    .outputJson(
      `${this.config.folders.build}/dependency-graph.json`,
      this._graph.toJSON(),
      { spaces: 2 },
    )
    .catch((err) =>
      this.logger.error(
        `Could not write dependency-graph.json: ${err.message}`,
      ),
    )
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/integration/watch.test.js test/integration/isolation.test.js test/integration/check.test.js`
Expected: PASS, every existing case unedited. In particular `re-renders the whole stack on a partial edit without re-resolving models` still passes: its single page uses the partial, so the scoped set is the whole stack.

- [ ] **Step 5: Docs**

`AIKB/kiss.md` § Non-obvious behavior — replace the bullet that describes the partial/layout fast path ("re-run `registerPartials()`, then re-render every entry in `_stack`" or similar; find it with `grep -n "partial" AIKB/kiss.md`) with:

```markdown
- **A partial or layout `change` re-renders the pages that rendered it.** `_handleChange` re-registers the partials, maps the path to a name with `partialNameFor`, and asks `_graph.dependentsOf(name)` (`AIKB/dependency-graph.md`): the matching stack entries go to `_requestRebuild`, through the same serial queue as every other rebuild. `null` — a partial no page has recorded, because nothing has rendered it yet or only a failed page would have — re-renders every entry and logs a notice naming the file, so an untraced edge shows up as a fixable gap rather than silent slowness. `[]` re-renders nothing, which is right: no page used it. A partial edit that arrives while a rebuild is in flight is still upgraded to a replay (below). Measured before the graph existed (diploma-msc, 654 pages): a partial save re-rendered everything in 1247ms; a page render is ≈1.9ms, so a partial N pages use now costs ≈2N ms plus registration.
- **The graph is per instance and cleared on replay.** `_graph` is a `DependencyGraph` field, handed to `registerPartials` (which records) and to every `KissPage` (which clears its own edges before rendering). `_replay()` clears it with the stack; every page re-records itself as it renders. In `dev: true` + `verbose: true`, `_finishBuild` writes `dependency-graph.json` (`{ partial: [buildTo…] }`, sorted) beside `debug.json`; each page's `.json` sibling lists its own `partials`.
```

`llms.txt` line 16 (`.watch()`): replace "Editing a partial or a layout re-registers the partials and re-renders every page, without re-resolving any model (URL models included) or re-running any controller — a partial edit cannot change the page set, a page's options, its output path or the sitemap." with: "Editing a partial or a layout re-registers the partials and re-renders **only the pages that rendered it** — learned at render time, so a partial chosen with `lookup`, reached through another partial, or used as a layout all count — without re-resolving any model (URL models included) or re-running any controller; a partial no page has rendered yet re-renders every page and logs a notice naming it. With `verbose: true` a dev build also writes `dependency-graph.json` (`{ partial: [built pages…] }`) beside `debug.json`, and each page's `.json` sibling lists the `partials` it used."

`llms.txt` line 179, append: "Every entry of `kiss.handlebars.partials` is a function — a compiled template that also records which page invoked it — so a helper that renders an entry by name must accept a function: `const p = kiss.handlebars.partials[name]; typeof p === 'function' ? p(ctx, opts) : kiss.handlebars.compile(p)(ctx)` (it was a string only until the partial's first render anyway)."

`README.md`: the same two changes, in its watch paragraph (find with `grep -n "re-renders every page" README.md`) and at line ~642 (the `kiss.handlebars` bullet).

`CLAUDE.md` "Pipeline in one paragraph": replace "a scoped re-render of matching stack entries (a page-view, partial or layout edit)" with "a scoped re-render of matching stack entries (a page-view edit; a partial or layout edit re-renders the pages `lib/dependency-graph.js` recorded as having rendered it, or every page with a notice when it has none)".

`planning/specs/2026-09-05-watch-dependency-graph-design.md` status line: "Status: LANDED (2026-09-08, branch `feat/incremental-rebuild`). Steps 6–7 built on the data-frame mechanism rather than the current-page marker described under Tracing — see `planning/plans/2026-09-08-dependency-graph.md`."

- [ ] **Step 6: Types, gates, commit**

Run: `npm run types && git status --short types/` — expect no change (a `@private` field emits nothing); if `types/` changed, the JSDoc lost its `@private` — fix that rather than committing the change.
Run: `npm run gates`
Expected: pass.

```bash
git add lib/kiss.js test/integration/watch.test.js AIKB/kiss.md llms.txt README.md CLAUDE.md planning/specs/2026-09-05-watch-dependency-graph-design.md
git commit -m "Scope a partial edit to the pages that rendered it, with every-page fallback and a debug dump"
```

---

### Task 5: The reading, after

**Files:** `planning/specs/2026-09-05-watch-dependency-graph-design.md` (a line under the step-5 numbers), `planning/benchmarks/diploma-msc-watch-2026-09-08-after.json`

No engine change. Re-run the same command as the recorded measurement (the site's `kiss-v2` branch is linked to this checkout, so nothing to link):

```bash
node scripts/bench.mjs --site=C:/Code/kiss/diploma-msc --entry="generate.js staging" --dev="generate.js dev" --dev-port=3002 --runs=5 --partial=src/partials/util/faq-util.hbs --json=planning/benchmarks/diploma-msc-watch-2026-09-08-after.json
```

(`banner.hbs`, the auto-pick, sits in the layout and reaches every page, so it measures the ceiling, not the win. `util/faq-util.hbs` is used by four views. Run once with each and record both rows.) Append the two `partial` medians beside the before-number in the spec, and commit the spec and the record.

---

## Self-review

**Spec coverage.** Step 6 of the rollout (module unused, then tracing + graph populated, visible in the debug sibling): Tasks 1–3. Step 7 (scoped dispatch with fallback, invariant tests): Task 4; the spec's invariant tests (a)/(b) about the synchronous marker are replaced by Task 2's tracing test (attribution through nesting, lookup, layouts) and Task 3's data-frame test, since the invariant no longer exists; (c)/(d) are Task 4's third case and Task 3's `clearPage` assertion. The brief's "unresolvable edge → every page + notice, one test for both halves": Task 4's second case. The `hbs.partials` shape note: Task 4 docs. The `generate: false` amendment: Task 0. The operator's debug view: Task 4's dump plus Task 3's sibling.

**Placeholders.** None: every code step shows the code; every doc step shows the prose.

**Type consistency.** `DependencyGraph#record(page, partial)` / `clearPage(page)` / `clear()` / `dependentsOf(partial)` / `usesOf(page)` / `size` / `toJSON()` are used with those names in Tasks 2, 3 and 4; `partialNameFor(file, folders)` takes `config.folders` in Task 4 as its tests do in Task 2; `deps.graph` is the key in both `registerPartials` (Task 2) and `KissPage` (Task 3).
