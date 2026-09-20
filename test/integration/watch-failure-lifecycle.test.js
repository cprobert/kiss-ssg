import { describe, it, expect, afterEach, vi } from 'vitest'

const dev = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: dev.refresh,
  }),
}))

import fs from 'fs-extra'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

let site, kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
  dev.refresh.mockReset()
})

const views = (k) => k._failures.map((f) => f.view)
const settled = async (k) => {
  while (k._rebuildInFlight) await k._rebuildInFlight
}

// A whole-site replay re-runs the pages, their controllers and the redirects,
// so clearing those failures is right. It re-compiles the stylesheets only
// when an `assets.pipeline` step is configured, and it never re-imports the
// helpers entry — so a failure from either producer is still true after the
// replay, and clearing it was reporting a site as ok with no CSS in it.
describe('a failure the replay cannot re-derive', () => {
  it('survives a whole-site replay: an uncompilable stylesheet', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/controllers/index.js': "module.exports = () => ({ title: 'one' })",
      'src/assets/css/site.scss': 'body { color: ',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger, dev: true })
      .scan()
      .generate()
    await expect(kiss.complete()).rejects.toThrow()
    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    // A controller edit is a whole-site replay. The stylesheet on disk is
    // untouched and still will not compile.
    await site.touch(
      'src/controllers/index.js',
      "module.exports = () => ({ title: 'two' })",
    )
    await waitFor(async () => (await site.read('public/index.html')) === 'two')
    await settled(kiss)

    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)
  })

  it('survives a whole-site replay: a helpers entry that throws', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/controllers/index.js': "module.exports = () => ({ title: 'one' })",
      'helpers/index.js':
        'export function registerHelpers() { throw new Error("boom") }',
    })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger: silentLogger,
      dev: true,
    })
      .scan()
      .generate()
    await expect(kiss.complete()).rejects.toThrow()
    expect(views(kiss)).toContain('<site helpers>')

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/index.js',
      "module.exports = () => ({ title: 'two' })",
    )
    await waitFor(async () => (await site.read('public/index.html')) === 'two')
    await settled(kiss)

    expect(views(kiss)).toContain('<site helpers>')
  })

  // The other half: carrying must not strand a failure that HAS been fixed.
  // Each carried kind is cleared by its own producer — `copyAssets` by the
  // prefix that names the copy, `_loadHelpers` by the `<site helpers>` name —
  // and the edit that fixes the file is what runs that producer again.
  it('clears once the stylesheet compiles again', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'hi',
      'src/assets/css/site.scss': 'body { color: ',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger, dev: true })
      .scan()
      .generate()
    await expect(kiss.complete()).rejects.toThrow()

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/assets/css/site.scss', 'body { color: red; }')
    await waitFor(
      () => !kiss._failures.some((f) => f.view.startsWith('<sass:')),
    )
    await kiss._assetQueue
    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(0)
  })

  // A copy owns its Sass failures by the resolved (source, target) pair it
  // is, not by a prefix of the view string: `src/assets` is a prefix of
  // `src/assets/nested`, so a parent root's copy used to clear a nested
  // root's unresolved failure — and the parent's own compile of that same
  // file then succeeded to a different target, so nothing raised it again.
  it('a parent asset root does not clear a nested root failure', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'hi',
      'src/assets/nested/theme.scss': 'body { color: red; }',
    })
    // The nested copy cannot WRITE its output — a directory sits where
    // theme.css must go — though the stylesheet itself parses. The parent
    // copy compiles the same source successfully, to a different target.
    await fs.ensureDir(`${site.root}/out-nested/theme.css`)
    kiss = new Kiss({
      folders: { ...site.folders, assets: null },
      logger: silentLogger,
    })
    kiss.copyAssets(`${site.root}/src/assets/nested`, `${site.root}/out-nested`)
    kiss.copyAssets(`${site.root}/src/assets`, `${site.root}/out-parent`)
    kiss.scan().generate()

    await expect(kiss.complete()).rejects.toThrow()
    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)
    expect(kiss.report().ok).toBe(false)
  })

  it('still clears a failure the replay does re-derive', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/controllers/index.js':
        "module.exports = () => { throw new Error('nope') }",
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger, dev: true })
      .scan()
      .generate()
    await expect(kiss.complete()).rejects.toThrow()
    expect(views(kiss)).toContain('index.hbs')

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/index.js',
      "module.exports = () => ({ title: 'fixed' })",
    )
    // The first build wrote nothing for this page — the controller threw — so
    // the read has to tolerate a file that is not there yet.
    await waitFor(
      async () =>
        (await site.read('public/index.html').catch(() => null)) === 'fixed',
    )
    await settled(kiss)

    expect(views(kiss)).toHaveLength(0)
  })
})
