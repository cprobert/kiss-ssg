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

// Whether `target` is a file or a folder, for the hint a failed name carries
// when its sibling form exists.
const kindOf = (target) => {
  try {
    const stat = fs.statSync(target)
    return stat.isDirectory() ? 'folder' : stat.isFile() ? 'file' : null
  } catch {
    return null
  }
}

// The failed lookup returns `null` and says nothing: the caller throws, and
// `lib/page-registry.js` logs that message once.
export function readModelFile(modelsDir, file) {
  const modelPath = `${modelsDir}/${file}`
  if (fs.existsSync(modelPath))
    return JSON.parse(fs.readFileSync(modelPath, 'utf8'))
  return null
}

export function readModelsFromFolder(modelsDir, folder) {
  const folderPath = `${modelsDir}/${folder}`
  if (!fs.existsSync(folderPath) || !fs.lstatSync(folderPath).isDirectory())
    return []
  const root = posixPath(modelsDir)
  return globFiles(folderPath, '*.json')
    .map((file) => readModelFile(modelsDir, path.posix.relative(root, file)))
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
          // Redacted, like every message `fetchModel` builds. Not logged here:
          // the catch in `lib/page-registry.js` owns the line, so the context
          // is in the message. `.error` stays for the code that reads it.
          // The fetch's own messages already name the (redacted) URL; context
          // is added only where the cause lacks it.
          const shown = redactUrl(model)
          const message = String(error?.message ?? error)
          throw Object.assign(
            new Error(
              message.includes(shown)
                ? message
                : `Error getting model from ${shown}: ${message}`,
              { cause: error },
            ),
            { error },
          )
        }
      }
      const dir = String(modelsDir).replace(/\/+$/, '')
      if (model.endsWith('.json')) {
        const data = readModelFile(modelsDir, model)
        if (data) return { id: model, data }
        const bare = model.slice(0, -'.json'.length)
        const hint =
          kindOf(`${dir}/${bare}`) === 'folder'
            ? ` — ${dir}/${shownModel(bare)}/ is a folder: write model: '${shownModel(bare)}' to read the .json files in it`
            : ''
        throw new Error(`Model not found: ${shownModel(model)}${hint}`)
      }
      const data = readModelsFromFolder(modelsDir, model)
      if (data.length > 0) return { id: model, data }
      const hint =
        kindOf(`${dir}/${model}.json`) === 'file'
          ? ` — ${dir}/${shownModel(model)}.json exists: write model: '${shownModel(model)}.json' to read that file`
          : ''
      throw new Error(
        `Model folder empty or missing: ${shownModel(model)}${hint}`,
      )
    }
    case 'object':
      return { id: hashId(model), data: model }
    case 'undefined':
      return { data: {} }
    default:
      throw new Error(`Unexpected model type: ${typeof model}`)
  }
}
