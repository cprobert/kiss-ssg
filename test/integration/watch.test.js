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
    kiss = new Kiss({ folders: site.folders, logger: silentLogger }).scan().generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/pages/index.hbs', 'v2')
    await waitFor(async () => (await site.read('public/index.html')) === 'v2')
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
