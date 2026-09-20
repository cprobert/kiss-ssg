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

// Whether the entry's source so much as MENTIONS `registerHelpers`. A loose
// gate, on purpose, and the looseness is the design rather than a shortcut.
//
// It answers one question — could this folder be kiss's? — for the one case
// where the real answer is unavailable: a module that fails to import has no
// exports to read, so an import failure in a guessed folder could otherwise
// only be downgraded to a warning, and a genuine registrar with a syntax
// error then warned and let the build continue with no helpers, exit 0.
//
// It deliberately does NOT try to decide whether a real registrar is exported.
// A previous version matched export FORMS, and ordinary JavaScript fell
// outside them — `export /* comment */ function registerHelpers`, a
// multi-declarator `export const version = 1, registerHelpers = …`, a
// `export * from './register.js'` barrel — so valid helpers silently did not
// exist, and a reload UNREGISTERED a registrar that had been working. A false
// negative that produces silently wrong output is worse than the false
// positive it replaced, which at least failed loudly. Whether the export is
// really there is decided after the import, by looking at the module.
//
// What this still buys: a folder that never mentions the name is never
// imported, so the ordinary unrelated utility — a formatter, a client factory,
// a `connect()` — is not executed by a kiss that merely guessed at its folder.
// A module that mentions the name in a comment and fails to import is treated
// as kiss's and fails the build; that is the safe direction, and the likely
// version of it is an author who commented their own registrar out.
// A re-export barrel is the one shape that cannot be answered by reading this
// file at all: `export * from './register.js'` never names what it re-exports.
// So `export *` counts as a mention — it is a statement that the answer is in
// another file, and following it is what importing does.
const MIGHT_BE_OURS = [/\bregisterHelpers\b/, /\bexport\s*\*/]

function mentionsRegistrar(entry) {
  try {
    const source = fs.readFileSync(entry, 'utf8')
    return MIGHT_BE_OURS.some((pattern) => pattern.test(source))
  } catch {
    return false
  }
}

/**
 * Whether a watch event on this path should take the **entry reload** path.
 *
 * Narrower than `isHelpersEntry`, and the two are deliberately different
 * questions. A reload busts the *selected* entry's URL and nothing else, so
 * editing `index.mjs` while `index.js` is selected must not take the reload
 * path: the edit would not be picked up, the site would rebuild with stale
 * helpers, and the restart notice that names the problem would not fire.
 *
 * A **deleted** candidate is the exception, and is why `isHelpersEntry` exists
 * separately: removing `index.js` changes which file is the entry — to
 * `index.mjs`, or to none at all — so it reloads even though it is not the
 * selection at the moment the question is asked.
 *
 * @param {string|null|undefined} folder `config.folders.helpers`
 * @param {string|null|undefined} file a path as the watcher reported it
 * @returns {boolean}
 */
export function isActiveHelpersEntry(folder, file) {
  if (!isHelpersEntry(folder, file)) return false
  const resolved = path.resolve(/** @type {string} */ (file))
  if (!fs.pathExistsSync(resolved)) return true
  return helpersEntry(folder) === posixPath(resolved)
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
 * back is gone. `previous` is the list this call last returned as `registered`
 * — `{ name, prior }` pairs, not bare names, because a registrar may have
 * *overridden* something rather than added it. Those entries are undone after
 * the module imports and before the registrar runs: a name with a `prior` is
 * restored to it, a name without one is unregistered. Recording only the name
 * meant an overridden kiss built-in was destroyed when the site stopped
 * overriding it — silently, since an argument-less mustache renders empty
 * rather than throwing. They are put back if the registrar throws, since a
 * half-registered site is worse than the one it replaced.
 *
 * Resolves to a description of what happened rather than throwing: a helpers
 * folder that cannot be loaded is a build failure for the caller to record,
 * not an exception thrown through the constructor.
 *
 * `required` says whether the author named this folder or kiss guessed it, and
 * it decides **how much evidence kiss needs before running a stranger's code**.
 *
 * Named by the author: `registerHelpers`, or a default export, and anything
 * that goes wrong is a build failure. They pointed kiss here.
 *
 * Guessed: only the **named** `registerHelpers` export is trusted, because that
 * name is the opt-in and a default export is the ordinary shape of every module
 * ever written. `registerHelpers ?? default` used to call any default-exported
 * function with the kiss instance, so an unrelated utility barrel in a root
 * `helpers/` — a formatter, a client factory, a `connect()` — was invoked and
 * its throw killed the build of a site that had never heard of this
 * convention. Measured on four entry shapes. kiss now does not call it at all:
 * a side effect is as bad as an exception, and a catch cannot undo one. An
 * import that throws is the same judgement — a browser-utility barrel touching
 * `window` at the top level is fine in a bundle and throws in Node, and tells
 * us nothing about whose folder this is — so a guessed folder warns and carries
 * on.
 *
 * What does **not** soften: a module that exports `registerHelpers` by name is
 * unambiguously kiss's, whoever chose the folder, so a throw from it is a build
 * failure either way. A broken registrar on a green build renders every
 * `{{helper}}` as nothing, which is the failure this module exists to prevent.
 *
 * @param {string|null|undefined} folder `config.folders.helpers`
 * @typedef {{ name: string, prior: import('handlebars').HelperDelegate|undefined }} OwnedHelper
 *
 * @param {{ kiss: any, logger: any, fresh?: boolean, previous?: OwnedHelper[], required?: boolean, builtins?: string[] }} deps
 * @returns {Promise<{ loaded: boolean, entry: string|null, registered?: OwnedHelper[], error?: Error }>}
 */
export async function loadSiteHelpers(
  folder,
  {
    kiss,
    logger,
    fresh = false,
    previous = [],
    required = true,
    builtins = [],
  },
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

  // Built before the import, because the decline path below has to undo the
  // previous load's registrations too.
  const registry = kiss?.handlebars?.helpers ?? {}
  const restore = new Map(previous.map(({ name }) => [name, registry[name]]))
  const dropPrevious = () => {
    for (const { name, prior } of previous) {
      if (prior === undefined) kiss.handlebars.unregisterHelper(name)
      else kiss.handlebars.registerHelper(name, prior)
    }
  }

  // The gate, applied to the source before anything runs.
  if (!required && !mentionsRegistrar(entry)) {
    dropPrevious()
    logger.warn(
      `${entry} never mentions registerHelpers — kiss defaulted to this folder rather than being pointed at it, so it was not imported and the build continues without site helpers. Set folders.helpers to the folder that does hold them, or to null if this site has none.`,
    )
    return { loaded: false, entry, registered: [] }
  }

  try {
    // Past this point the folder is kiss's — named by the author, or declaring
    // the export — so an import failure is a build failure, not a decline.
    const mod = await import(url)
    // A default export counts only when the author named the folder.
    const register = required
      ? (mod.registerHelpers ?? mod.default)
      : mod.registerHelpers
    if (typeof register !== 'function') {
      // The teardown happens on this path too. It used to return above it, so
      // "the build continues without site helpers" was false: the previous
      // load's helpers stayed registered and kept rendering. Saying a site has
      // no helpers while still serving them is the failure this module exists
      // to remove. `registered: []` tells the caller it now owns nothing.
      dropPrevious()
      const message = `${entry} must export registerHelpers(kiss) (or a default function); got ${typeof register}`
      if (!required) {
        logger.warn(
          `${entry} exports no registerHelpers function — kiss defaulted to this folder rather than being pointed at it, so the build continues without site helpers. A default export is not enough when kiss guessed the folder: name the export registerHelpers, or set folders.helpers to the folder that does hold them, or to null if this site has none.`,
        )
        return { loaded: false, entry, registered: [] }
      }
      const error = new Error(message)
      logger.error(error.message)
      return { loaded: false, entry, registered: [], error }
    }
    dropPrevious()

    // What the registrar registers is OBSERVED, not inferred from a diff of
    // the registry across the call. A diff cannot see a registrar that
    // re-registers the identical function reference — a site that hoists its
    // helpers to module scope and runs the registrar twice — so nothing was
    // owned and teardown had nothing to undo, on exactly the upgrading sites
    // that run it twice. Wrapping the one method answers exactly, whatever
    // the value, and it is restored before anything else can see it.
    const before = new Map(Object.entries(registry))
    const seen = new Set()
    const realRegisterHelper = kiss.handlebars.registerHelper
    kiss.handlebars.registerHelper = function (name, fn) {
      // Handlebars takes (name, fn) or an object of many.
      if (name && typeof name === 'object')
        Object.keys(name).forEach((n) => seen.add(n))
      else seen.add(name)
      return realRegisterHelper.call(this, name, fn)
    }
    try {
      await register(kiss)
    } catch (error) {
      // Undo the whole attempt, not just the part that removed the old names.
      // A registrar that registers `temporary` and then throws used to leave
      // it behind — and a failed load reports no `registered` list, so the
      // caller's ownership list never learned about it and nothing would ever
      // remove it: not a later success, not a delete.
      for (const name of Object.keys(registry))
        if (!before.has(name)) kiss.handlebars.unregisterHelper(name)
      for (const [name, fn] of before)
        if (registry[name] !== fn) kiss.handlebars.registerHelper(name, fn)
      for (const [name, fn] of restore)
        if (fn !== undefined) kiss.handlebars.registerHelper(name, fn)
      throw error
    } finally {
      kiss.handlebars.registerHelper = realRegisterHelper
    }
    const registered = [...seen].map((name) => ({
      name,
      prior: before.get(name),
    }))

    // Every site written before `folders.helpers` existed still calls the
    // registrar from its router, because the old docs said to — so it runs
    // twice, and nothing said so. Harmless since the teardown stopped
    // depending on a diff, but an author has no way to learn their call is
    // now redundant.
    //
    // What this can actually observe is a name that was already there, not a
    // second invocation — so it is deliberately narrow. A kiss built-in the
    // registrar overrides is excluded, and so is any run where only SOME of
    // what it registered was already present: that is a site deliberately
    // overriding one helper from another collection, not a re-run. Only a
    // registrar whose every name was already registered looks like one, and
    // even then the wording suggests rather than instructs, because the call
    // it is describing is one kiss cannot see.
    const builtin = new Set(builtins)
    const alreadyThere = registered
      .filter(({ name, prior }) => prior !== undefined && !builtin.has(name))
      .map(({ name }) => name)
    const everyNameWasThere =
      registered.length > 0 && alreadyThere.length === registered.length
    if (everyNameWasThere && !fresh)
      logger.notice(
        `${alreadyThere.join(', ')} was already registered before kiss loaded ${entry}. kiss calls registerHelpers itself, so if your build script also calls it, that line is now redundant and the registrar runs twice.`,
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
