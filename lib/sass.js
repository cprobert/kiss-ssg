import { createRequire } from 'node:module'

// Loaded on first compile, not at import — `sass` is the most expensive
// dependency in the tree (~270ms to import, more than the whole build of a
// 50-page site), and most sites never compile a stylesheet through it. It was
// previously a static `import`, which meant `assets.js` and
// `handlebars-helpers.js` dragged it into every process that touched Kiss:
// a production build with no `.scss` file, a `kiss-ssg check`, a
// sitemap-only run. Deferring it makes that cost proportional to use.
//
// `createRequire` rather than `await import()` because the `sass` Handlebars
// helper is synchronous — Handlebars has no async helper contract, so the
// binding has to be resolvable without a tick. `sass` ships CJS, so a require
// resolves it; resolution walks up from this file, so it finds the copy
// hoisted to a consuming project's root just as it finds a nested one.
const require = createRequire(import.meta.url)

/**
 * Picks the modern compiler API out of whatever shape the `sass` package
 * hands back.
 *
 * Sass releases before 1.45 put `compile`/`compileString` only on the default
 * export, so a module that reads the top level alone leaves `sass.compile`
 * undefined and every compile throws `TypeError: sass.compile is not a
 * function`. Current sass exposes both, _and_ warns that `default` is
 * deprecated the moment it is touched — so the named export has to be
 * preferred and `.default` reached for only when it is missing, or every build
 * on a modern sass prints that deprecation warning.
 *
 * Exported for its own test: the branch is one line of logic guarding a real
 * failure mode, and testing it directly beats simulating two package layouts.
 *
 * @param {any} mod the loaded `sass` module
 * @returns {any} the binding exposing `compile` and `compileString`
 */
export const pickModernApi = (mod) =>
  typeof mod?.compile === 'function' ? mod : mod?.default

let cached = null

/**
 * The `sass` binding, loaded once per process on first call.
 *
 * @returns {any} the modern sass API (`compile`, `compileString`, …)
 */
export function loadSass() {
  if (!cached) cached = pickModernApi(require('sass'))
  return cached
}

export default loadSass
