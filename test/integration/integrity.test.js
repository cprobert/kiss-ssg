import { describe, it, expect, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'

vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: () => {},
  }),
}))

import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

// A page that loads its own script with the integrity of the bytes its author
// wrote. kiss minifies `.js` on the copy, so the served bytes no longer match
// and a browser would refuse the file: the build must say so, not pass
// (Codex at the close, 2026-11-05).
const SCRIPT =
  'function hello () {\n  // a comment the minifier drops\n  return 1\n}\n'
const sri = `sha384-${crypto.createHash('sha384').update(SCRIPT).digest('base64')}`
const page = (name) =>
  `<html><head><script src="/{{asset "js/${name}"}}" integrity="${sri}" crossorigin="anonymous" defer></script></head><body><main><p>hi</p></main></body></html>`

let site, kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  kiss = null
  if (site) await site.cleanup()
  site = null
})

const build = async (name, config = {}) => {
  site = await makeSite({
    'src/pages/index.hbs': page(name),
    [`src/assets/js/${name}`]: SCRIPT,
  })
  kiss = new Kiss({ folders: site.folders, logger: silentLogger, ...config })
    .page({ view: 'index.hbs' })
    .generate()
  return kiss.complete()
}

describe('integrity attributes on the site’s own files', () => {
  it('fails the build when kiss changed a file a page loads with integrity', async () => {
    const error = await build('vendor.js').catch((e) => e)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.message).toMatch(/<integrity>/)
    expect(error.errors[0].message).toMatch(
      /js\/vendor\.js .*integrity.*\*\.min\.js/,
    )
  })

  it('passes when the file is left as written: a *.min.js name, or minify off', async () => {
    await build('vendor.min.js')
    expect(kiss.report().ok).toBe(true)
    await kiss.close()
    kiss = null
    await site.cleanup()
    site = null
    await build('vendor.js', { assets: { minify: false } })
    expect(kiss.report().ok).toBe(true)
  })
})
