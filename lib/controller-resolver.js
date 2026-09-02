import fs from 'fs-extra'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

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

// import() caches per URL exactly as require() did: controllers do not
// hot-reload in watch mode. Accepts `export default fn` and legacy
// `module.exports = fn` (which import() surfaces as `.default`).
export async function loadController(controllersDir, file, { logger }) {
  const controllerPath = path.resolve(`${controllersDir}/${file}`)
  if (!fs.existsSync(controllerPath)) {
    logger.error(`Failed to find "controller: ${controllerPath}`)
    return null
  }
  const mod = await import(pathToFileURL(controllerPath).href)
  return mod.default ?? mod
}

export async function applyController(options, { controllersDir, logger }) {
  const { controller } = options
  if (controller) {
    switch (typeof controller) {
      case 'string': {
        const fn = await loadController(controllersDir, controller, { logger })
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
