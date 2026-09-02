import { describe, it, expect, afterEach } from 'vitest'
import { copyAssets } from '../../lib/assets.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})
const deps = {
  config: { dev: false, sass: { includePaths: [] } },
  logger: silentLogger,
}

describe('copyAssets', () => {
  it('compiles sass and copies the rest', async () => {
    site = await makeSite({
      'a/css/x.scss': '$c: red; b { color: $c }',
      'a/robots.txt': 'ok',
    })
    const result = await copyAssets(`${site.root}/a`, `${site.root}/out`, deps)
    expect(typeof result.id).toBe('string')
    expect(result.data).toContain('Copied assets')
    expect(await site.read('out/css/x.css')).toContain('color:red')
    expect(await site.read('out/robots.txt')).toBe('ok')
    expect(await site.exists('out/css/x.scss')).toBe(false)
  })

  it('resolves (does not reject or hang) when the source is missing', async () => {
    site = await makeSite({})
    const result = await copyAssets(
      `${site.root}/nope`,
      `${site.root}/out`,
      deps,
    )
    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it('resolves with null data when a folder is not given', async () => {
    const result = await copyAssets(null, 'x', deps)
    expect(result.data).toBeNull()
  })
})
