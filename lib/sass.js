import { createRequire } from 'node:module'
import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

// ---------------------------------------------------------------------------
// Memoised compilation
// ---------------------------------------------------------------------------
//
// The `sass` Handlebars helper compiles at render time, so a stylesheet named
// by a partial is recompiled once per page that includes it — and it emits the
// same bytes every time. On a real consuming site (diploma-msc) the catalog
// stylesheet costs 76ms and is included by 111 course pages: 8.4 seconds of a
// production build spent producing 22KB of CSS it already had.
//
// The cache is keyed on the exact inputs to a compile, and validated against
// the mtime of every file sass reported loading — not just the entry, because
// a stylesheet's `@import`s are where the edits usually land. That makes it
// correct under `watch` without the module having to know a rebuild happened:
// touch any file in the graph and the entry recompiles.

/** @type {Map<string, {css: string, deps: Array<{file: string, mtimeMs: number}>}>} */
const compiled = new Map()

const mtimeOf = (file) => {
  try {
    return statSync(file).mtimeMs
  } catch {
    // Unreadable or gone: report a value that can never match a recorded one,
    // so the entry is treated as stale rather than served from a bad cache.
    return NaN
  }
}

// `loadedUrls` covers the entry and everything it imported, which is exactly
// the set whose edits should invalidate this entry.
const dependenciesOf = (result) =>
  (result.loadedUrls ?? [])
    .filter((u) => u.protocol === 'file:')
    .map((u) => {
      const file = fileURLToPath(u)
      return { file, mtimeMs: mtimeOf(file) }
    })

const isFresh = (entry) =>
  entry.deps.length > 0 &&
  entry.deps.every((d) => mtimeOf(d.file) === d.mtimeMs)

const memoise = (key, compile) => {
  const hit = compiled.get(key)
  if (hit && isFresh(hit)) return hit.css
  const result = compile()
  compiled.set(key, { css: result.css, deps: dependenciesOf(result) })
  return result.css
}

const keyFor = (subject, loadPaths, style) =>
  JSON.stringify([subject, loadPaths ?? [], style ?? null])

/**
 * Compiles a stylesheet file, reusing the previous result while neither it nor
 * anything it imports has changed.
 *
 * @param {string} target absolute path to the stylesheet
 * @param {{loadPaths?: string[], style?: string}} [options]
 * @returns {string} the compiled CSS
 */
export function compileFile(target, { loadPaths, style } = {}) {
  return memoise(keyFor(target, loadPaths, style), () =>
    loadSass().compile(target, { loadPaths, style }),
  )
}

/**
 * Compiles a stylesheet from source, reusing the previous result while nothing
 * it imports has changed. Inline blocks that import nothing are keyed on their
 * source alone, so an identical block rendered on many pages compiles once.
 *
 * @param {string} source the stylesheet source
 * @param {{loadPaths?: string[], style?: string}} [options]
 * @returns {string} the compiled CSS
 */
export function compileSource(source, { loadPaths, style } = {}) {
  const key = keyFor(source, loadPaths, style)
  const hit = compiled.get(key)
  // A block with no `@import` has no file dependencies, so `isFresh` (which
  // requires at least one) would never serve it. Its source *is* the key, so
  // nothing outside it can go stale: serve it whenever it was seen before.
  if (hit && (hit.deps.length === 0 || isFresh(hit))) return hit.css
  const result = loadSass().compileString(source, { loadPaths, style })
  compiled.set(key, { css: result.css, deps: dependenciesOf(result) })
  return result.css
}

/** Empties the compile cache. Exported for tests. */
export function clearSassCache() {
  compiled.clear()
}
