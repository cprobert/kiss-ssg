import { describe, it, expect, vi, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

// An explicit `.copyAssets()` naming a folder that is not there used to pass
// silently, logged as "Copied assets": fs-extra runs the copy's filter before
// it checks the source, the filter refused the root, and the copy resolved
// having done nothing. Found while checking a clean-room report on the
// partial-transforms branch (2026-11-14). The derived assets folder is not
// affected: the constructor creates it.
let site
afterEach(async () => {
  if (site) await site.cleanup()
})

const quietLogger = () => ({
  ...silentLogger,
  info: vi.fn(),
  error: vi.fn(),
})
const lines = (fn) => fn.mock.calls.map(([message]) => String(message))

describe('a missing asset source folder', () => {
  it('fails the build, named, when an explicit .copyAssets() names a folder that is not there', async () => {
    site = await makeSite({ 'src/pages/index.hbs': '<h1>Home</h1>' })
    const logger = quietLogger()
    const kiss = new Kiss({ folders: site.folders, logger })
    kiss.copyAssets(`${site.root}/vendor`, `${site.build}/vendor`)
    kiss.page({ view: 'index.hbs' })

    const err = await kiss
      .generate()
      .complete()
      .then(
        () => null,
        (e) => e,
      )

    expect(err).toBeInstanceOf(AggregateError)
    const views = err.report.failures.map((f) => f.view)
    // The one failure: the default copy, of a folder the constructor made, is fine.
    expect(views).toEqual([expect.stringMatching(/^<assets: .*vendor>$/)])
    expect(
      lines(logger.info).some(
        (m) => m.startsWith('Copied assets') && m.includes('vendor'),
      ),
    ).toBe(false)
  })
})
