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

  it('deleting a partial leaves its stale content in rendered output', async () => {
    // Pins B1 (planning/reviews/2026-09-05-v2-engine-review.md): registerPartials()
    // only ever adds to the Handlebars env, so a partial deleted from disk keeps
    // rendering with its last-known content forever. Flipped deliberately by the fix.
    site = await makeSite({
      'src/pages/index.hbs': 'PAGE[{{> foo}}]',
      'src/partials/foo.hbs': 'FOO-V1',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('PAGE[FOO-V1]')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await fs.remove(`${site.src}/partials/foo.hbs`)
    // The unlink alone matches no stack entry (rebuildSite/_replay), so touch
    // the page too to force a rebuild that definitely completes.
    await site.touch('src/pages/index.hbs', 'PAGE2[{{> foo}}]')
    await waitFor(
      async () => (await site.read('public/index.html')) === 'PAGE2[FOO-V1]',
    )
    expect(Object.keys(kiss.handlebars.partials)).toContain('foo')
  })

  it('adding a partial is ignored and a page referencing it stays frozen', async () => {
    // Pins B2 (planning/reviews/2026-09-05-v2-engine-review.md): the watcher
    // ignores every `add` event, so a partial created mid-session is never
    // registered; a page edited to reference it fails to render and the
    // rendering error is swallowed, leaving the page's output frozen at its
    // previous content. Flipped deliberately by the fix.
    site = await makeSite({ 'src/pages/index.hbs': 'home' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/partials/nav.hbs', 'NAV')
    await sleep(1000) // settle window for the (ignored) `add` event
    await site.touch('src/pages/index.hbs', 'home[{{> nav}}]')
    await sleep(1000) // settle window for the failed, swallowed re-render
    expect(await site.read('public/index.html')).toBe('home')
    expect(Object.keys(kiss.handlebars.partials)).not.toContain('nav')
  })

  it('deleting a page view overwrites its output with the literal filename', async () => {
    // Pins B3 (planning/reviews/2026-09-05-v2-engine-review.md): _getTemplate's
    // read failure falls through with `viewText` still set to the view
    // filename, so a page whose view was deleted "builds successfully" with
    // its own filename as its body instead of failing or being removed.
    // Flipped deliberately by the fix.
    site = await makeSite({
      'src/pages/index.hbs': 'home',
      'src/pages/gone.hbs': 'SECRET DRAFT',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/gone.html')).toBe('SECRET DRAFT')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await fs.remove(`${site.src}/pages/gone.hbs`)
    await waitFor(
      async () => (await site.read('public/gone.html')) === 'gone.hbs',
    )
  })

  it('adding a page view to a scanned site does nothing until restart', async () => {
    // Pins B2 (planning/reviews/2026-09-05-v2-engine-review.md), page side: the
    // watcher ignores `add` events, so a new page file that `.scan()` would
    // pick up on a fresh process is never built while watching. Flipped
    // deliberately by the fix.
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

    // Remove the whole site dir, as a deploy/clean step racing the shutdown
    // might: the orphaned replay resurrects it once its write lands.
    await fs.remove(site.root)
    await waitFor(async () => site.exists('public/index.html'), {
      timeout: 2000,
    })
    expect(await site.exists('public')).toBe(true)
  })
})
