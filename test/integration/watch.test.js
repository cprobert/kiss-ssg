import { describe, it, expect, afterEach, vi } from 'vitest'

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
    kiss = new Kiss({ folders: site.folders, logger: silentLogger }).scan().generate()
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

  it('dev mode starts the (mocked) server and watcher; close() stops both', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    kiss = new Kiss({ folders: site.folders, dev: true, logger: silentLogger }).scan().generate()
    await kiss.complete()
    expect(kiss._devServer).toBeTruthy()
    expect(kiss._watcher).toBeTruthy()
    await kiss.close()
    expect(kiss._watcher).toBeNull()
    expect(kiss._devServer).toBeNull()
  })
})
