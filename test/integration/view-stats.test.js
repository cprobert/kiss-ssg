import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

describe('viewStats()', () => {
  it('writes a serialisable debug.json when verbose', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    const kiss = new Kiss({
      folders: site.folders,
      verbose: true,
      logger: silentLogger,
    })
      .scan()
      .generate()
    await kiss.complete()
    kiss.viewStats()

    // viewStats() does not await the write, so poll for the file.
    await waitFor(() => site.exists('public/debug.json'))
    const stats = JSON.parse(await site.read('public/debug.json'))
    expect(stats).toHaveLength(1)
    expect(stats[0].view).toBe('index.hbs')
    expect(stats[0].options.slug).toBe('index')
  })
})
