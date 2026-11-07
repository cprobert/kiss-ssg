import path from 'node:path'
import fs from 'fs-extra'
import { globFiles, hashId, isUrlModel, posixPath, redactUrl } from './utils.js'
import { fetchModel } from './fetch-policy.js'

// A model string as kiss prints it when it is not one it fetches. A file or a
// folder name is shown as written. Anything written as `scheme://…` is a URL
// with a scheme kiss does not fetch (`ftp://user:pass@host/data.json`), and is
// shown the way `redactUrl` shows any URL: no credentials, no query value.
const shownModel = (model) =>
  /^\s*[a-z][a-z0-9+.-]*:\/\//i.test(model) ? redactUrl(model) : model

export function readModelFile(modelsDir, file, { logger }) {
  const modelPath = `${modelsDir}/${file}`
  if (fs.existsSync(modelPath))
    return JSON.parse(fs.readFileSync(modelPath, 'utf8'))
  logger.error(
    'Can not find model on file system',
    `${modelsDir}/${shownModel(file)}`,
  )
  return null
}

export function readModelsFromFolder(modelsDir, folder, { logger }) {
  const folderPath = `${modelsDir}/${folder}`
  if (!fs.existsSync(folderPath) || !fs.lstatSync(folderPath).isDirectory())
    return []
  const root = posixPath(modelsDir)
  return globFiles(folderPath, '*.json')
    .map((file) =>
      readModelFile(modelsDir, path.posix.relative(root, file), { logger }),
    )
    .filter(Boolean)
}

export async function resolveModel(
  model,
  { modelsDir, logger, fetchImpl = globalThis.fetch, fetchConfig },
) {
  switch (typeof model) {
    case 'string': {
      if (isUrlModel(model)) {
        try {
          const data = await fetchModel(model, {
            ...fetchConfig,
            fetchImpl,
            logger,
          })
          return { id: model, data }
        } catch (error) {
          // Redacted, like every message `fetchModel` builds: the catch in
          // `lib/page-registry.js` prints this message and the attached error.
          logger.error(`Error getting model from ${redactUrl(model)}`)
          throw Object.assign(new Error(error.message), { error })
        }
      }
      if (model.endsWith('.json')) {
        const data = readModelFile(modelsDir, model, { logger })
        if (data) return { id: model, data }
        throw new Error(`Model not found: ${shownModel(model)}`)
      }
      const data = readModelsFromFolder(modelsDir, model, { logger })
      if (data.length > 0) return { id: model, data }
      throw new Error(`Model folder empty or missing: ${shownModel(model)}`)
    }
    case 'object':
      return { id: hashId(model), data: model }
    case 'undefined':
      return { data: {} }
    default:
      throw new Error(`Unexpected model type: ${typeof model}`)
  }
}
