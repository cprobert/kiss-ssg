import { describe, it, expect, afterEach, vi } from 'vitest'
import path from 'node:path'
import fs from 'fs-extra'
import { assetCopyOwner, copyAssets } from '../../lib/assets.js'
import { OutputRegistry } from '../../lib/output-registry.js'
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
  it('round four: a source disappearing between glob and stat does not fail the copy', async () => {
    site = await makeSite({ 'a/file.txt': 'HEALTHY', 'a/gone.txt': 'GONE' })
    const stat = fs.stat.bind(fs)
    const spy = vi.spyOn(fs, 'stat').mockImplementation(async (file) => {
      if (file === `${site.root}/a/gone.txt`)
        throw Object.assign(new Error('gone'), { code: 'ENOENT' })
      return stat(file)
    })
    try {
      const manifest = createAssetManifest()
      const result = await copyAssets(`${site.root}/a`, `${site.root}/out`, {
        ...deps,
        manifest,
      })
      expect(result.error).toBeUndefined()
      expect(manifest.lookup('file.txt')).toBe('file.txt')
    } finally {
      spy.mockRestore()
    }
  })
  it('reports a refused Sass write separately from an intentional partial skip', async () => {
    site = await makeSite({
      'a/site.scss': 'b { color: red }',
      'a/_partial.scss': '',
    })
    const outputs = new OutputRegistry(silentLogger)
    outputs.claim(`${site.root}/out/site.css`, 'page', 'page')
    const result = await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...deps,
      outputs,
    })
    expect(result.sass).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: 'site.scss', refused: true }),
        expect.objectContaining({ file: '_partial.scss', skipped: true }),
      ]),
    )
    expect(
      result.sass.find((item) => item.file === 'site.scss').skipped,
    ).toBeUndefined()
    expect(result.refused).toEqual(['site.scss'])
  })

  it.each([false, true])(
    'compares Sass fingerprints across copies with hash=%s',
    async (hash) => {
      site = await makeSite({ 'a/site.scss': 'b { color: red }' })
      const options = {
        ...deps,
        manifest: createAssetManifest(),
        config: { ...deps.config, assets: { hash } },
      }
      const copy = () =>
        copyAssets(`${site.root}/a`, `${site.root}/out`, options)
      const read = vi.spyOn(fs, 'readFile')
      try {
        expect((await copy()).sass[0].changed).toBe(true)
        expect((await copy()).sass[0].changed).toBe(false)
        await site.touch('a/site.scss', 'b { color: blue }')
        expect((await copy()).sass[0].changed).toBe(true)
        // Only the hashing post-pass reads emitted CSS, once per copy.
        expect(
          read.mock.calls.filter(([file]) =>
            String(file).endsWith('/out/site.css'),
          ),
        ).toHaveLength(hash ? 3 : 0)
      } finally {
        read.mockRestore()
      }
    },
  )
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

// A compile failure and a write failure are different problems with
// different fixes, and both used to be reported as "Error parsing sass file".
// A stylesheet that parses perfectly and cannot be written sent the author
// looking for a syntax error that was not there.
describe('copyAssets sass diagnostics', () => {
  it('names the write, not the parse, when the output cannot be written', async () => {
    site = await makeSite({ 'a/css/x.scss': 'b { color: red }' })
    // A directory where `x.css` has to go: the source parses, the write cannot.
    // It holds a file that is not this copy's, because an empty folder in the
    // way is cleared (kiss leaves those behind itself; see "a source that
    // changes type").
    await site.touch('out/css/x.css/foreign.txt', 'not ours')
    const logger = { ...silentLogger, error: vi.fn(), warn: vi.fn() }
    const result = await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...deps,
      logger,
    })
    expect(result.sass[0].error).toBeInstanceOf(Error)
    const said = logger.error.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(said).toContain('Error writing compiled sass to: ')
    expect(said).not.toContain('Error parsing sass file')
  })

  it('still names the parse when the stylesheet will not compile', async () => {
    site = await makeSite({ 'a/css/x.scss': 'b { color: ' })
    const logger = { ...silentLogger, error: vi.fn(), warn: vi.fn() }
    const result = await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...deps,
      logger,
    })
    expect(result.sass[0].error).toBeInstanceOf(Error)
    const said = logger.error.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(said).toContain('Error parsing sass file')
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

  // A leading underscore is THE Sass convention for "this is a partial, do not
  // compile me standalone" — dart-sass itself never compiles one. kiss globbed
  // them anyway, which was a red log line until a Sass error became a build
  // failure; then a site with the most ordinary stylesheet layout there is
  // could not build at all. Measured: main.css compiled correctly and the
  // build failed on _buttons.scss.
  it('does not compile _-prefixed sass partials standalone', async () => {
    site = await makeSite({
      'a/css/_buttons.scss': '.button { color: $brand; }',
      // `@import` rather than `@use`, because that is what the partial
      // convention is for: the importer defines the variable the partial
      // reads, which is exactly why the partial cannot compile alone. It is
      // also what the real sites in this estate use.
      'a/css/main.scss': "$brand: #c00;\n@import 'buttons';",
    })
    const result = await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...deps,
      logger: { ...silentLogger, error: vi.fn(), warn: vi.fn() },
      manifest: createAssetManifest(),
    })
    // The partial is reported as skipped rather than omitted — the caller
    // needs to know it was seen and deliberately not compiled.
    const compiled = result.sass.filter((s) => !s.skipped)
    expect(compiled.map((s) => s.file)).toEqual(['css/main.scss'])
    expect(compiled[0].error).toBeUndefined()
    expect(result.sass.filter((s) => s.skipped).map((s) => s.file)).toEqual([
      'css/_buttons.scss',
    ])
    expect(await site.exists('out/css/main.css')).toBe(true)
    // ...and the partial emits nothing of its own, which is the point of it.
    expect(await site.exists('out/css/_buttons.css')).toBe(false)
    // The partial's source is not copied through either — it is Sass, not an
    // asset a page can link.
    expect(await site.exists('out/css/_buttons.scss')).toBe(false)
  })

  // Adopting the partial convention silently removed a naming choice that
  // used to work: `_vendor.scss`, self-contained and imported by nothing, was
  // emitted as `_vendor.css` before and emits nothing now — measured, with
  // ZERO mentions anywhere in the build log. A site serving that file starts
  // serving a 404 after a clean build and nothing says why. Third time on this
  // branch that a fix for a loud wrong behaviour introduced a quiet one, which
  // is why the skip is now reported rather than assumed.
  it('says which sass partials it skipped', async () => {
    site = await makeSite({
      'a/css/_buttons.scss': '.b{}',
      'a/css/_forms.scss': '.f{}',
      'a/css/main.scss': 'body{color:red}',
    })
    const info = vi.fn()
    const result = await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...deps,
      logger: { ...silentLogger, info },
      manifest: createAssetManifest(),
    })
    const said = info.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(said).toContain('_buttons.scss')
    expect(said).toContain('_forms.scss')
    // One line for the set, not one per file: a site with a dozen partials
    // should not get a dozen lines every build.
    expect(
      info.mock.calls.filter(([m]) => /partial/i.test(String(m))),
    ).toHaveLength(1)
    // Skipped files are reported to the caller too, distinguishably.
    expect(
      result.sass
        .filter((s) => s.skipped)
        .map((s) => s.file)
        .sort(),
    ).toEqual(['css/_buttons.scss', 'css/_forms.scss'])
  })

  // The collision detector claimed the skipped partial as a compiled source,
  // so a legitimately served `_theme.css` beside a `_theme.scss` was reported
  // as an overwrite that never happened — advising the author to delete a file
  // that is correctly consumed by another entry point. That is the P4 warning
  // firing on a case that no longer exists.
  it('does not claim a skipped partial as a compiled source', async () => {
    site = await makeSite({
      'a/css/_theme.scss': '.t{}',
      'a/css/_theme.css': '.served{}',
    })
    const warn = vi.fn()
    await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      ...deps,
      logger: { ...silentLogger, warn },
      manifest: createAssetManifest(),
    })
    expect(
      warn.mock.calls.filter(([m]) => /compiles to/.test(String(m))),
    ).toEqual([])
    expect((await site.read('out/css/_theme.css')).trim()).toBe('.served{}')
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

// A copy that failed partway left what it had already written out of the
// manifest, so a later run that found the asset root gone removed only the
// outputs the manifest knew and the rest stayed in the build for good. In use:
// a `git checkout` during `--dev` left a stale asset until restart. Every
// writer in a copy — the copy itself, the Sass compile, the hash move, and the
// stale-output unlink — is a place the run can stop between writing and
// recording, so each is pinned.
describe('copyAssets that fails partway', () => {
  const enoent = () => Object.assign(new Error('gone'), { code: 'ENOENT' })
  const quiet = { ...silentLogger, error: vi.fn(), warn: vi.fn() }

  // fs-extra's contract: the filter is asked about each item before the item
  // is written. This stand-in keeps that contract and stops at `stopAt`, the
  // shape of a source file vanishing between the filter and its copyfile.
  const copyStoppingAt = (names, stopAt) =>
    vi
      .spyOn(fs, 'copy')
      .mockImplementationOnce(async (src, dest, { filter }) => {
        for (const name of names) {
          const from = `${src}/${name}`
          const to = `${dest}/${name}`
          if (!(await filter(from, to))) continue
          if (name === stopAt) throw enoent()
          await fs.copy(from, to)
        }
      })

  const run = async (options) => {
    site = await makeSite({ 'a/old.txt': 'old' })
    const opts = {
      ...deps,
      logger: quiet,
      manifest: createAssetManifest(),
      outputs: new OutputRegistry(silentLogger),
      ...options,
    }
    const copy = () => copyAssets(`${site.root}/a`, `${site.root}/out`, opts)
    return { opts, copy }
  }

  it('removes the files a failed copy had already written once the root is gone', async () => {
    const { copy } = await run()
    expect((await copy()).error).toBeUndefined()
    await site.touch('a/one.txt', 'one')
    await site.touch('a/two.txt', 'two')
    const spy = copyStoppingAt(['one.txt', 'two.txt'], 'two.txt')
    try {
      expect((await copy()).error).toBeTruthy()
    } finally {
      spy.mockRestore()
    }
    expect(await site.exists('out/one.txt')).toBe(true)
    await fs.remove(`${site.root}/a`)
    expect((await copy()).error).toBeUndefined()
    expect(await site.exists('out/one.txt')).toBe(false)
    expect(await site.exists('out/old.txt')).toBe(false)
  })

  // fs-extra copies a folder's entries concurrently, so `fs.copy` can reject
  // while a sibling folder is still being walked. Anything that folder writes
  // after the failure was recorded would be in no record at all.
  it('starts no write after the failure has been recorded', async () => {
    const { copy } = await run()
    expect((await copy()).error).toBeUndefined()
    await site.touch('a/one.txt', 'one')
    await site.touch('a/late.txt', 'late')
    let late
    const spy = vi
      .spyOn(fs, 'copy')
      .mockImplementationOnce(async (src, dest, { filter }) => {
        await filter(`${src}/one.txt`, `${dest}/one.txt`)
        await fs.copy(`${src}/one.txt`, `${dest}/one.txt`)
        // The sibling still in flight: it reaches its next entry only after
        // the copy as a whole has rejected.
        late = new Promise((resolve) => setTimeout(resolve, 20)).then(
          async () => {
            if (await filter(`${src}/late.txt`, `${dest}/late.txt`))
              await fs.copy(`${src}/late.txt`, `${dest}/late.txt`)
          },
        )
        throw enoent()
      })
    try {
      expect((await copy()).error).toBeTruthy()
      await late
    } finally {
      spy.mockRestore()
    }
    expect(await site.exists('out/late.txt')).toBe(false)
    await fs.remove(`${site.root}/a`)
    expect((await copy()).error).toBeUndefined()
    expect(await site.exists('out/one.txt')).toBe(false)
  })

  // A source file aimed at an existing output directory fails the copy
  // before anything is written. The directory is not an output: recording it
  // for removal made every later reconcile try to unlink a directory, fail,
  // and record it again, so the session never recovered after the source
  // was fixed (found by the Codex review, 2026-10-03).
  it('recovers once a file that collided with an output directory is removed', async () => {
    const { copy } = await run()
    expect((await copy()).error).toBeUndefined()
    await site.touch('out/x/keep.txt', 'keep')
    await site.touch('a/x', 'a file where a directory is')
    expect((await copy()).error).toBeTruthy()
    await fs.remove(`${site.root}/a/x`)
    expect((await copy()).error).toBeUndefined()
    expect((await copy()).error).toBeUndefined()
    expect(await site.read('out/x/keep.txt')).toBe('keep')
  })

  // The guard in the catch keeps a directory out of the record in the case
  // above, so that case never reaches the unlink loop. A directory can still
  // reach it: a source that turns from a file into a directory between the
  // filter's lstat and fs-extra's own is recorded as a file and then created
  // as a directory. The unlink loop must release it rather than retry it.
  it('does not retry a recorded output that turns out to be a directory', async () => {
    const { opts, copy } = await run({ outputs: undefined })
    expect((await copy()).error).toBeUndefined()
    await site.touch('out/x/keep.txt', 'keep')
    opts.manifest.unrecorded(
      assetCopyOwner(`${site.root}/a`, `${site.root}/out`),
      ['x'],
    )
    expect((await copy()).error).toBeUndefined()
    expect((await copy()).error).toBeUndefined()
    expect(await site.read('out/x/keep.txt')).toBe('keep')
  })

  // A source that changes type between copies meets its own output from the
  // previous shape, and fs-extra refuses to put a file over a directory or a
  // directory over a file. That output was only removed after a copy that
  // succeeded, so every rebuild failed until restart. What is in the way is
  // cleared only when it is all this copy's own output (or an empty folder,
  // which kiss leaves behind because it never removes output directories);
  // a foreign file still fails the copy, as the collision test above pins.
  describe.each([
    ['with a registry', () => new OutputRegistry(silentLogger)],
    ['without a registry', () => undefined],
  ])('a source that changes type, %s', (_label, registry) => {
    it.each([false, true])(
      'replaces a folder of its own outputs with a file (intermediate copy: %s)',
      async (intermediate) => {
        const { copy } = await run({ outputs: registry() })
        await site.touch('a/x/inner.txt', 'inner')
        expect((await copy()).error).toBeUndefined()
        await fs.remove(`${site.root}/a/x`)
        // The copy that sees the folder gone removes its file and leaves
        // the empty folder behind.
        if (intermediate) expect((await copy()).error).toBeUndefined()
        await site.touch('a/x', 'now a file')
        expect((await copy()).error).toBeUndefined()
        expect(await site.read('out/x')).toBe('now a file')
        expect((await copy()).error).toBeUndefined()
      },
    )

    it('replaces its own output file with a folder', async () => {
      const { copy } = await run({ outputs: registry() })
      await site.touch('a/x', 'a file')
      expect((await copy()).error).toBeUndefined()
      await fs.remove(`${site.root}/a/x`)
      await site.touch('a/x/inner.txt', 'inner')
      expect((await copy()).error).toBeUndefined()
      expect(await site.read('out/x/inner.txt')).toBe('inner')
      expect((await copy()).error).toBeUndefined()
    })

    // POSIX answers `unlink` of a path whose parent is now a FILE with
    // ENOTDIR; Windows answers ENOENT. Both mean the file is gone, and
    // treating ENOTDIR as a failure re-recorded the path on every run, so
    // a folder replaced by a file never recovered on Linux or macOS. This
    // makes `fs.unlink` answer the POSIX way on any platform.
    it('treats a stale output under a parent that became a file as gone', async () => {
      const unlink = fs.unlink.bind(fs)
      const spy = vi.spyOn(fs, 'unlink').mockImplementation(async (file) => {
        for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
          const stat = await fs.lstat(dir).catch(() => null)
          if (stat && !stat.isDirectory())
            throw Object.assign(new Error('not a directory'), {
              code: 'ENOTDIR',
            })
          if (path.dirname(dir) === dir) break
        }
        return unlink(file)
      })
      try {
        const { copy } = await run({ outputs: registry() })
        await site.touch('a/x/inner.txt', 'inner')
        expect((await copy()).error).toBeUndefined()
        await fs.remove(`${site.root}/a/x`)
        await site.touch('a/x', 'now a file')
        expect((await copy()).error).toBeUndefined()
        expect((await copy()).error).toBeUndefined()
        expect(await site.read('out/x')).toBe('now a file')
      } finally {
        spy.mockRestore()
      }
    })

    // Sass compiles before the copy runs, so a stylesheet in a folder that
    // used to be a file meets that old output file before the copy's filter
    // could clear it, and the rebuild reported a write failure.
    it('compiles into a folder that used to be its own output file', async () => {
      const { copy } = await run({ outputs: registry() })
      await site.touch('a/x', 'a file')
      expect((await copy()).error).toBeUndefined()
      await fs.remove(`${site.root}/a/x`)
      await site.touch('a/x/site.scss', 'b { color: red }')
      const result = await copy()
      expect(result.error).toBeUndefined()
      expect(result.sass.filter((item) => item.error)).toEqual([])
      expect(await site.read('out/x/site.css')).toContain('color')
    })
  })

  // Clearing is all or nothing: one file in the way that is not this copy's
  // own vetoes it, so nothing is deleted and the copy fails as it did before.
  // Clearing is for output a PREVIOUS run left. A stylesheet compiled seconds
  // earlier in this same run is this copy's too, and a folder named like it
  // (`site.css/` beside `site.scss`) cleared it and copied the folder in: the
  // compile reported success, the stylesheet was gone, and the build said ok.
  // Before clearing existed the collision failed the copy, loudly; it must
  // still (found by the Codex review, 2026-10-03).
  describe('never clears an output this run already wrote', () => {
    const compiledStillServed = async (result) => {
      for (const item of result.sass.filter(
        (s) => !s.error && !s.skipped && !s.refused,
      )) {
        const css = item.file.replace(/\.(scss|sass)$/i, '.css')
        const stat = await fs.lstat(`${site.root}/out/${css}`).catch(() => null)
        expect(stat?.isFile(), `${css} reported compiled but not served`).toBe(
          true,
        )
      }
    }

    it('fails a first copy rather than drop the stylesheet', async () => {
      site = await makeSite({
        'a/site.scss': 'b { color: red }',
        'a/site.css/child.txt': 'child',
      })
      const result = await copyAssets(`${site.root}/a`, `${site.root}/out`, {
        ...deps,
        logger: quiet,
        manifest: createAssetManifest(),
        outputs: new OutputRegistry(silentLogger),
      })
      expect(result.error).toBeTruthy()
      await compiledStillServed(result)
    })

    it.each([
      ['with a registry', () => new OutputRegistry(silentLogger)],
      ['without a registry', () => undefined],
    ])(
      'fails a later copy rather than drop the stylesheet, %s',
      async (_l, registry) => {
        const { copy } = await run({ outputs: registry() })
        await site.touch('a/site.scss', 'b { color: red }')
        expect((await copy()).error).toBeUndefined()
        await site.touch('a/site.css/child.txt', 'child')
        const result = await copy()
        expect(result.error).toBeTruthy()
        await compiledStillServed(result)
      },
    )
  })

  describe('a source that changes type, with something foreign in the way', () => {
    it('clears nothing when a page owns a file in the folder', async () => {
      const outputs = new OutputRegistry(silentLogger)
      const { copy } = await run({ outputs })
      await site.touch('a/x/inner.txt', 'inner')
      expect((await copy()).error).toBeUndefined()
      await site.touch('out/x/page.html', 'PAGE')
      outputs.claim(`${site.root}/out/x/page.html`, 'page:x', 'page')
      await fs.remove(`${site.root}/a/x`)
      await site.touch('a/x', 'now a file')
      expect((await copy()).error).toBeTruthy()
      expect(await site.read('out/x/page.html')).toBe('PAGE')
      expect(await site.read('out/x/inner.txt')).toBe('inner')
    })

    it('neither clears nor walks into a link it did not write', async () => {
      const { copy } = await run()
      await site.touch('a/x/inner.txt', 'inner')
      expect((await copy()).error).toBeUndefined()
      await site.touch('elsewhere/precious.txt', 'precious')
      fs.symlinkSync(
        `${site.root}/elsewhere`,
        `${site.root}/out/x/link`,
        'junction',
      )
      await fs.remove(`${site.root}/a/x`)
      await site.touch('a/x', 'now a file')
      expect((await copy()).error).toBeTruthy()
      expect(await site.read('elsewhere/precious.txt')).toBe('precious')
      expect(await site.read('out/x/inner.txt')).toBe('inner')
      expect(fs.lstatSync(`${site.root}/out/x/link`).isSymbolicLink()).toBe(
        true,
      )
    })
  })

  it('removes them when the very first copy was the one that failed', async () => {
    site = await makeSite({ 'a/one.txt': 'one', 'a/two.txt': 'two' })
    const opts = {
      ...deps,
      logger: quiet,
      manifest: createAssetManifest(),
      outputs: new OutputRegistry(silentLogger),
    }
    const copy = () => copyAssets(`${site.root}/a`, `${site.root}/out`, opts)
    const spy = copyStoppingAt(['one.txt', 'two.txt'], 'two.txt')
    try {
      expect((await copy()).error).toBeTruthy()
    } finally {
      spy.mockRestore()
    }
    expect(await site.exists('out/one.txt')).toBe(true)
    await fs.remove(`${site.root}/a`)
    // The root existed — this copy wrote from it — so its disappearing is a
    // deletion to reconcile, not the typo a missing first root is.
    expect((await copy()).error).toBeUndefined()
    expect(await site.exists('out/one.txt')).toBe(false)
  })

  it('removes a compiled stylesheet when the copy after the compile failed', async () => {
    const { copy } = await run()
    expect((await copy()).error).toBeUndefined()
    await site.touch('a/site.scss', 'b { color: red }')
    const spy = vi.spyOn(fs, 'copy').mockRejectedValueOnce(enoent())
    try {
      expect((await copy()).error).toBeTruthy()
    } finally {
      spy.mockRestore()
    }
    expect(await site.exists('out/site.css')).toBe(true)
    await fs.remove(`${site.root}/a`)
    expect((await copy()).error).toBeUndefined()
    expect(await site.exists('out/site.css')).toBe(false)
  })

  it('removes a hashed file when a later rename in the same copy failed', async () => {
    const { copy } = await run({
      config: { ...deps.config, assets: { hash: true } },
    })
    expect((await copy()).error).toBeUndefined()
    await site.touch('a/a.js', 'let a = 1')
    await site.touch('a/b.js', 'let b = 2')
    const move = fs.move.bind(fs)
    let moves = 0
    const spy = vi
      .spyOn(fs, 'move')
      .mockImplementation(async (from, to, options) => {
        if (++moves === 2)
          throw Object.assign(new Error('busy'), { code: 'EBUSY' })
        return move(from, to, options)
      })
    try {
      expect((await copy()).error).toBeTruthy()
    } finally {
      spy.mockRestore()
    }
    expect((await fs.readdir(`${site.root}/out`)).length).toBeGreaterThan(1)
    await fs.remove(`${site.root}/a`)
    expect((await copy()).error).toBeUndefined()
    expect(await fs.readdir(`${site.root}/out`)).toEqual([])
  })

  it('retries a stale output whose removal failed, rather than forgetting it', async () => {
    const { copy } = await run()
    await site.touch('a/keep.txt', 'keep')
    expect((await copy()).error).toBeUndefined()
    await fs.remove(`${site.root}/a/old.txt`)
    const spy = vi
      .spyOn(fs, 'unlink')
      .mockRejectedValueOnce(
        Object.assign(new Error('locked'), { code: 'EPERM' }),
      )
    try {
      expect((await copy()).error).toBeTruthy()
    } finally {
      spy.mockRestore()
    }
    expect(await site.exists('out/old.txt')).toBe(true)
    expect((await copy()).error).toBeUndefined()
    expect(await site.exists('out/old.txt')).toBe(false)
    expect(await site.exists('out/keep.txt')).toBe(true)
  })
})
