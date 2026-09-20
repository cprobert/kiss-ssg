import { describe, it, expect, afterEach, vi } from 'vitest'
import { helpersEntry, loadSiteHelpers } from '../../lib/site-helpers.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})

// A stand-in for the Kiss instance: the loader only ever touches what the
// site's own register function touches.
const fakeKiss = () => {
  const registered = {}
  return {
    registered,
    handlebars: {
      registerHelper: (name, fn) => {
        registered[name] = fn
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
})
