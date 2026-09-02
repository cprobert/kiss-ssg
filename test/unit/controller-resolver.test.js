import { describe, it, expect, afterEach } from 'vitest'
import { applyController } from '../../lib/controller-resolver.js'
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
