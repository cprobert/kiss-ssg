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

  // The migration shape: a project moving off a pipeline that committed its
  // compiled CSS has site.scss and site.css side by side. Both are emitted to
  // one path, the copy runs after the compile, and the plain file wins — so
  // every .scss edit silently does nothing, on a green build and a clean
  // check. The pages are correct and the asset is wrong, so page hashes can
  // never catch it. Nothing said so before this warning.
  it('warns when a sass compile and a plain copy claim one emitted path', async () => {
    const logger = { ...silentLogger, warn: vi.fn() }
    site = await makeSite({
      'a/css/site.scss': 'body { color: #111; }',
      'a/css/site.css': 'body{color:#eee}',
    })
    await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...deps,
      logger,
      manifest: createAssetManifest(),
    })
    const warned = logger.warn.mock.calls.map((c) => c.join(' '))
    expect(warned).toHaveLength(1)
    // The DIRECTION is the load-bearing part, and glob order is the opposite
    // of write order: `site.css` sorts first but `fs.copy` runs after the
    // compile, so the copied file is served and the Sass is discarded. Naming
    // them the wrong way round sends the author to edit the winning file.
    expect(warned[0]).toContain(
      'css/site.scss compiles to css/site.css, then css/site.css is copied over it',
    )
    // Consequence before mechanism: what the reader needs first is that their
    // edits are not reaching the site.
    expect(warned[0]).toContain(
      'edits to css/site.scss are not reaching the site',
    )
    // ...and it says the precedence is intended, not an accident: a copied
    // `.css` is often an assets.pipeline step's output, which must beat
    // kiss's built-in Sass.
    expect(warned[0]).toContain('wins by design')
    // ...and the claim is true: the plain file's bytes are what is served.
    expect((await site.read('out/css/site.css')).trim()).toBe(
      'body{color:#eee}',
    )
  })

  // Hashing renames the emitted file, so the second source's stat found
  // nothing and the detector short-circuited before it ever compared claims —
  // silent in exactly the configuration a production site builds with, which
  // is the one configuration where a silently dead stylesheet matters.
  it('warns the same way when assets.hash is on', async () => {
    const logger = { ...silentLogger, warn: vi.fn() }
    site = await makeSite({
      'a/css/site.scss': 'body { color: #111; }',
      'a/css/site.css': 'body{color:#eee}',
    })
    const manifest = createAssetManifest()
    await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...deps,
      config: { ...deps.config, assets: { hash: true } },
      logger,
      manifest,
    })
    const warned = logger.warn.mock.calls.map((c) => c.join(' '))
    expect(warned).toHaveLength(1)
    expect(warned[0]).toContain(
      'css/site.scss compiles to css/site.css, then css/site.css is copied over it',
    )
    // The hashed file is still emitted and still the copied bytes: the fix
    // moves when the claim is recorded, not what is served.
    const emitted = manifest.lookup('css/site.css')
    expect(emitted).toMatch(/^css\/site\.[0-9a-f]+\.css$/)
    expect((await site.read(`out/${emitted}`)).trim()).toBe('body{color:#eee}')
  })

  // A Sass syntax error was logged in red and then dropped on the floor:
  // complete() resolved, report().ok was true, `kiss-ssg check` said ok, and
  // the site shipped with no stylesheet. An agent following kiss's own
  // documented bar — "ok:true and exit 0 is the only passing result" — would
  // publish that. Same family as the dishonest dev rebuild this branch
  // exists to remove, in a corner nobody had looked at.
  it('reports a sass compile failure to its caller', async () => {
    site = await makeSite({
      'a/css/broken.scss': 'body { color: red;',
      'a/css/fine.scss': 'body { color: blue; }',
    })
    const result = await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...deps,
      logger: { ...silentLogger, error: vi.fn(), warn: vi.fn() },
      manifest: createAssetManifest(),
    })
    // Every file it tried is reported, so a caller can clear the entry for one
    // that has since started compiling.
    expect(result.sass.map((s) => s.file).sort()).toEqual([
      'css/broken.scss',
      'css/fine.scss',
    ])
    const failed = result.sass.filter((s) => s.error)
    expect(failed).toHaveLength(1)
    expect(failed[0].file).toBe('css/broken.scss')
    // ...and the sibling still compiled: one broken stylesheet does not stop
    // the rest, the same rule a failed page follows.
    expect(await site.exists('out/css/fine.css')).toBe(true)
  })

  it('does not warn when only a sass source emits that path', async () => {
    const logger = { ...silentLogger, warn: vi.fn() }
    site = await makeSite({ 'a/css/only.scss': 'body { color: #111; }' })
    await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...deps,
      logger,
      manifest: createAssetManifest(),
    })
    expect(logger.warn).not.toHaveBeenCalled()
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
