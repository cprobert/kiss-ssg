import { describe, it, expect, afterEach, vi } from 'vitest'
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

  it('compiles into the build folder when the source folder has a trailing slash', async () => {
    site = await makeSite({ 'a/css/x.scss': '$c: red; b { color: $c }' })
    await copyAssets(`${site.root}/a/`, `${site.root}/out`, deps)
    expect(await site.read('out/css/x.css')).toContain('color:red')
    expect(await site.exists('outcss/x.css')).toBe(false)
  })

  it('mirrors a nested folder that repeats the source folder name', async () => {
    site = await makeSite({ 'a/nested/a/deep.scss': 'b { color: blue }' })
    await copyAssets(`${site.root}/a`, `${site.root}/out`, deps)
    expect(await site.read('out/nested/a/deep.css')).toContain('color:blue')
  })

  it('does not trigger the "import sass from \'sass\'" deprecation warning', async () => {
    // lib/assets.js must prefer the named `sass.compile` export (present on
    // current sass) over `sassModule.default` — reaching for `.default` on a
    // modern sass namespace logs "`import sass from 'sass'` is deprecated"
    // on every compile. Spy on the channels sass warns through and assert
    // silence across a real (unmocked) compile.
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      site = await makeSite({ 'a/css/x.scss': '$c: red; b { color: $c }' })
      await copyAssets(`${site.root}/a`, `${site.root}/out`, deps)
    } finally {
      stderrSpy.mockRestore()
      warnSpy.mockRestore()
    }
    const written = [...stderrSpy.mock.calls, ...warnSpy.mock.calls]
      .map((args) => String(args[0]))
      .join('\n')
    expect(written).not.toMatch(/deprecated/i)
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
