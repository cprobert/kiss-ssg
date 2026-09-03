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

  it('leaves options alone when the file is missing or the controller throws', async () => {
    site = await makeSite({})
    const missing = await applyController(
      { controller: 'nope.js', title: 'keep' },
      deps(`${site.root}/c`),
    )
    expect(missing.title).toBe('keep')
    const thrown = await applyController(
      {
        title: 'keep',
        controller: () => {
          throw new Error('x')
        },
      },
      deps(),
    )
    expect(thrown.title).toBe('keep')
  })

  it('falls back to model.title when no title is set', async () => {
    const out = await applyController(
      { model: { title: 'From model' } },
      deps(),
    )
    expect(out.title).toBe('From model')
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
