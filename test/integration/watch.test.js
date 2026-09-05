import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'

vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({ ready: Promise.resolve(), close: async () => {} }),
}))

import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let site, kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
  vi.unstubAllGlobals()
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

  it('re-runs an edited CommonJS controller on rebuild', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/controllers/index.js': "module.exports = () => ({ title: 'one' })",
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('one')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/index.js',
      "module.exports = () => ({ title: 'two' })",
    )
    await waitFor(async () => (await site.read('public/index.html')) === 'two')
  })

  it('re-runs an edited ESM controller on rebuild', async () => {
    site = await makeSite({
      'src/pages/about.hbs': '{{title}}',
      'src/controllers/about.mjs': "export default () => ({ title: 'a1' })",
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'about.hbs', controller: 'about.mjs' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/about.html')).toBe('a1')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/about.mjs',
      "export default () => ({ title: 'a2' })",
    )
    await waitFor(async () => (await site.read('public/about.html')) === 'a2')
  })

  it('re-reads an edited model JSON on rebuild', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/models/index.json': '{ "title": "m1" }',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('m1')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/models/index.json', '{ "title": "m2" }')
    await waitFor(async () => (await site.read('public/index.html')) === 'm2')
  })

  it('coalesces overlapping rebuild requests onto the newest edit', async () => {
    // A slow model keeps the first replay in flight while the second is
    // requested: without coalescing the second resets _stack under the first,
    // whose pending page then wins the buildTo dedupe and strands stale output.
    let payload = { title: 'm1' }
    vi.stubGlobal('fetch', async () => {
      const body = payload // as at request time, like a real server read
      await sleep(150)
      return { json: async () => body }
    })
    site = await makeSite({ 'src/pages/index.hbs': '{{title}}' })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, logger })
      .page({ view: 'index.hbs', model: 'http://models.test/index.json' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('m1')

    const a = kiss._requestReplay()
    await sleep(50) // the first replay is now mid-fetch
    payload = { title: 'm2' }
    const b = kiss._requestReplay()
    expect(b).toBe(a) // the second request collapsed onto the in-flight one
    await Promise.all([a, b])
    // The queued follow-up replay is not chained into the returned promise.
    await waitFor(async () => (await site.read('public/index.html')) === 'm2')
    await sleep(50)

    expect(kiss._stack).toHaveLength(1)
    expect(kiss._stack[0].runCount).toBe(1)
    expect(logger.error).not.toHaveBeenCalledWith(
      'Page already processed',
      expect.anything(),
    )
  })

  it('waits for an in-flight build before replaying', async () => {
    // A replay that resets _stack while the first build's page chain is still
    // pending lets that stale chain fill the new stack, so the replay's own
    // page loses the buildTo dedupe and the old model's output survives.
    let version = 'v1'
    vi.stubGlobal('fetch', async () => {
      const body = { title: version } // as at request time, like a real server
      await sleep(150)
      return { json: async () => body }
    })
    site = await makeSite({ 'src/pages/index.hbs': '{{title}}' })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, logger })
      .page({ view: 'index.hbs', model: 'http://models.test/index.json' })
      .generate() // deliberately not awaited: the first build is still running

    version = 'v2'
    await kiss._requestReplay()

    await waitFor(
      async () =>
        (await site.exists('public/index.html')) &&
        (await site.read('public/index.html')) === 'v2',
    )
    expect(kiss._stack).toHaveLength(1)
    expect(logger.error).not.toHaveBeenCalledWith(
      'Page already processed',
      expect.anything(),
    )
  })

  it('removes output for pages that are no longer registered', async () => {
    site = await makeSite({
      'src/pages/item.hbs': '{{model.n}}',
      'src/models/team/a.json': '{ "n": "a" }',
      'src/models/team/b.json': '{ "n": "b" }',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .pages({ view: 'item.hbs', model: 'team' })
      .generate()
    await kiss.complete()
    expect(await site.exists('public/item-1.html')).toBe(true)
    expect(await site.exists('public/item-2.html')).toBe(true)

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await fs.remove(`${site.src}/models/team/b.json`)

    await waitFor(async () => !(await site.exists('public/item-2.html')))
    expect(await site.read('public/item-1.html')).toBe('a')
  })

  it('does not delete a live page whose output is the .json sibling of a removed orphan', async () => {
    // Orphan cleanup swaps the trailing extension to `.json` to remove the
    // dev-mode debug sibling too. If a currently registered page happens to
    // build to that exact `.json` path, it must survive the cleanup.
    site = await makeSite({
      'src/pages/item.hbs': '{{model.n}}',
      'src/pages/x.hbs': 'x',
      'src/models/team/a.json': '{ "n": "a" }',
      'src/models/team/b.json': '{ "n": "b" }',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .pages({ view: 'item.hbs', model: 'team' })
      .page({ view: 'x.hbs', slug: 'item-2', ext: 'json' })
      .generate()
    await kiss.complete()
    expect(await site.exists('public/item-1.html')).toBe(true)
    expect(await site.exists('public/item-2.html')).toBe(true)
    expect(await site.exists('public/item-2.json')).toBe(true)

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await fs.remove(`${site.src}/models/team/b.json`)

    await waitFor(async () => !(await site.exists('public/item-2.html')))
    expect(await site.read('public/item-1.html')).toBe('a')
    expect(await site.exists('public/item-2.json')).toBe(true)
  })

  it('re-runs the sitemap on rebuild and drops the old slug', async () => {
    site = await makeSite({
      'src/pages/about.hbs': '{{title}}',
      'src/controllers/about.mjs': "export default () => ({ slug: 's1' })",
    })
    kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com',
      logger: silentLogger,
    })
      .page({ view: 'about.hbs', controller: 'about.mjs' })
      .generate()
      .sitemap()
    await kiss.complete()
    expect(await site.exists('public/s1.html')).toBe(true)
    expect(await site.read('public/sitemap.xml')).toContain('/s1')

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/about.mjs',
      "export default () => ({ slug: 's2' })",
    )

    // Stale output is removed after the rebuild completes, so wait for both:
    // s2.html can exist for a moment while s1.html is still there.
    await waitFor(
      async () =>
        (await site.exists('public/s2.html')) &&
        !(await site.exists('public/s1.html')),
    )
    const sitemap = await site.read('public/sitemap.xml')
    expect(sitemap).toContain('/s2')
    expect(sitemap).not.toContain('/s1')
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

  it('edit of an .hbs partial re-renders pages that use it', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '[{{> foo}}]',
      'src/partials/foo.hbs': 'V1',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('[V1]')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/partials/foo.hbs', 'V2')
    await waitFor(async () => (await site.read('public/index.html')) === '[V2]')
  })

  it('edit of an .md partial re-renders pages that use it', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '[{{> foo}}]',
      'src/partials/foo.md': 'V1',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('[<p>V1</p>]')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/partials/foo.md', 'V2')
    await waitFor(
      async () => (await site.read('public/index.html')) === '[<p>V2</p>]',
    )
  })

  it('edit of a layout re-renders pages that extend it', async () => {
    site = await makeSite({
      'src/pages/index.hbs':
        '{{#extend "base"}}{{#content "c"}}X{{/content}}{{/extend}}',
      'src/layouts/base.hbs': 'L1{{#block "c"}}{{/block}}',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('L1X')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/layouts/base.hbs', 'L2{{#block "c"}}{{/block}}')
    await waitFor(async () => (await site.read('public/index.html')) === 'L2X')
  })

  it('deleting a partial unregisters it and fails the pages that used it', async () => {
    // Flipped by the B1 fix (planning/reviews/2026-09-05-v2-engine-review.md):
    // registerPartials() used to only ever add to the Handlebars env, so a
    // partial deleted from disk kept rendering its last-known content forever.
    // The registered set now mirrors disk, so the page that still references
    // the deleted partial fails loudly on the replay instead of rendering a
    // ghost, and its stale output is left untouched rather than rewritten.
    site = await makeSite({
      'src/pages/index.hbs': 'PAGE[{{> foo}}]',
      'src/partials/foo.hbs': 'FOO-V1',
    })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, logger }).scan().generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('PAGE[FOO-V1]')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await fs.remove(`${site.src}/partials/foo.hbs`)
    await waitFor(() =>
      logger.error.mock.calls.some(
        ([first]) => first === 'Error rebuilding site',
      ),
    )
    expect(Object.keys(kiss.handlebars.partials)).not.toContain('foo')
    expect(await site.read('public/index.html')).toBe('PAGE[FOO-V1]')
  })

  it('adding a partial registers it and a page can then reference it', async () => {
    // Flipped by the B2 fix (planning/reviews/2026-09-05-v2-engine-review.md):
    // the watcher used to ignore every `add` event, so a partial created
    // mid-session was never registered and the next edit to a page referencing
    // it failed to render, leaving that page frozen at its previous content.
    // The `add` now triggers a rebuild, which re-registers the partial.
    site = await makeSite({ 'src/pages/index.hbs': 'home' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/partials/nav.hbs', 'NAV')
    await waitFor(() => Object.keys(kiss.handlebars.partials).includes('nav'))
    await site.touch('src/pages/index.hbs', 'home[{{> nav}}]')
    await waitFor(
      async () => (await site.read('public/index.html')) === 'home[NAV]',
    )
  })

  it('deleting a scanned page view removes its output on the next replay', async () => {
    // scan() discovered the page from the file tree, so the file going away
    // takes the page with it: the registration is dropped, its buildTo is
    // absent from the new stack, and the orphan sweep removes the output and
    // the dev-mode .json sibling. Nothing is reported as a failure.
    site = await makeSite({
      'src/pages/index.hbs': 'home',
      'src/pages/gone.hbs': 'SECRET DRAFT',
    })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, dev: true, logger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.exists('public/gone.html')).toBe(true)
    expect(await site.exists('public/gone.json')).toBe(true)
    await kiss._watcher.ready
    await fs.remove(`${site.src}/pages/gone.hbs`)
    await waitFor(async () => !(await site.exists('public/gone.html')))
    expect(await site.exists('public/gone.json')).toBe(false)
    expect(await site.read('public/index.html')).toContain('home')
    expect(logger.error).not.toHaveBeenCalledWith(
      'Error rebuilding site',
      expect.anything(),
    )
  })

  it('deleting an explicitly registered page view fails the replay loudly and keeps the stale output', async () => {
    // Flipped by the B3 fix (planning/reviews/2026-09-05-v2-engine-review.md):
    // _getTemplate used to fall through with `viewText` still set to the view
    // filename, so a page whose view was deleted "built successfully" with its
    // own filename as its body. It now throws, the unlink triggers a full
    // replay, and that replay reports the page as a failure. An explicitly
    // registered page is never dropped — the author asked for it by name — so
    // its buildTo stays in the stack and the stale output survives untouched.
    site = await makeSite({
      'src/pages/index.hbs': 'home',
      'src/pages/gone.hbs': 'SECRET DRAFT',
    })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, logger })
      .page({ view: 'index.hbs' })
      .page({ view: 'gone.hbs' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/gone.html')).toBe('SECRET DRAFT')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await fs.remove(`${site.src}/pages/gone.hbs`)
    await waitFor(() =>
      logger.error.mock.calls.some(
        ([first]) => first === 'Error rebuilding site',
      ),
    )
    expect(await site.read('public/gone.html')).toBe('SECRET DRAFT')
  })

  it('adding a page view to a scanned site does nothing until restart', async () => {
    // Still nothing after the B2 fix, for a different reason. The `add` now
    // reaches rebuildSite, but a replay re-runs `_registrations` — the page
    // list `.scan()` produced at registration time — and never calls `.scan()`
    // again, so a view that did not exist then is in no registration and is
    // never built. Only a restart re-scans the pages folder.
    site = await makeSite({ 'src/pages/index.hbs': 'home' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/pages/new.hbs', 'new page')
    await sleep(1200) // bounded settle window; no positive condition to poll for
    expect(await site.exists('public/new.html')).toBe(false)
  })

  it('adding a page view to an explicitly registered site does nothing', async () => {
    // Not a bug: a page built via `.page({ view })` is never auto-discovered
    // (no `.scan()` was run), so a new file on disk was never going to be
    // registered regardless of the watcher's `add`-event handling. This
    // documents that half of the behaviour as correct, unlike the previous test.
    site = await makeSite({ 'src/pages/index.hbs': 'home' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'index.hbs' })
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/pages/new.hbs', 'new page')
    await sleep(1200)
    expect(await site.exists('public/new.html')).toBe(false)
  })

  it('an atomic save (unlink then add) of a registered page view re-renders it', async () => {
    // On this filesystem chokidar coalesces a write-tmp-then-rename-over-target
    // save into a single `change` event on the target path (not a separate
    // unlink+add), so it matches the stack entry by `view` and goes through
    // the normal rebuildPage path today — it does not exercise B3's
    // deleted-view fallback. Recorded here so a future change to that
    // coalescing (or to how renames are detected) is caught.
    site = await makeSite({ 'src/pages/index.hbs': 'v1' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'index.hbs' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('v1')
    kiss.watch({ entry: null })
    await kiss._watcher.ready

    const target = `${site.src}/pages/index.hbs`
    const tmp = `${site.src}/pages/.index.hbs.tmp`
    await fs.outputFile(tmp, 'v2')
    await fs.rename(tmp, target)

    await waitFor(async () => (await site.read('public/index.html')) === 'v2')
  })

  it('close() returns while a replay is still running', async () => {
    // Pins B6 (planning/reviews/2026-09-05-v2-engine-review.md): close() closes
    // the watcher and dev server but never waits on `_replayInFlight`, so a
    // replay requested just before close() keeps running (and writing to the
    // build dir) after close() has already resolved. Flipped deliberately by
    // the fix.
    vi.stubGlobal('fetch', async () => {
      await sleep(300)
      return { json: async () => ({ title: 'remote' }) }
    })
    site = await makeSite({ 'src/pages/index.hbs': '{{title}}' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'index.hbs', model: 'http://models.test/index.json' })
      .generate()
    await kiss.complete()

    kiss._requestReplay() // fire-and-forget, exactly as rebuildSite does
    await sleep(50) // replay is now mid-fetch
    await kiss.close() // returns even though the replay above is still in flight

    // Remove the build dir, as a deploy/clean step racing the shutdown might:
    // the orphaned replay resurrects it once its write lands. (Only the build
    // dir — since the B3 fix, removing the view too would fail the page
    // instead, and this test is about close(), not about a missing view.)
    await fs.remove(site.build)
    await waitFor(async () => site.exists('public/index.html'), {
      timeout: 2000,
    })
    expect(await site.exists('public')).toBe(true)
  })
})
