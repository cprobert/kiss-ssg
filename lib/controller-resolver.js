import fs from 'fs-extra'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

export function runController(options, controller, { logger }) {
  if (typeof controller !== 'function') {
    logger.error('Invalid controller - not a function')
    throw new Error('Invalid controller: not a function')
  }
  try {
    return { ...options, ...controller(options) }
  } catch (err) {
    // Rethrown, not swallowed: a page built from un-controlled options is
    // wrong output, and shipping it quietly is worse than failing the build.
    logger.error(`Error in controller for ${options.view}`)
    logger.warn(err)
    throw err
  }
}

// Accepts `export default fn` and legacy `module.exports = fn` (which import()
// surfaces as `.default`). `fresh` re-reads the file from disk (watch mode).
export async function loadController(
  controllersDir,
  file,
  { logger, fresh = false },
) {
  const controllerPath = path.resolve(`${controllersDir}/${file}`)
  if (!fs.existsSync(controllerPath)) {
    logger.error(`Failed to find "controller: ${controllerPath}`)
    throw new Error(`Failed to find controller: ${controllerPath}`)
  }
  let url = pathToFileURL(controllerPath).href
  if (fresh) {
    // Node caches ESM by URL and CommonJS by filename; bust both so an edited
    // controller reloads in watch mode. Unchanged files keep the same mtime
    // and therefore hit the cache. If the file went away between the check
    // above and here, fall back to the un-busted URL rather than throwing out
    // of applyController and dropping the page from this rebuild.
    try {
      delete require.cache[require.resolve(controllerPath)]
      url += `?v=${fs.statSync(controllerPath).mtimeMs}`
    } catch {
      logger.warn(`Could not reload controller from disk: ${controllerPath}`)
    }
  }
  const mod = await import(url)
  return mod.default ?? mod
}

export async function applyController(
  options,
  { controllersDir, logger, fresh = false },
) {
  const { controller } = options
  if (controller) {
    switch (typeof controller) {
      case 'string': {
        const fn = await loadController(controllersDir, controller, {
          logger,
          fresh,
        })
        // Unguarded: loadController either returns the export or throws, and
        // runController rejects an export that is not a function — a falsy one
        // included, which a truthiness guard here would drop silently.
        options = runController(options, fn, { logger })
        break
      }
      case 'function':
        options = runController(options, controller, { logger })
        break
      default:
        logger.error('Unknown controller type: ', controller, typeof controller)
        throw new Error(`Unknown controller type: ${typeof controller}`)
    }
  }
  // Returns a new object rather than assigning onto `options`: a caller that
  // reuses one options object across several pages (`.pages()` fan-out) would
  // otherwise carry the first item's title into all of them, since the guard
  // below only fills a title that is not already set.
  if (!options.title && options.model && options.model.title) {
    return { ...options, title: options.model.title }
  }
  return options
}
