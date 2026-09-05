import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

describe('folder creation', () => {
  it('creates partials/layouts/models/controllers even when assets is null', async () => {
    site = await makeSite({})
    new Kiss({
      folders: { ...site.folders, assets: null },
      logger: silentLogger,
    })
    expect(await site.exists('src/partials')).toBe(true)
    expect(await site.exists('src/layouts')).toBe(true)
    expect(await site.exists('src/models')).toBe(true)
    expect(await site.exists('src/controllers')).toBe(true)
  })
})

describe('project paths containing glob metacharacters', () => {
  it('builds pages and compiles sass from a folder named site[old]', async () => {
    site = await makeSite({
      'site[old]/src/pages/index.hbs': 'hello',
      'site[old]/src/assets/style.scss': 'body { color: red }',
    })
    const kiss = new Kiss({
      folders: {
        src: `${site.root}/site[old]/src`,
        build: `${site.root}/site[old]/public`,
      },
      logger: silentLogger,
    })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.exists('site[old]/public/index.html')).toBe(true)
    expect(await site.exists('site[old]/public/style.css')).toBe(true)
  })
})
