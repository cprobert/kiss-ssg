import fs from 'fs-extra'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

export function runController(options, controller, { logger }) {
  if (typeof controller !== 'function') {
    logger.error('Invalid controller - not a function')
    return options
  }
  try {
    return { ...options, ...controller(options) }
  } catch (err) {
    logger.error(`Error in controller for ${options.view}`)
    logger.warn(err)
    return options
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
    return null
  }
  let url = pathToFileURL(controllerPath).href
  if (fresh) {
    // Node caches ESM by URL and CommonJS by filename; bust both so an edited
    // controller reloads in watch mode. Unchanged files keep the same mtime
    // and therefore hit the cache.
    delete require.cache[require.resolve(controllerPath)]
    url += `?v=${fs.statSync(controllerPath).mtimeMs}`
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
        if (fn) options = runController(options, fn, { logger })
        break
      }
      case 'function':
        options = runController(options, controller, { logger })
        break
      default:
        logger.error('Unknown controller type: ', controller, typeof controller)
    }
  }
  if (!options.title && options.model && options.model.title) {
    options.title = options.model.title
  }
  return options
}
