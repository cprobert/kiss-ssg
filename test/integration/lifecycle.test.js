import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import http from 'node:http'
import net from 'node:net'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
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
    expect(failed.error.message).toBe('Skipping: missing.json')
  })
})

// `folders.helpers` defaults to `./helpers`, which is cwd-relative — so these
// run from inside the temp site, the way a real build script does. That is
// also the only way to exercise the *defaulted* path at all: naming the folder
// in the config is what makes it explicit.
// Found by a clean-room conversion: an agent working only from the published
// docs built a site whose stylesheet never compiled, and every machine signal
// said the build was good. `kiss-build-check` tells an agent "ok:true and
// exit 0 is the only passing result", which makes that verdict load-bearing.
describe('a stylesheet that does not compile', () => {
  it('fails the build rather than shipping a site with no CSS', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '<link href="{{asset "css/style.css"}}">',
      'src/assets/css/style.scss': 'body { color: red;',
    })
    const kiss = new Kiss({
      folders: site.folders,
      logger: { ...silentLogger, error: vi.fn(), warn: vi.fn() },
    })
      .scan()
      .generate()
    await expect(kiss.complete()).rejects.toThrow(/<sass: css\/style\.scss>/)
    expect(kiss.report().ok).toBe(false)
  })

  // One broken stylesheet must not take the others with it, the same rule a
  // failing page follows.
  it('still compiles the stylesheets that are fine', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'ok',
      'src/assets/css/broken.scss': 'body { color: red;',
      'src/assets/css/fine.scss': 'body { color: blue; }',
    })
    const kiss = new Kiss({
      folders: site.folders,
      logger: { ...silentLogger, error: vi.fn(), warn: vi.fn() },
    })
      .scan()
      .generate()
    await expect(kiss.complete()).rejects.toThrow()
    expect(await site.exists('public/css/fine.css')).toBe(true)
  })

  it('says nothing when every stylesheet compiles', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'ok',
      'src/assets/css/fine.scss': 'body { color: blue; }',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await expect(kiss.complete()).resolves.toBeDefined()
    expect(kiss.report().ok).toBe(true)
  })
})

describe('a root helpers/ folder that kiss does not own', () => {
  const inSite = async (root, fn) => {
    const cwd = process.cwd()
    process.chdir(root)
    try {
      return await fn()
    } finally {
      process.chdir(cwd)
    }
  }

  // The upgrade hazard: a site that had `helpers/` for its own utilities long
  // before `folders.helpers` existed must not lose its whole build to a folder
  // nobody pointed kiss at.
  it('warns and builds, because kiss guessed the folder', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'ok',
      'helpers/index.js': 'export const formatDate = (d) => String(d)',
    })
    const logger = { ...silentLogger, warn: vi.fn() }
    await inSite(site.root, async () => {
      const kiss = new Kiss({ folders: site.folders, logger }).scan().generate()
      await expect(kiss.complete()).resolves.toBeDefined()
    })
    expect(await site.exists('public/index.html')).toBe(true)
    expect(
      logger.warn.mock.calls.some(([m]) => /folders\.helpers/.test(String(m))),
    ).toBe(true)
  })

  // The message called a helpers module a page — `1 page(s) failed to build:
  // .../helpers/index.js` — which sends the author to look at their pages.
  // Every pseudo-view on `_failures` has the same problem: `<pipeline>`,
  // `<redirects>`, `<dev server>` are not pages either.
  it('names the failure as site helpers rather than as a page', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'ok',
      'helpers/index.js':
        "export function registerHelpers() { throw new Error('broken registrar') }",
    })
    const kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger: silentLogger,
    })
      .scan()
      .generate()
    await expect(kiss.complete()).rejects.toThrow(
      /build failure.*<site helpers>/s,
    )
  })

  it('fails the build when the author named the folder', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'ok',
      'helpers/index.js': 'export const formatDate = (d) => String(d)',
    })
    const kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger: silentLogger,
    })
      .scan()
      .generate()
    await expect(kiss.complete()).rejects.toThrow()
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

describe('complete()', () => {
  it('renders pages a generate callback scanned but never generated', async () => {
    // A callback that scans: those pages
    // land on the stack after the only generate() pass has iterated it.
    site = await makeSite({
      'src/pages/index.hbs': 'i',
      'src/pages/later.hbs': 'L',
      'src/pages/extra.hbs': 'E',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    kiss.page({ view: 'index.hbs' }).generate(function () {
      this.scan()
    })
    await kiss.complete()
    expect(await site.exists('public/later.html')).toBe(true)
    expect(await site.exists('public/extra.html')).toBe(true)
  })

  it('renders a page queued after the last generate(), however slow its model', async () => {
    // generate() snapshots _promises, so before the fix whether this page was
    // rendered depended purely on how fast its model resolved.
    const server = http.createServer((req, res) => {
      setTimeout(() => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ title: 'From API' }))
      }, 50)
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${server.address().port}/model.json`
    try {
      site = await makeSite({
        'src/pages/index.hbs': 'i',
        'src/pages/later.hbs': 'L {{model.title}}',
      })
      const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      kiss.page({ view: 'index.hbs', model: { a: 1 } }).generate()
      kiss.page({ view: 'later.hbs', model: url })
      await kiss.complete()
      expect(await site.exists('public/later.html')).toBe(true)
    } finally {
      await new Promise((r) => server.close(r))
    }
  })

  it('waits for pages an async generate callback queues after an await', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'i',
      'src/pages/later.hbs': 'L',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    kiss.page({ view: 'index.hbs' }).generate(async function () {
      await new Promise((r) => setTimeout(r, 30))
      this.page({ view: 'later.hbs' }).generate()
    })
    await kiss.complete()
    expect(await site.exists('public/later.html')).toBe(true)
  })

  it('renders a page an async generate callback queued without generating it', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'i',
      'src/pages/later.hbs': 'L',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    kiss.page({ view: 'index.hbs' }).generate(async function () {
      await new Promise((r) => setTimeout(r, 30))
      this.page({ view: 'later.hbs' })
    })
    await kiss.complete()
    expect(await site.exists('public/later.html')).toBe(true)
  })

  it('does not deadlock when an async generate callback awaits complete()', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'i' })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    let callbackDone = false
    kiss.page({ view: 'index.hbs' }).generate(async function () {
      await new Promise((r) => setTimeout(r, 30))
      await this.complete()
      callbackDone = true
    })
    await kiss.complete()
    expect(callbackDone).toBe(true)
  })

  it('a nested complete() that settles last does not leave later builds treated as nested', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'i',
      'src/pages/second.hbs': 's',
      'src/pages/later.hbs': 'L',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    let inner
    kiss.page({ view: 'index.hbs' }).generate(function () {
      // Held rather than awaited by the callback, so this complete() settles
      // after the outer one — the order that leaves a saved-and-restored flag
      // stuck, and every later complete() wrongly reading as nested.
      inner = this.complete()
    })
    await kiss.complete()
    await inner

    // A second build on the same instance: its async callback queues a page
    // after an await, which only a complete() that knows it is not nested
    // waits for.
    kiss.page({ view: 'second.hbs' }).generate(async function () {
      await new Promise((r) => setTimeout(r, 30))
      this.page({ view: 'later.hbs' })
    })
    await kiss.complete()
    expect(await site.exists('public/later.html')).toBe(true)
  })
})

describe('build failures', () => {
  it('complete() rejects when a page cannot be written; other pages still build', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'x',
      'src/pages/about.hbs': 'y',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    // A directory sitting where the output file must go makes the write fail.
    // Created after construction: cleanBuild empties the build dir in there.
    await fs.ensureDir(`${site.build}/index.html`)

    kiss.scan().generate()

    await expect(kiss.complete()).rejects.toThrow(
      /1 build failure: .*index\.html/,
    )
    expect(await site.exists('public/about.html')).toBe(true)

    let caught = null
    try {
      await kiss.complete()
    } catch (err) {
      caught = err
    }
    expect(caught).toBeNull()
  })

  it('reports the failures once: a second complete() in the same build resolves', async () => {
    // Flipped by review finding A-01 (2026-09-05): this used to assert that
    // every later complete() re-rejects. The re-rejection had nothing attached
    // to it when it came from a complete() inside a generate callback, and it
    // took the process down after the consumer had already handled the first.
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    await fs.ensureDir(`${site.build}/index.html`)

    kiss.scan().generate()

    let caught = null
    try {
      await kiss.complete()
    } catch (err) {
      caught = err
    }
    expect(caught.failures).toHaveLength(1)
    expect(caught.failures[0].view).toBe('index.hbs')
    expect(caught.failures[0].error).toBeInstanceOf(Error)

    await expect(kiss.complete()).resolves.toBeInstanceOf(Array)
  })

  it('complete() rejects when a page fails to render; other pages still build', async () => {
    site = await makeSite({
      // An unknown block helper with an argument: Handlebars compiles it, then
      // throws `Missing helper: "nope"` at render time.
      'src/pages/broken.hbs': '{{#nope 1}}x{{/nope}}',
      'src/pages/good.hbs': 'fine',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()

    await expect(kiss.complete()).rejects.toThrow(
      /1 build failure: .*broken\.html/,
    )
    expect(await site.exists('public/good.html')).toBe(true)
    expect(await site.exists('public/broken.html')).toBe(false)
  })

  it('complete() resolves normally when nothing failed', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await expect(kiss.complete()).resolves.toBeInstanceOf(Array)
  })
})

describe('callback failures', () => {
  it('complete() rejects when a generate callback throws', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'i',
      'src/pages/list.hbs': 'L',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    kiss.page({ view: 'index.hbs' }).generate(function () {
      throw new Error('boom in generate callback')
    })

    let caught = null
    try {
      await kiss.complete()
    } catch (err) {
      caught = err
    }
    expect(caught.failures).toHaveLength(1)
    expect(caught.failures[0].view).toBe('<generate callback>')
    expect(caught.failures[0].buildTo).toBeNull()
    expect(caught.failures[0].error.message).toBe('boom in generate callback')
  })

  it('complete() rejects when an async generate callback rejects', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'i' })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    kiss.page({ view: 'index.hbs' }).generate(async function () {
      throw new Error('boom in async generate callback')
    })

    await expect(kiss.complete()).rejects.toThrow(/generate callback/)
  })

  it('complete() rejects when a sitemap callback throws, after sitemap.xml was written', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'i' })
    const kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com',
      logger: silentLogger,
    })
    kiss
      .page({ view: 'index.hbs' })
      .generate()
      .sitemap({}, () => {
        throw new Error('boom in sitemap callback')
      })

    let caught = null
    try {
      await kiss.complete()
    } catch (err) {
      caught = err
    }
    expect(caught.failures).toHaveLength(1)
    expect(caught.failures[0].view).toBe('<sitemap callback>')
    // The callback runs after the write, so the file is there regardless.
    expect(await site.exists('public/sitemap.xml')).toBe(true)
  })

  it('a complete() inside a generate callback leaves no unhandled rejection', async () => {
    // The pattern AIKB/kiss.md documents as safe, over a failing page: the
    // outer complete() reports, the inner one resolves. Before A-01 the inner
    // rejection had no handler of its own and killed the process.
    site = await makeSite({
      'src/pages/index.hbs': 'x',
      'src/pages/about.hbs': 'y',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    await fs.ensureDir(`${site.build}/index.html`)

    const unhandled = []
    const spy = (err) => unhandled.push(err)
    process.on('unhandledRejection', spy)
    try {
      let inner = null
      kiss.scan().generate(function () {
        this.complete()
          .then(() => {
            inner = 'resolved'
          })
          .catch(() => {
            inner = 'rejected'
          })
      })
      let outer = null
      await kiss.complete().catch(() => {
        outer = 'rejected'
      })
      await new Promise((r) => setTimeout(r, 50))
      expect(outer).toBe('rejected')
      expect(inner).toBe('resolved')
      expect(unhandled).toHaveLength(0)
    } finally {
      process.off('unhandledRejection', spy)
    }
  })
})

describe('a bad controller', () => {
  it('complete() rejects when the controller file is missing', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'index.hbs', controller: 'missing.js' })
      .generate()

    let caught = null
    try {
      await kiss.complete()
    } catch (err) {
      caught = err
    }
    expect(caught.failures).toHaveLength(1)
    expect(caught.failures[0].view).toBe('index.hbs')
    expect(caught.failures[0].error.message).toMatch(/missing\.js/)
    expect(await site.exists('public/index.html')).toBe(false)
  })

  it('complete() rejects when the controller throws', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({
        view: 'index.hbs',
        controller: () => {
          throw new Error('boom in controller')
        },
      })
      .generate()

    await expect(kiss.complete()).rejects.toThrow(/1 build failure: index\.hbs/)
  })
})

describe('a bad item in a pages() fan-out', () => {
  const items = (bad) => ({
    view: 'item.hbs',
    model: [
      { slug: 'item-1', title: 'One' },
      { slug: 'item-2', title: 'Two' },
      { slug: 'item-3', title: 'Three' },
      { slug: 'item-4', title: 'Four' },
    ],
    controller: ({ model }) => {
      if (bad.includes(model.slug)) throw new Error(`bad item: ${model.slug}`)
      return { slug: model.slug }
    },
  })

  it('fails that page only: the rest of the fan-out still builds', async () => {
    site = await makeSite({ 'src/pages/item.hbs': '{{model.title}}' })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .pages(items(['item-2']))
      .generate()

    let caught = null
    try {
      await kiss.complete()
    } catch (err) {
      caught = err
    }
    expect(caught.failures).toHaveLength(1)
    expect(caught.failures[0].view).toMatch(/item\.hbs/)
    expect(caught.failures[0].view).toMatch(/item-2/)
    expect(caught.failures[0].error.message).toBe('bad item: item-2')
    expect(await site.exists('public/item-1.html')).toBe(true)
    expect(await site.exists('public/item-2.html')).toBe(false)
    expect(await site.exists('public/item-3.html')).toBe(true)
    expect(await site.exists('public/item-4.html')).toBe(true)
  })

  it('reports one failure per bad item', async () => {
    site = await makeSite({ 'src/pages/item.hbs': '{{model.title}}' })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .pages(items(['item-2', 'item-4']))
      .generate()

    let caught = null
    try {
      await kiss.complete()
    } catch (err) {
      caught = err
    }
    expect(caught.failures).toHaveLength(2)
    expect(caught.failures.map((f) => f.error.message)).toEqual([
      'bad item: item-2',
      'bad item: item-4',
    ])
    expect(await site.exists('public/item-1.html')).toBe(true)
    expect(await site.exists('public/item-3.html')).toBe(true)
  })

  it('leaves a fan-out with no bad items untouched', async () => {
    site = await makeSite({ 'src/pages/item.hbs': '{{model.title}}' })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .pages(items([]))
      .generate()

    await expect(kiss.complete()).resolves.toBeDefined()
    for (const n of [1, 2, 3, 4])
      expect(await site.exists(`public/item-${n}.html`)).toBe(true)
  })
})

describe('a dev server that cannot bind', () => {
  it('reports it once, fails the build, and stops watching', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'i' })
    const blocker = net.createServer()
    await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const { port } = blocker.address()
    const lines = []
    const record =
      (level) =>
      (...args) =>
        lines.push(`${level}: ${args.map(String).join(' ')}`)
    const logger = {
      ...silentLogger,
      info: record('info'),
      error: record('error'),
      warn: record('warn'),
      plain: record('plain'),
    }
    const kiss = new Kiss({
      folders: site.folders,
      dev: true,
      port,
      livereloadPort: 35821,
      logger,
    })
      .page({ view: 'index.hbs' })
      .generate()

    let caught = null
    try {
      await kiss.complete()
    } catch (err) {
      caught = err
    }
    try {
      expect(caught.failures).toHaveLength(1)
      expect(caught.failures[0].view).toBe('<dev server>')
      expect(caught.failures[0].buildTo).toBeNull()

      const errors = lines.filter((l) => l.startsWith('error:'))
      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain(`127.0.0.1:${port}`)
      expect(errors[0]).toContain('not being served')
      expect(lines.some((l) => l.includes('Serving'))).toBe(false)
      expect(lines.some((l) => l.includes('live reload'))).toBe(false)

      // Nothing is served, so the process must be free to exit once the
      // consumer has handled the rejection.
      expect(kiss._watcher).toBeNull()
      expect(kiss._devServer).toBeNull()
    } finally {
      await kiss.close()
      await new Promise((resolve) => blocker.close(resolve))
    }
  })

  it('serves and keeps watching when the port is free', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'i' })
    const lines = []
    const logger = {
      ...silentLogger,
      info: (...args) => lines.push(args.map(String).join(' ')),
    }
    const kiss = new Kiss({
      folders: site.folders,
      dev: true,
      port: 0,
      livereloadPort: 35822,
      logger,
    })
      .page({ view: 'index.hbs' })
      .generate()
    try {
      await expect(kiss.complete()).resolves.toBeDefined()
      expect(lines.some((l) => l.includes('Serving'))).toBe(true)
      expect(kiss._devServer.server.listening).toBe(true)
      expect(kiss._watcher).toBeTruthy()
    } finally {
      await kiss.close()
    }
  })
})
