import path from 'node:path'
import fs from 'fs-extra'
import * as sassModule from 'sass'
import { globFiles, hashId, posixPath } from './utils.js'

// Older sass releases (e.g. 1.52) expose the modern API only on the default
// export from ESM and newer ones export it by name (and deprecate `default`),
// so prefer the named export and fall back only when it is missing.
const sass =
  typeof sassModule.compile === 'function' ? sassModule : sassModule.default

const isSass = (file) => /\.(scss|sass)$/i.test(file)

export function compileSassFiles(sourceDir, targetDir, { config, logger }) {
  const root = posixPath(sourceDir)
  return globFiles(root, '**/*.+(scss|sass)').map(async (sassFile) => {
    // Path arithmetic, not a string replace: an unanchored replace of `root`
    // misses entirely when the caller's folder string ends in a slash, and the
    // compiled CSS lands beside the build folder instead of inside it.
    const cssFile =
      path.posix.join(
        posixPath(targetDir),
        path.posix.relative(root, sassFile).replace(/\.[^.]+$/, ''),
      ) + '.css'
    try {
      const { css } = sass.compile(sassFile, {
        loadPaths: config.sass.includePaths,
        style: config.dev ? 'expanded' : 'compressed',
      })
      await fs.outputFile(cssFile, css)
      logger.success(cssFile)
    } catch (err) {
      logger.error('Error parsing sass file: ', sassFile)
      logger.warn(err.message)
    }
  })
}

// Always resolves: generate() waits on this, and a rejected or forever-pending
// promise here would hang or crash the whole build.
export async function copyAssets(sourceDir, targetDir, { config, logger }) {
  const id = hashId(`${sourceDir} - ${targetDir}`)
  if (!sourceDir || !targetDir) return { id, data: null }
  await Promise.all(compileSassFiles(sourceDir, targetDir, { config, logger }))
  try {
    await fs.copy(sourceDir, targetDir, { filter: (src) => !isSass(src) })
    const msg = `Copied assets: ${sourceDir} to ${targetDir}`
    logger.info(msg)
    return { id, data: msg }
  } catch (err) {
    logger.error(`Error copying assets (${sourceDir} => ${targetDir}): `)
    logger.error(err)
    return { id, data: null, error: err }
  }
}
