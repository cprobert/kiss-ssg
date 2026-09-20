import { describe, it, expect, afterEach, vi } from 'vitest'
import { helpersEntry, loadSiteHelpers } from '../../lib/site-helpers.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})

// A stand-in for the Kiss instance: the loader only ever touches what the
// site's own register function touches. `registered` and `handlebars.helpers`
// are the same object, because Handlebars' registry is one too — the loader
// has to be able to read back what the site's registrar put there.
const fakeKiss = () => {
  const registered = {}
  return {
    registered,
    handlebars: {
      helpers: registered,
      registerHelper: (name, fn) => {
        registered[name] = fn
      },
      unregisterHelper: (name) => {
        delete registered[name]
      },
    },
  }
}

describe('helpersEntry', () => {
  it('finds index.js, index.mjs or index.cjs, in that order', async () => {
    site = await makeSite({
      'a/index.mjs': 'export function registerHelpers() {}',
      'b/index.js': 'export function registerHelpers() {}',
    })
    expect(helpersEntry(`${site.root}/a`)).toBe(`${site.root}/a/index.mjs`)
    expect(helpersEntry(`${site.root}/b`)).toBe(`${site.root}/b/index.js`)
  })

  // A site with no custom helpers is the ordinary case, not a misconfigured
  // one: it must be silent rather than warn about a folder nobody asked for.
  it('is null for a missing folder, an empty one, and no folder at all', async () => {
    site = await makeSite({ 'empty/.keep': '' })
    expect(helpersEntry(`${site.root}/nope`)).toBeNull()
    expect(helpersEntry(`${site.root}/empty`)).toBeNull()
    expect(helpersEntry(null)).toBeNull()
    expect(helpersEntry(undefined)).toBeNull()
  })

  // Green on Linux whatever the implementation does; this is the assertion
  // that fails on Windows CI, where `path.resolve` returns backslashes. The
  // path is compared against a watcher event and lands in
  // `_failures[].buildTo`, so a native separator is a comparison that never
  // matches and a failure nobody can grep for.
  it('is posix-normalised, like every other path kiss hands out', async () => {
    site = await makeSite({
      'h/index.js': 'export function registerHelpers() {}',
    })
    const entry = helpersEntry(`${site.root}/h`)
    expect(entry).not.toContain('\\')
    expect(entry).toBe(`${site.root}/h/index.js`)
  })
})

describe('loadSiteHelpers', () => {
  it('registers what the folder exports as registerHelpers', async () => {
    site = await makeSite({
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => String(s).toUpperCase()) }",
    })
    const kiss = fakeKiss()
    const result = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: silentLogger,
    })
    expect(result.loaded).toBe(true)
    expect(kiss.registered.shout('hi')).toBe('HI')
  })

  it('accepts a default export too', async () => {
    site = await makeSite({
      'helpers/index.js':
        "export default (kiss) => kiss.handlebars.registerHelper('x', () => 1)",
    })
    const kiss = fakeKiss()
    const result = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: silentLogger,
    })
    expect(result.loaded).toBe(true)
    expect(kiss.registered.x()).toBe(1)
  })

  it('says nothing and loads nothing when there is no folder', async () => {
    const logger = { ...silentLogger, warn: vi.fn(), error: vi.fn() }
    const result = await loadSiteHelpers(null, { kiss: fakeKiss(), logger })
    expect(result).toEqual({ loaded: false, entry: null })
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  // Every `{{helper}}` rendering as nothing on a green build is the failure
  // this prevents, so it is reported rather than shrugged off.
  it('reports an entry that exports no function, and does not throw', async () => {
    site = await makeSite({
      'helpers/index.js': "export const nope = 'a string'",
    })
    const logger = { ...silentLogger, error: vi.fn() }
    const result = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss: fakeKiss(),
      logger,
    })
    expect(result.loaded).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error.message).toContain('registerHelpers')
    expect(logger.error).toHaveBeenCalled()
  })

  // The upgrade hazard. `folders.helpers` defaults to `./helpers`, so a site
  // that already had a root `helpers/` folder of unrelated utilities gets it
  // imported on the first build after the upgrade — and failed the whole build
  // over a folder nobody had pointed kiss at. kiss guessed, so kiss says so
  // and carries on. An entry that exports no registrar is the evidence the
  // folder belongs to someone else; anything that *breaks* is still a failure,
  // because a folder that is ours and broken loses every helper silently.
  it("only warns about a missing registrar when the folder was kiss's own guess", async () => {
    site = await makeSite({
      'helpers/index.js': 'export const formatDate = (d) => String(d)',
    })
    const logger = { ...silentLogger, warn: vi.fn(), error: vi.fn() }
    const guessed = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss: fakeKiss(),
      logger,
      required: false,
    })
    expect(guessed.loaded).toBe(false)
    expect(guessed.error).toBeUndefined()
    expect(logger.error).not.toHaveBeenCalled()
    const [warning] = logger.warn.mock.calls.at(-1)
    expect(warning).toContain('helpers/index.js')
    expect(warning).toContain('folders.helpers')
  })

  it('still fails when the author named folders.helpers explicitly', async () => {
    site = await makeSite({
      'helpers/index.js': 'export const formatDate = (d) => String(d)',
    })
    const result = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss: fakeKiss(),
      logger: { ...silentLogger, error: vi.fn() },
      required: true,
    })
    expect(result.error).toBeInstanceOf(Error)
  })

  it('reports a module that throws on import, and does not throw', async () => {
    site = await makeSite({
      'helpers/index.js': "throw new Error('boom from the helper module')",
    })
    const logger = { ...silentLogger, error: vi.fn() }
    const result = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss: fakeKiss(),
      logger,
    })
    expect(result.loaded).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
  })

  // The whole point of `fresh`: without a cache bust the second import
  // returns Node's cached copy and the edit never lands.
  it('picks up an edited module under fresh, where a plain reload would not', async () => {
    site = await makeSite({
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('v', () => 'ONE') }",
    })
    const first = fakeKiss()
    await loadSiteHelpers(`${site.root}/helpers`, {
      kiss: first,
      logger: silentLogger,
    })
    expect(first.registered.v()).toBe('ONE')

    await new Promise((r) => setTimeout(r, 10)) // a distinct mtime
    await site.touch(
      'helpers/index.js',
      "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('v', () => 'TWO') }",
    )

    const cached = fakeKiss()
    await loadSiteHelpers(`${site.root}/helpers`, {
      kiss: cached,
      logger: silentLogger,
    })
    expect(cached.registered.v()).toBe('ONE') // Node's cache

    const fresh = fakeKiss()
    await loadSiteHelpers(`${site.root}/helpers`, {
      kiss: fresh,
      logger: silentLogger,
      fresh: true,
    })
    expect(fresh.registered.v()).toBe('TWO')
  })

  // A reload re-runs the registrar against a registry that still holds the
  // previous load's helpers, so a helper the new source dropped stayed live
  // and every page kept rendering it. Deleting a helper has to take effect
  // the same way editing one does, or the running site disagrees with the
  // source on disk and only a restart settles it.
  it('unregisters a helper the new source no longer registers', async () => {
    site = await makeSite({
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('a', () => 'A'); kiss.handlebars.registerHelper('b', () => 'B') }",
    })
    const kiss = fakeKiss()
    const first = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: silentLogger,
    })
    expect([...first.registered].sort()).toEqual(['a', 'b'])

    await new Promise((r) => setTimeout(r, 10)) // a distinct mtime
    await site.touch(
      'helpers/index.js',
      "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('a', () => 'A2') }",
    )
    const second = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: silentLogger,
      fresh: true,
      previous: first.registered,
    })
    expect(second.registered).toEqual(['a'])
    expect(kiss.registered.a()).toBe('A2')
    expect(kiss.registered.b).toBeUndefined()
  })

  // Clearing the old names is what makes a removal land, so it happens before
  // the new registrar runs — which means a registrar that throws half way
  // would otherwise leave the site with fewer helpers than either version of
  // the file registers. Put them back.
  it('restores the previous helpers when the reload throws part-way', async () => {
    site = await makeSite({
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('a', () => 'A'); kiss.handlebars.registerHelper('b', () => 'B') }",
    })
    const kiss = fakeKiss()
    const first = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: silentLogger,
    })

    await new Promise((r) => setTimeout(r, 10))
    await site.touch(
      'helpers/index.js',
      "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('a', () => 'A2'); throw new Error('half way') }",
    )
    const second = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: { ...silentLogger, error: vi.fn() },
      fresh: true,
      previous: first.registered,
    })
    expect(second.loaded).toBe(false)
    expect(kiss.registered.a()).toBe('A')
    expect(kiss.registered.b()).toBe('B')
  })

  // The caller needs to know which names the site's registrar added, and only
  // those: a built-in kiss helper is not the site's to unregister later.
  it('reports only the names the site registrar added', async () => {
    site = await makeSite({
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('mine', () => 1) }",
    })
    const kiss = fakeKiss()
    kiss.handlebars.registerHelper('builtin', () => 0)
    const result = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: silentLogger,
    })
    expect(result.registered).toEqual(['mine'])
  })
})
