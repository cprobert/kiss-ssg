import path from 'node:path'
import fs from 'fs-extra'
import { compileFile } from './sass.js'
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
      const css = compileFile(sassFile, {
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
async function recordEmitted(
  sourceDir,
  targetDir,
  { config, manifest, logger },
) {
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

  // Two sources can arrive at one emitted name: `site.scss` compiles to
  // `site.css` and a sibling `site.css` is copied over the top of it, so the
  // plain file wins and every edit to the Sass silently does nothing. The
  // pages are correct and the asset is wrong, so page hashes cannot catch it
  // and `check` reports a clean build. It is exactly the on-disk shape of a
  // project migrating off a pipeline that committed its compiled CSS, which
  // is when nobody is looking. Keyed by emitted name, first writer wins the
  // slot, and the warning names both sources.
  /** @type {Map<string, string>} */
  const claimed = new Map()
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
    const source = path.posix.relative(root, file)
    const previous = claimed.get(name)
    if (previous) {
      // Direction is decided by `copyAssets`, not by glob order: the compile
      // runs first and `fs.copy` writes over the top of it, so a copied file
      // always beats a Sass compile. That precedence is deliberate and dates
      // from this module's first commit (`ca49564`) — a `.css` in the assets
      // folder is often generated (an `assets.pipeline` step, a CSS
      // toolchain), and an explicitly configured external tool must win over
      // kiss's built-in Sass, or kiss would silently clobber Tailwind's
      // output. So this is not "a collision happened": it is the rule working,
      // said out loud, because nothing else tells the author that one of the
      // two files they are maintaining has no effect.
      const [ignored, served] = isSass(source)
        ? [source, previous]
        : [previous, source]
      logger?.warn(
        `Two assets emit ${name}: ${ignored} compiles there, then ${served} is copied over it. A copied .css wins by design, so a generated stylesheet can override kiss's Sass — but it means edits to ${ignored} do nothing. Delete one if that is not deliberate.`,
      )
    } else claimed.set(name, source)
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
    await recordEmitted(sourceDir, targetDir, { config, manifest, logger })
    const msg = `Copied assets: ${sourceDir} to ${targetDir}`
    logger.info(msg)
    return { id, data: msg }
  } catch (err) {
    logger.error(`Error copying assets (${sourceDir} => ${targetDir}): `)
    logger.error(err)
    return { id, data: null, error: err }
  }
}
