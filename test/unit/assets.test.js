import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import { copyAssets } from '../../lib/assets.js'
import { contentHash, createAssetManifest } from '../../lib/asset-manifest.js'
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

describe('copyAssets manifest', () => {
  const hashing = (extra = {}) => ({
    config: { ...deps.config, assets: { hash: true, version: null, ...extra } },
    logger: silentLogger,
  })

  it('records every emitted file under the path a template would write', async () => {
    site = await makeSite({
      'a/css/x.scss': '$c: red; b { color: $c }',
      'a/img/logo.png': 'png',
      'a/robots.txt': 'ok',
    })
    const manifest = createAssetManifest()
    await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...deps,
      manifest,
    })
    // The sass source is keyed by its compiled name: the template asks for the
    // file it can link, not the one on the author's disk.
    expect(manifest.lookup('css/x.css')).toBe('css/x.css')
    expect(manifest.lookup('css/x.scss')).toBeNull()
    expect(manifest.lookup('img/logo.png')).toBe('img/logo.png')
    expect(manifest.lookup('robots.txt')).toBe('robots.txt')
    expect(await site.exists('out/css/x.css')).toBe(true)
  })

  it('keys the manifest to the build root when the target is below it', async () => {
    site = await makeSite({ 'a/x.css': 'b{}' })
    const manifest = createAssetManifest()
    await copyAssets(`${site.root}/a`, `${site.root}/out/extra`, {
      config: { ...deps.config, folders: { build: `${site.root}/out` } },
      logger: silentLogger,
      manifest,
    })
    expect(manifest.lookup('extra/x.css')).toBe('extra/x.css')
  })

  it('hashes the emitted bytes, not the source, and drops the plain name', async () => {
    site = await makeSite({ 'a/css/x.scss': '$c: red; b { color: $c }' })
    const manifest = createAssetManifest()
    await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...hashing(),
      manifest,
    })
    const emitted = manifest.lookup('css/x.css')
    expect(emitted).toMatch(/^css\/x\.[0-9a-f]{8}\.css$/)
    const bytes = await fs.readFile(`${site.root}/out/${emitted}`)
    expect(emitted).toBe(`css/x.${contentHash(bytes)}.css`)
    expect(contentHash(bytes)).not.toBe(
      contentHash(await fs.readFile(`${site.root}/a/css/x.scss`)),
    )
    expect(await site.exists('out/css/x.css')).toBe(false)
  })

  it('renames only what a template links by name', async () => {
    site = await makeSite({
      'a/js/app.js': 'let a = 1',
      'a/robots.txt': 'ok',
      'a/img/logo.png': 'png',
    })
    const manifest = createAssetManifest()
    await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...hashing(),
      manifest,
    })
    expect(manifest.lookup('js/app.js')).toMatch(/^js\/app\.[0-9a-f]{8}\.js$/)
    expect(manifest.lookup('robots.txt')).toBe('robots.txt')
    expect(await site.exists('out/robots.txt')).toBe(true)
    expect(await site.exists('out/img/logo.png')).toBe(true)
  })

  it('emits a new name after an edit and removes the one it replaced', async () => {
    site = await makeSite({ 'a/css/x.scss': '$c: red; b { color: $c }' })
    const manifest = createAssetManifest()
    const deps2 = { ...hashing(), manifest }
    await copyAssets(`${site.root}/a`, `${site.root}/out`, deps2)
    const first = manifest.lookup('css/x.css')

    await site.touch('a/css/x.scss', '$c: blue; b { color: $c }')
    await copyAssets(`${site.root}/a`, `${site.root}/out`, deps2)
    const second = manifest.lookup('css/x.css')

    expect(second).not.toBe(first)
    expect(await site.exists(`out/${second}`)).toBe(true)
    expect(await site.exists(`out/${first}`)).toBe(false)
    expect(await site.exists('out/css/x.css')).toBe(false)
  })

  it('leaves the name alone when only the version policy is set', async () => {
    site = await makeSite({ 'a/css/x.css': 'b{}' })
    const manifest = createAssetManifest()
    await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      config: { ...deps.config, assets: { hash: false, version: '1.2.3' } },
      logger: silentLogger,
      manifest,
    })
    expect(manifest.lookup('css/x.css')).toBe('css/x.css')
    expect(await site.exists('out/css/x.css')).toBe(true)
  })

  it('warns when both policies are set, and hashing wins', async () => {
    const warnings = []
    site = await makeSite({ 'a/css/x.css': 'b{}' })
    const manifest = createAssetManifest()
    await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      config: { ...deps.config, assets: { hash: true, version: '1.2.3' } },
      logger: { ...silentLogger, warn: (...args) => warnings.push(args) },
      manifest,
    })
    expect(manifest.lookup('css/x.css')).toMatch(/^css\/x\.[0-9a-f]{8}\.css$/)
    expect(warnings).toHaveLength(1)
  })

  it('skips a sass file that failed to compile instead of failing the copy', async () => {
    site = await makeSite({ 'a/css/broken.scss': 'b { color: }' })
    const manifest = createAssetManifest()
    const result = await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...hashing(),
      manifest,
    })
    expect(result.data).toContain('Copied assets')
    expect(manifest.lookup('css/broken.css')).toBeNull()
  })
})
