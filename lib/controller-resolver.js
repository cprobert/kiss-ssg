import fs from 'fs-extra'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

/**
 * Fresh loads currently in flight, keyed by resolved controller path.
 *
 * Two `.page()` registrations naming the same CommonJS controller are replayed
 * concurrently on a watch rebuild. The second `fresh` load would delete
 * `require.cache[filename]` while the first `import()` is still translating the
 * CJS module, and Node's translator asserts that the entry it just populated is
 * still there — `ERR_INTERNAL_ASSERTION` out of `loadCJSModuleWithModuleLoad`,
 * failing both pages. Sharing the in-flight promise means the cache is busted
 * once per load, not once per registration. ESM controllers were never affected
 * (the ESM loader keys on the busted URL, so a second `import()` joins the first
 * job) but they share the entry too — one code path, no type sniffing.
 *
 * Only in-flight loads are shared: the entry is dropped when the promise
 * settles, so a later `fresh` call still re-reads the file, which is what watch
 * mode needs.
 *
 * @type {Map<string, Promise<unknown>>}
 */
const inFlightFreshLoads = new Map()

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
// surfaces as `.default`). `fresh` re-reads the file from disk (watch mode),
// deduped per path while in flight so two registrations naming one controller
// bust the caches once between them.
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
  const url = pathToFileURL(controllerPath).href
  if (!fresh) {
    const mod = await import(url)
    return mod.default ?? mod
  }
  // One fresh load per path at a time — see `inFlightFreshLoads` above.
  const pending = inFlightFreshLoads.get(controllerPath)
  if (pending) return pending
  const load = freshImport(controllerPath, url, { logger })
  inFlightFreshLoads.set(controllerPath, load)
  return load.finally(() => inFlightFreshLoads.delete(controllerPath))
}

/**
 * Busts both module caches and imports the controller. Only ever called
 * through `loadController`'s in-flight map, never concurrently for one path.
 *
 * @param {string} controllerPath resolved absolute path to the controller file
 * @param {string} url `controllerPath` as a `file:` URL
 * @param {{ logger: any }} deps
 * @returns {Promise<unknown>} the controller's export
 */
async function freshImport(controllerPath, url, { logger }) {
  // Node caches ESM by URL and CommonJS by filename; bust both so an edited
  // controller reloads in watch mode. Unchanged files keep the same mtime
  // and therefore hit the cache. If the file went away between the existence
  // check in loadController and here, fall back to the un-busted URL rather
  // than throwing out of applyController and dropping the page from this
  // rebuild.
  let bustedUrl = url
  try {
    delete require.cache[require.resolve(controllerPath)]
    bustedUrl += `?v=${fs.statSync(controllerPath).mtimeMs}`
  } catch {
    logger.warn(`Could not reload controller from disk: ${controllerPath}`)
  }
  const mod = await import(bustedUrl)
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
