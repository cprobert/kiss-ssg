import fs from 'fs-extra'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { posixPath } from './utils.js'

const require = createRequire(import.meta.url)

// The site's own Handlebars helpers, as distinct from the built-in ones in
// `handlebars-helpers.js`. kiss imports the folder's `index.js` and calls the
// function it exports, so a site never writes `registerHelpers(kiss)` in its
// build script — the convention is the configuration.
//
// Why this can be asynchronous at all: Handlebars resolves a helper from the
// registry at **render** time, not when a template is compiled, so a helper
// registered any time before `.generate()` renders is in place — in pages and
// inside partials alike. `llms.txt` claimed the opposite for a long time, and
// that claim is what made kiss-side loading look impossible, since the
// constructor is synchronous and `import()` is not.
const ENTRIES = ['index.js', 'index.mjs', 'index.cjs']

/**
 * The entry file kiss would load for a helpers folder, or `null` when the
 * folder has none — which is the ordinary case for a site with no custom
 * helpers and must stay silent.
 *
 * Posix-normalised, like every other path kiss hands out: `path.resolve`
 * returns native separators, and this one is compared against a watcher event
 * and reported in `_failures[].buildTo`. A backslash in either is a path that
 * matches nothing and a failure a consumer cannot grep for.
 *
 * @param {string|null|undefined} folder
 * @returns {string|null}
 */
export function helpersEntry(folder) {
  if (!folder) return null
  for (const name of ENTRIES) {
    const candidate = path.resolve(folder, name)
    if (fs.pathExistsSync(candidate)) return posixPath(candidate)
  }
  return null
}

/**
 * Whether a path a watcher reported is one of the helpers folder's entry
 * files. Both sides are resolved before they are compared, which is the whole
 * point: `resolveConfig` leaves `./helpers` **relative**, so chokidar watches
 * a relative path and emits relative events, while `helpersEntry` returns an
 * absolute one. Comparing them with separator normalisation alone made an edit
 * to the entry look like an edit to a sibling — in the *default*
 * configuration, which no test covered because every one of them named the
 * folder absolutely.
 *
 * It asks whether the path *could* be an entry rather than whether it is the
 * one precedence picks today, because a delete is answered with this too: with
 * `index.js` and `index.mjs` both present, deleting `index.js` leaves
 * `helpersEntry` pointing at `index.mjs`, and asking "is this the entry" would
 * classify the file that just vanished as a sibling.
 *
 * @param {string|null|undefined} folder `config.folders.helpers`
 * @param {string|null|undefined} file a path as the watcher reported it
 * @returns {boolean}
 */
export function isHelpersEntry(folder, file) {
  if (!folder || !file) return false
  const resolved = path.resolve(file)
  return ENTRIES.some((name) => path.resolve(folder, name) === resolved)
}

/**
 * Imports `<folders.helpers>/index.js` and calls its `registerHelpers` export
 * (or its default) with the `Kiss` instance.
 *
 * `fresh` busts both module caches the way `controller-resolver.js` does, so a
 * watch rebuild picks up an edited helper instead of re-running the copy Node
 * already holds. Re-registering an existing helper name is how Handlebars
 * replaces one, so an *edited* helper needs no teardown — but a *removed* one
 * does: the registry still holds it, and the registrar that would have put it
 * back is gone. `previous` is the list this call last returned as `registered`;
 * those names are cleared after the module imports and before the registrar
 * runs, so whatever the new source does not register stays gone. They are put
 * back if the registrar throws, since a half-registered site is worse than the
 * one it replaced.
 *
 * Resolves to a description of what happened rather than throwing: a helpers
 * folder that cannot be loaded is a build failure for the caller to record,
 * not an exception thrown through the constructor.
 *
 * `required` says whether the author named this folder or kiss guessed it, and
 * it changes one branch: an entry that exports **no registrar at all**. That is
 * the evidence the folder belongs to someone else — an upgrading site whose
 * root `helpers/` holds unrelated utilities — so a guessed folder warns and the
 * build carries on, while a folder the author pointed kiss at is a failure. A
 * folder that breaks rather than declining (an import that throws, a registrar
 * that throws) fails either way: that one is ours and broken, and shipping it
 * would lose every helper silently.
 *
 * @param {string|null|undefined} folder `config.folders.helpers`
 * @param {{ kiss: any, logger: any, fresh?: boolean, previous?: string[], required?: boolean }} deps
 * @returns {Promise<{ loaded: boolean, entry: string|null, registered?: string[], error?: Error }>}
 */
export async function loadSiteHelpers(
  folder,
  { kiss, logger, fresh = false, previous = [], required = true },
) {
  const entry = helpersEntry(folder)
  if (!entry) return { loaded: false, entry: null }

  let url = pathToFileURL(entry).href
  if (fresh) {
    try {
      // CommonJS is keyed by filename, ESM by URL: bust both, as an edited
      // helper module may be either.
      delete require.cache[require.resolve(entry)]
    } catch {
      // Not a CommonJS module, or never required — nothing to evict.
    }
    try {
      url += `?v=${fs.statSync(entry).mtimeMs}`
    } catch {
      logger.warn(`Could not reload helpers from disk: ${entry}`)
    }
  }

  try {
    const mod = await import(url)
    const register = mod.registerHelpers ?? mod.default
    if (typeof register !== 'function') {
      const message = `${entry} must export registerHelpers(kiss) (or a default function); got ${typeof register}`
      if (!required) {
        logger.warn(
          `${message} — kiss defaulted to this folder rather than being pointed at it, so the build continues without site helpers. Set folders.helpers to the folder that does hold them, or to null if this site has none.`,
        )
        return { loaded: false, entry }
      }
      const error = new Error(message)
      logger.error(error.message)
      return { loaded: false, entry, error }
    }
    // Cleared here rather than before the import: a module that fails to
    // import leaves the running site exactly as it was.
    const registry = kiss?.handlebars?.helpers ?? {}
    const restore = new Map(previous.map((name) => [name, registry[name]]))
    for (const name of restore.keys()) kiss.handlebars.unregisterHelper(name)

    // Compared by the registered FUNCTION, not merely by the name being new.
    // A site upgrading from before this feature still has its own
    // `registerHelpers(kiss)` call in the router, so the same registrar runs
    // twice — by hand first, then by kiss — and every name is already in the
    // registry by the time kiss's load runs. Measured against the real loader:
    // "names that were not there before" reports an empty list on that site,
    // which leaves the teardown above with nothing to tear down, on exactly
    // the sites most likely to need it. `registerHelper('x', () => …)` builds
    // a fresh closure per call, so the entry differs even when the name does
    // not. A registrar passing the same module-level function reference twice
    // is not detected, which is no worse than not comparing at all.
    const before = new Map(Object.entries(registry))
    try {
      await register(kiss)
    } catch (error) {
      for (const [name, fn] of restore)
        if (fn !== undefined) kiss.handlebars.registerHelper(name, fn)
      throw error
    }
    const registered = Object.keys(registry).filter(
      (n) => registry[n] !== before.get(n),
    )
    logger.info(`Registered site helpers: ${entry}`)
    return { loaded: true, entry, registered }
  } catch (error) {
    logger.error(`Could not register site helpers from ${entry}:`)
    logger.error(error)
    return {
      loaded: false,
      entry,
      error: /** @type {Error} */ (error),
    }
  }
}
