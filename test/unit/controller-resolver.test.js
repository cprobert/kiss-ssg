import { describe, it, expect, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  applyController,
  loadController,
} from '../../lib/controller-resolver.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

const run = promisify(execFile)

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

  it('two concurrent fresh loads of one CommonJS controller share a single import', async () => {
    // Two `.page()` registrations naming the same CommonJS controller are
    // replayed concurrently on a watch rebuild. Without the in-flight map the
    // second call deletes require.cache[filename] while the first import() is
    // still translating the CJS module, and Node throws ERR_INTERNAL_ASSERTION
    // out of loadCJSModuleWithModuleLoad — failing both pages.
    //
    // This case is a guard, not a reproduction: it cannot go RED under vitest,
    // which rewrites `import()` inside lib/ to its own module runner and never
    // reaches the CJS translator that trips the assertion. It pins the shared
    // in-flight behaviour; the child-process case below is the one that
    // actually reproduces the bug.
    site = await makeSite({
      'c/shared.cjs': 'module.exports = ({ model }) => ({ model, hit: true })',
    })
    const dir = `${site.root}/c`
    // Load it once the way a cold build leaves it: cached, not fresh.
    await loadController(dir, 'shared.cjs', { logger: silentLogger })
    const [a, b] = await Promise.all([
      loadController(dir, 'shared.cjs', { logger: silentLogger, fresh: true }),
      loadController(dir, 'shared.cjs', { logger: silentLogger, fresh: true }),
    ])
    expect(typeof a).toBe('function')
    expect(typeof b).toBe('function')
    expect(a({ model: 1 })).toEqual({ model: 1, hit: true })
    expect(b({ model: 2 })).toEqual({ model: 2, hit: true })
  })

  it('survives the concurrent fresh loads under Node’s own ESM loader', async () => {
    // The in-process case above is a guard, not a reproduction: vitest rewrites
    // `import()` inside lib/ to its module runner, which never reaches the CJS
    // translator that trips the ERR_INTERNAL_ASSERTION — that case stays green
    // with or without the fix. This runs the same two
    // concurrent fresh loads in a plain `node` child, where the bug is
    // deterministic without the in-flight map.
    site = await makeSite({
      'c/shared.cjs': 'module.exports = ({ model }) => ({ model, hit: true })',
      'race.mjs': `
        import { loadController } from ${JSON.stringify(new URL('../../lib/controller-resolver.js', import.meta.url).href)}
        import { silentLogger as logger } from ${JSON.stringify(new URL('../../lib/logger.js', import.meta.url).href)}
        const dir = process.argv[2]
        await loadController(dir, 'shared.cjs', { logger })
        const [a, b] = await Promise.all([
          loadController(dir, 'shared.cjs', { logger, fresh: true }),
          loadController(dir, 'shared.cjs', { logger, fresh: true }),
        ])
        process.stdout.write(JSON.stringify([a({ model: 1 }), b({ model: 2 })]))
      `,
    })
    const { stdout } = await run(process.execPath, [
      `${site.root}/race.mjs`,
      `${site.root}/c`,
    ])
    expect(JSON.parse(stdout)).toEqual([
      { model: 1, hit: true },
      { model: 2, hit: true },
    ])
  })

  it('re-reads the file on a fresh load after the first has settled', async () => {
    // The in-flight map must only ever share loads that are still running:
    // a fresh load once the previous one has settled still has to hit disk,
    // which is the whole point of `fresh` in watch mode.
    site = await makeSite({
      'c/settled.cjs': 'module.exports = () => ({ hit: 1 })',
    })
    const dir = `${site.root}/c`
    const first = await loadController(dir, 'settled.cjs', {
      logger: silentLogger,
      fresh: true,
    })
    expect(first().hit).toBe(1)
    await settle()
    await site.touch('c/settled.cjs', 'module.exports = () => ({ hit: 2 })')
    const second = await loadController(dir, 'settled.cjs', {
      logger: silentLogger,
      fresh: true,
    })
    expect(second().hit).toBe(2)
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
