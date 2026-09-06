import { describe, it, expect, afterEach } from 'vitest'
import {
  applyController,
  loadController,
} from '../../lib/controller-resolver.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})
const deps = (controllersDir = 'c') => ({
  controllersDir,
  logger: silentLogger,
})

describe('applyController', () => {
  it('merges what a function controller returns', async () => {
    const out = await applyController(
      { view: 'v', controller: () => ({ title: 'T' }) },
      deps(),
    )
    expect(out.title).toBe('T')
    expect(out.view).toBe('v')
  })

  it('loads a module.exports controller and an export-default controller by filename', async () => {
    site = await makeSite({
      'c/legacy.js': 'module.exports = () => ({ title: "legacy" })',
      'c/modern.mjs': 'export default () => ({ title: "modern" })',
    })
    expect(
      (
        await applyController(
          { controller: 'legacy.js' },
          deps(`${site.root}/c`),
        )
      ).title,
    ).toBe('legacy')
    expect(
      (
        await applyController(
          { controller: 'modern.mjs' },
          deps(`${site.root}/c`),
        )
      ).title,
    ).toBe('modern')
  })

  it('rejects when the file is missing, the controller throws, or the type is unknown', async () => {
    // Flipped by review finding F-01 (2026-09-05): all three used to be logged
    // and ignored, so the page built with un-controlled options and the build
    // still exited 0. A controller that cannot run is now a page failure.
    site = await makeSite({})
    await expect(
      applyController(
        { controller: 'nope.js', title: 'keep' },
        deps(`${site.root}/c`),
      ),
    ).rejects.toThrow(/nope\.js/)
    await expect(
      applyController(
        {
          title: 'keep',
          controller: () => {
            throw new Error('x')
          },
        },
        deps(),
      ),
    ).rejects.toThrow('x')
    await expect(applyController({ controller: 42 }, deps())).rejects.toThrow(
      /Unknown controller type/,
    )
  })

  it('rejects when the module does not export a function', async () => {
    // The sibling of the three paths above (W2-1b): a controller file that
    // loads but exports an object — or a falsy value, which the `if (fn)`
    // guard used to drop before `runController` ever saw it — used to be
    // logged and ignored, so the page built from un-controlled options.
    site = await makeSite({
      'c/object.js': 'module.exports = { title: "nope" }',
      'c/falsy.mjs': 'export default 0',
    })
    await expect(
      applyController({ controller: 'object.js' }, deps(`${site.root}/c`)),
    ).rejects.toThrow(/not a function/)
    await expect(
      applyController({ controller: 'falsy.mjs' }, deps(`${site.root}/c`)),
    ).rejects.toThrow(/not a function/)
  })

  it('falls back to model.title when no title is set', async () => {
    const out = await applyController(
      { model: { title: 'From model' } },
      deps(),
    )
    expect(out.title).toBe('From model')
  })

  it('does not write the fallback title onto the options it was given', async () => {
    // A caller reusing one options object across a `.pages()` fan-out would
    // otherwise have the first item's title stick for every later page: the
    // fallback above only fills a title that is not already set.
    const options = { model: { title: 'From model' } }
    const out = await applyController(options, deps())
    expect(out.title).toBe('From model')
    expect(options.title).toBeUndefined()
  })
})

describe('loadController fresh', () => {
  // Rewrites need a distinct mtime for the ESM cache-buster to differ.
  const settle = () => new Promise((r) => setTimeout(r, 15))

  it('reloads an edited CommonJS controller when fresh', async () => {
    site = await makeSite({
      'c/cjs-fresh.js': 'module.exports = () => ({ title: "before" })',
    })
    const dir = `${site.root}/c`
    const first = await loadController(dir, 'cjs-fresh.js', {
      logger: silentLogger,
      fresh: true,
    })
    expect(first().title).toBe('before')
    await settle()
    await site.touch(
      'c/cjs-fresh.js',
      'module.exports = () => ({ title: "after" })',
    )
    const second = await loadController(dir, 'cjs-fresh.js', {
      logger: silentLogger,
      fresh: true,
    })
    expect(second().title).toBe('after')
  })

  it('reloads an edited ESM controller when fresh', async () => {
    site = await makeSite({
      'c/esm-fresh.mjs': 'export default () => ({ title: "before" })',
    })
    const dir = `${site.root}/c`
    const first = await loadController(dir, 'esm-fresh.mjs', {
      logger: silentLogger,
      fresh: true,
    })
    expect(first().title).toBe('before')
    await settle()
    await site.touch(
      'c/esm-fresh.mjs',
      'export default () => ({ title: "after" })',
    )
    const second = await loadController(dir, 'esm-fresh.mjs', {
      logger: silentLogger,
      fresh: true,
    })
    expect(second().title).toBe('after')
  })

  it('serves the cached CommonJS controller without fresh', async () => {
    site = await makeSite({
      'c/cjs-cached.js': 'module.exports = () => ({ title: "before" })',
    })
    const dir = `${site.root}/c`
    const first = await loadController(dir, 'cjs-cached.js', {
      logger: silentLogger,
    })
    expect(first().title).toBe('before')
    await settle()
    await site.touch(
      'c/cjs-cached.js',
      'module.exports = () => ({ title: "after" })',
    )
    const second = await loadController(dir, 'cjs-cached.js', {
      logger: silentLogger,
    })
    expect(second().title).toBe('before')
  })
})
