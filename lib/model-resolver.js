import path from 'node:path'
import fs from 'fs-extra'
import { globFiles, hashId, posixPath } from './utils.js'

export function readModelFile(modelsDir, file, { logger }) {
  const modelPath = `${modelsDir}/${file}`
  if (fs.existsSync(modelPath))
    return JSON.parse(fs.readFileSync(modelPath, 'utf8'))
  logger.error('Can not find model on file system', modelPath)
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
  { modelsDir, logger, fetchImpl = globalThis.fetch },
) {
  switch (typeof model) {
    case 'string': {
      if (model.startsWith('http')) {
        try {
          const response = await fetchImpl(model)
          if (!response.ok)
            throw new Error(
              `Model fetch failed: ${model} → ${response.status} ${response.statusText}`,
            )
          return { id: model, data: await response.json() }
        } catch (error) {
          logger.error(`Error getting model from ${model}`)
          throw Object.assign(new Error(error.message), { error })
        }
      }
      if (model.endsWith('.json')) {
        const data = readModelFile(modelsDir, model, { logger })
        if (data) return { id: model, data }
        throw new Error(`Skipping: ${model}`)
      }
      const data = readModelsFromFolder(modelsDir, model, { logger })
      if (data.length > 0) return { id: model, data }
      throw new Error(`Invalid model ${model}`)
    }
    case 'object':
      return { id: hashId(model), data: model }
    case 'undefined':
      return { data: {} }
    default:
      throw new Error(`Unexpected model type: ${typeof model}`)
  }
}
