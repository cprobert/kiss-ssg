import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  helpersEntry,
  isActiveHelpersEntry,
  isHelpersEntry,
  loadSiteHelpers,
} from '../../lib/site-helpers.js'
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

// The question `Kiss` actually has to answer on a watch event is not "what is
// the entry now" but "is THIS file an entry" — and it has to answer it for a
// path chokidar produced, which is relative when the watched folder is.
describe('isHelpersEntry', () => {
  it('matches a relative folder against a relative event, and an absolute against an absolute', async () => {
    site = await makeSite({
      'h/index.js': 'export function registerHelpers() {}',
    })
    const cwd = process.cwd()
    process.chdir(site.root)
    try {
      // The shipped default: `resolveConfig` leaves `./helpers` relative,
      // chokidar watches the relative path and emits relative events, and
      // `helpersEntry` returns an absolute one. Separator normalisation alone
      // never makes those equal.
      expect(isHelpersEntry('./h', 'h/index.js')).toBe(true)
      expect(isHelpersEntry('./h', `${site.root}/h/index.js`)).toBe(true)
      expect(isHelpersEntry(`${site.root}/h`, 'h/index.js')).toBe(true)
    } finally {
      process.chdir(cwd)
    }
  })

  it('is false for a sibling module and for a file outside the folder', async () => {
    site = await makeSite({
      'h/index.js': 'export function registerHelpers() {}',
    })
    expect(isHelpersEntry(`${site.root}/h`, `${site.root}/h/format.js`)).toBe(
      false,
    )
    expect(isHelpersEntry(`${site.root}/h`, `${site.root}/other.js`)).toBe(
      false,
    )
    expect(isHelpersEntry(null, `${site.root}/h/index.js`)).toBe(false)
  })

  // It asks whether the path COULD be an entry, not whether it is the one
  // `helpersEntry` resolves to today. A delete is the case that proves the
  // difference: with index.js and index.mjs both present, deleting index.js
  // leaves `helpersEntry` returning index.mjs, so asking "is this the entry"
  // would classify the file that just vanished as a sibling — and neither the
  // fallback would load nor the deleted entry's helpers unregister.
  it('matches every entry name, not just the one precedence picks today', async () => {
    site = await makeSite({
      'h/index.js': 'export function registerHelpers() {}',
      'h/index.mjs': 'export function registerHelpers() {}',
    })
    expect(helpersEntry(`${site.root}/h`)).toBe(`${site.root}/h/index.js`)
    expect(isHelpersEntry(`${site.root}/h`, `${site.root}/h/index.mjs`)).toBe(
      true,
    )
    expect(isHelpersEntry(`${site.root}/h`, `${site.root}/h/index.cjs`)).toBe(
      true,
    )
  })
})

// `isHelpersEntry` answers "could this file be an entry", which is what a
// DELETE needs. A change needs a narrower question, and conflating the two
// was a regression: editing `index.mjs` while `index.js` is the selected
// entry took the reload path, but the loader busts the selected entry alone —
// so `index.mjs` stayed cached, the site rebuilt with stale helpers, and the
// restart notice that used to fire no longer did.
describe('isActiveHelpersEntry', () => {
  it('is true for the selected entry and false for a candidate that is not selected', async () => {
    site = await makeSite({
      'h/index.js': 'export function registerHelpers() {}',
      'h/index.mjs': 'export function registerHelpers() {}',
    })
    expect(
      isActiveHelpersEntry(`${site.root}/h`, `${site.root}/h/index.js`),
    ).toBe(true)
    expect(
      isActiveHelpersEntry(`${site.root}/h`, `${site.root}/h/index.mjs`),
    ).toBe(false)
  })

  // A deleted candidate changes WHICH file is the entry — including to none at
  // all — so it takes the reload path even though it is not the selection.
  it('is true for a candidate that has just been deleted', async () => {
    site = await makeSite({
      'h/index.mjs': 'export function registerHelpers() {}',
    })
    expect(
      isActiveHelpersEntry(`${site.root}/h`, `${site.root}/h/index.js`),
    ).toBe(true)
    expect(
      isActiveHelpersEntry(`${site.root}/h`, `${site.root}/h/format.js`),
    ).toBe(false)
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
    expect(first.registered.map((h) => h.name).sort()).toEqual(['a', 'b'])

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
    expect(second.registered.map((h) => h.name)).toEqual(['a'])
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

  // A site upgrading from before `folders.helpers` existed still has
  // `registerHelpers(kiss)` in its router, so the same registrar runs twice:
  // once by hand, once by kiss. Harmless in itself — but if "the site's
  // helpers" is measured as "names that were not in the registry before", the
  // manual call has already put them there and kiss sees an EMPTY list. The
  // teardown above then has nothing to tear down, and a removed helper stays
  // live on exactly the sites most likely to hit it. Measured on the real
  // loader before this was fixed: `registered: []`, `banner` still 'OLD'.
  it('still reports the names when the router registered them by hand too', async () => {
    site = await makeSite({
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('banner', () => 'OLD'); kiss.handlebars.registerHelper('keep', () => 'K') }",
    })
    const kiss = fakeKiss()
    const { registerHelpers } = await import(`${site.root}/helpers/index.js`)
    registerHelpers(kiss) // the router's own call, before kiss loads the folder
    const first = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: silentLogger,
    })
    expect(first.registered.map((h) => h.name).sort()).toEqual([
      'banner',
      'keep',
    ])

    await new Promise((r) => setTimeout(r, 10))
    await site.touch(
      'helpers/index.js',
      "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('keep', () => 'K') }",
    )
    const second = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: silentLogger,
      fresh: true,
      previous: first.registered,
    })
    // And what the teardown then does is "undo what this loader did", not
    // "delete the name": `banner` reverts to the ROUTER's registration, which
    // is still genuinely in effect — the router really did call the registrar
    // and nothing has re-run it. Deleting it would be kiss removing a
    // registration it never made, which is the same mistake that destroyed an
    // overridden built-in above. The double registration is the thing to fix
    // on such a site, and it is an anti-pattern the migrate skill now names.
    expect(kiss.registered.banner()).toBe('OLD')
    expect(second.registered.map((h) => h.name)).toEqual(['keep'])
  })

  // Ownership by "the function reference changed" swept up a kiss BUILT-IN the
  // site registrar overrode — and teardown unregisters a name rather than
  // putting back what was there, so dropping an override DESTROYED the
  // built-in. Measured: {{markdown}} went BUILTIN -> SITE -> "" (empty, not an
  // error, because an argument-less mustache is a missing property to
  // Handlebars). A site that overrides `markdown` and later stops silently
  // loses Markdown rendering on every page. Worse than the bug that this
  // ownership rule was introduced to fix.
  it('restores a built-in the registrar overrode, rather than destroying it', async () => {
    site = await makeSite({
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('markdown', () => 'SITE') }",
    })
    const kiss = fakeKiss()
    kiss.handlebars.registerHelper('markdown', () => 'BUILTIN')
    const first = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: silentLogger,
    })
    expect(kiss.registered.markdown()).toBe('SITE')

    await new Promise((r) => setTimeout(r, 10))
    await site.touch(
      'helpers/index.js',
      "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('other', () => 'O') }",
    )
    await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: silentLogger,
      fresh: true,
      previous: first.registered,
    })
    expect(kiss.registered.markdown()).toBe('BUILTIN')
    expect(kiss.registered.other()).toBe('O')
  })

  // Restoring the names the old registrar owned is not the same as undoing the
  // attempt. A registrar that adds `temporary` and then throws left it behind,
  // and a failed load reports no `registered` list — so the caller's ownership
  // list still said ['a'] and nothing would ever remove `temporary`, not a
  // later success and not a delete. Measured: `temporary = T` after the throw.
  it('leaves nothing behind from a registrar that threw part-way', async () => {
    site = await makeSite({
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('a', () => 'A') }",
    })
    const kiss = fakeKiss()
    const first = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: silentLogger,
    })

    await new Promise((r) => setTimeout(r, 10))
    await site.touch(
      'helpers/index.js',
      "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('temporary', () => 'T'); throw new Error('half way') }",
    )
    await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: { ...silentLogger, error: vi.fn() },
      fresh: true,
      previous: first.registered,
    })
    expect(kiss.registered.a()).toBe('A')
    expect(kiss.registered.temporary).toBeUndefined()
  })

  // "The build continues without site helpers" was not true: the warn path
  // returned before the teardown, so the previous load's helpers stayed live
  // and kept rendering. Saying the site has no helpers while serving them is
  // the failure mode this branch exists to remove.
  it('actually drops the helpers when it says it is continuing without them', async () => {
    site = await makeSite({
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('a', () => 'A') }",
    })
    const kiss = fakeKiss()
    const first = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: silentLogger,
    })

    await new Promise((r) => setTimeout(r, 10))
    await site.touch(
      'helpers/index.js',
      'export const formatDate = (d) => String(d)',
    )
    const second = await loadSiteHelpers(`${site.root}/helpers`, {
      kiss,
      logger: { ...silentLogger, warn: vi.fn() },
      fresh: true,
      previous: first.registered,
      required: false,
    })
    expect(kiss.registered.a).toBeUndefined()
    expect(second.registered).toEqual([])
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
    expect(result.registered.map((h) => h.name)).toEqual(['mine'])
  })
})
