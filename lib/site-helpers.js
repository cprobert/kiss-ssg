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

    const before = new Set(Object.keys(registry))
    try {
      await register(kiss)
    } catch (error) {
      for (const [name, fn] of restore)
        if (fn !== undefined) kiss.handlebars.registerHelper(name, fn)
      throw error
    }
    const registered = Object.keys(registry).filter((n) => !before.has(n))
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
