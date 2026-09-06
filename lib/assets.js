import path from 'node:path'
import fs from 'fs-extra'
import { loadSass } from './sass.js'
import {
  contentHash,
  createAssetManifest,
  hashedName,
  isHashable,
} from './asset-manifest.js'
import { globFiles, hashId, posixPath } from './utils.js'

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
      const { css } = loadSass().compile(sassFile, {
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

// Records what this copy put in the build, and applies the renaming half of
// the cache-busting policy. The manifest is keyed by the path a template
// writes — the name the file has when nothing is renaming it — so a `.scss`
// source is keyed by its compiled `.css` name and a template never has to know
// which policy is on.
async function recordEmitted(sourceDir, targetDir, { config, manifest }) {
  const root = posixPath(sourceDir)
  const target = posixPath(targetDir)
  const hash = !!config.assets?.hash
  // Manifest paths are relative to the build root, not to this copy's target:
  // an extra copyAssets() into a subfolder of the build emits URLs under that
  // subfolder, and a template asks for them by that URL.
  const build = posixPath(config.folders?.build || targetDir)
  const under = path.posix.relative(build, target)
  const prefix = under.startsWith('..') ? '' : under
  const onDisk = (buildRelative) =>
    path.posix.join(
      target,
      prefix ? buildRelative.slice(prefix.length + 1) : buildRelative,
    )

  for (const file of globFiles(root, '**/*')) {
    const relative = path.posix
      .relative(root, file)
      .replace(/\.(scss|sass)$/i, '.css')
    const plain = path.posix.join(target, relative)
    // One stat covers both a directory the glob returned and a sass file whose
    // compile failed: neither is a file in the build, so neither is emitted.
    const stat = await fs.stat(plain).catch(() => null)
    if (!stat?.isFile()) continue

    const name = prefix ? `${prefix}/${relative}` : relative
    let emittedName = name
    if (hash && isHashable(relative)) {
      // The emitted bytes, not the source: a stylesheet is hashed after sass
      // has compiled it, so the name changes exactly when the served file does.
      emittedName = hashedName(name, contentHash(await fs.readFile(plain)))
      await fs.move(plain, onDisk(emittedName), { overwrite: true })
    }
    const stale = manifest.record(name, emittedName)
    if (stale) await fs.remove(onDisk(stale))
  }
}

// Always resolves: generate() waits on this, and a rejected or forever-pending
// promise here would hang or crash the whole build.
export async function copyAssets(
  sourceDir,
  targetDir,
  { config, logger, manifest = createAssetManifest() },
) {
  const id = hashId(`${sourceDir} - ${targetDir}`)
  if (!sourceDir || !targetDir) return { id, data: null }
  if (config.assets?.hash && config.assets?.version)
    logger.warn(
      'config.assets: hash and version are both set; the hashed filename wins and version is ignored',
    )
  await Promise.all(compileSassFiles(sourceDir, targetDir, { config, logger }))
  try {
    await fs.copy(sourceDir, targetDir, { filter: (src) => !isSass(src) })
    await recordEmitted(sourceDir, targetDir, { config, manifest })
    const msg = `Copied assets: ${sourceDir} to ${targetDir}`
    logger.info(msg)
    return { id, data: msg }
  } catch (err) {
    logger.error(`Error copying assets (${sourceDir} => ${targetDir}): `)
    logger.error(err)
    return { id, data: null, error: err }
  }
}
