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

// A leading underscore is THE Sass convention for "this is a partial, do not
// compile me standalone", and dart-sass itself never compiles one: a partial is
// meant to be `@use`d by an entry point that defines the variables it reads.
// Shared by the compile pass and the claim pass so the two cannot disagree
// about what was emitted — they did, and the claim pass then reported a
// collision for a compilation that never happened.
const isSassPartial = (file) => path.posix.basename(file).startsWith('_')

// Resolves to one `{ file, error? }` per stylesheet it tried, rather than to
// nothing. A syntax error used to be logged in red and then dropped: the build
// resolved, `report().ok` stayed true, `kiss-ssg check` said ok, and the site
// shipped with no stylesheet — while kiss's own documented bar tells an agent
// that ok and exit 0 are the only passing result. `file` is relative to the
// source folder, so the caller can name it the way an author would.
/**
 * @typedef {{ file: string, error?: Error, skipped?: boolean }} SassResult
 *
 * @param {string} sourceDir
 * @param {string} targetDir
 * @param {{ config: any, logger: any }} deps
 * @returns {Promise<SassResult>[]} one per stylesheet it saw — compiled,
 * failed, or skipped as a partial
 */
export function compileSassFiles(sourceDir, targetDir, { config, logger }) {
  const root = posixPath(sourceDir)
  const all = globFiles(root, '**/*.+(scss|sass)')
  const skipped = all.filter(isSassPartial)
  // Skipping partials is right; skipping them SILENTLY was not. `_vendor.scss`,
  // self-contained and imported by nothing, used to emit `_vendor.css` and then
  // emitted nothing at all, with zero mentions anywhere in the log — so a site
  // serving that file began serving a 404 after a clean build and nothing said
  // why. One `info` line names the set: one line, not one per file, because a
  // site with a dozen partials must not get a dozen lines every build.
  if (skipped.length)
    logger.info(
      `Skipped ${skipped.length} Sass partial${skipped.length === 1 ? '' : 's'} (a leading underscore means "do not compile standalone"): ${skipped
        .map((f) => path.posix.relative(root, f))
        .join(', ')}`,
    )
  return [
    ...skipped.map(async (f) => ({
      file: path.posix.relative(root, f),
      skipped: true,
    })),
    ...all
      .filter((f) => !isSassPartial(f))
      .map(async (sassFile) => {
        const file = path.posix.relative(root, sassFile)
        // Path arithmetic, not a string replace: an unanchored replace of `root`
        // misses entirely when the caller's folder string ends in a slash, and the
        // compiled CSS lands beside the build folder instead of inside it.
        const cssFile =
          path.posix.join(
            posixPath(targetDir),
            path.posix.relative(root, sassFile).replace(/\.[^.]+$/, ''),
          ) + '.css'
        // The compile and the write are separate obligations and fail for
        // separate reasons. Both used to be reported as `Error parsing sass
        // file`, so a stylesheet that parsed perfectly and could not be
        // written (a directory in the way, a read-only target, a full disk)
        // sent the author to look for a syntax error that was not there. The
        // real cause was on the `warn` line underneath, which is exactly the
        // line a reader skips once the red one has named a cause.
        let css
        try {
          css = compileFile(sassFile, {
            loadPaths: config.sass.includePaths,
            style: config.dev ? 'expanded' : 'compressed',
          })
        } catch (err) {
          logger.error('Error parsing sass file: ', sassFile)
          logger.warn(err.message)
          // Reported, not rethrown: one broken stylesheet must not stop the
          // other stylesheets or the copy, exactly as one failing page does
          // not stop the rest of the build.
          return { file, error: /** @type {Error} */ (err) }
        }
        try {
          await fs.outputFile(cssFile, css)
          logger.success(cssFile)
          return { file }
        } catch (err) {
          logger.error('Error writing compiled sass to: ', cssFile)
          logger.warn(err.message)
          // Reported, not rethrown: one broken stylesheet must not stop the other
          // stylesheets or the copy, exactly as one failing page does not stop the
          // rest of the build.
          return { file, error: /** @type {Error} */ (err) }
        }
      }),
  ]
}

// Records what this copy put in the build, and applies the renaming half of
// the cache-busting policy. The manifest is keyed by the path a template
// writes — the name the file has when nothing is renaming it — so a `.scss`
// source is keyed by its compiled `.css` name and a template never has to know
// which policy is on.
async function recordEmitted(
  sourceDir,
  targetDir,
  { config, manifest, logger, owner, protectedPaths },
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
  // is when nobody is looking.
  //
  // Claims are gathered in a pass of their own, before anything is renamed.
  // They used to be recorded inside the emit loop, which made the detector
  // dead under `assets.hash`: the first source's file is *moved* to its
  // hashed name, so the second source's `fs.stat` of the plain path found
  // nothing and `continue`d before any comparison — silent in the one
  // configuration a production site builds with.
  /** @type {Map<string, { relative: string, plain: string, sources: string[] }>} */
  const claimed = new Map()
  for (const file of globFiles(root, '**/*')) {
    // A partial is not compiled, so it never emits `_theme.css` — and claiming
    // it as a source for one made kiss warn that a legitimately served
    // `_theme.css` had overwritten a compile that never ran, telling the author
    // to delete a file their other entry point correctly consumes.
    if (isSass(file) && isSassPartial(file)) continue
    const relative = path.posix
      .relative(root, file)
      .replace(/\.(scss|sass)$/i, '.css')
    const plain = path.posix.join(target, relative)
    // One stat covers both a directory the glob returned and a sass file whose
    // compile failed: neither is a file in the build, so neither is emitted.
    const stat = await fs.stat(plain).catch(() => null)
    if (!stat?.isFile()) continue

    const name = prefix ? `${prefix}/${relative}` : relative
    const source = path.posix.relative(root, file)
    const entry = claimed.get(name)
    if (entry) entry.sources.push(source)
    else claimed.set(name, { relative, plain, sources: [source] })
  }

  const current = new Map()
  for (const [name, { relative, plain, sources }] of claimed) {
    let emittedName = name
    if (hash && isHashable(relative)) {
      // The emitted bytes, not the source: a stylesheet is hashed after sass
      // has compiled it, so the name changes exactly when the served file does.
      emittedName = hashedName(name, contentHash(await fs.readFile(plain)))
      await fs.move(plain, onDisk(emittedName), { overwrite: true })
    }
    for (const source of sources.slice(1)) {
      // Direction is decided by `copyAssets`, not by glob order: the compile
      // runs first and `fs.copy` writes over the top of it, so a copied file
      // always beats a Sass compile. That precedence is deliberate and dates
      // from this module's first commit (`ca49564`) — a `.css` in the assets
      // folder is often generated (an `assets.pipeline` step, a CSS
      // toolchain), and an explicitly configured external tool must win over
      // kiss's built-in Sass, or kiss would silently clobber Tailwind's
      // output. So this is not "a collision happened": it is the rule working,
      // said out loud, because nothing else tells the author that one of the
      // two files they are maintaining has no effect. Consequence first,
      // mechanism second: the reader needs "your edits are not reaching the
      // site" before they need the compile/copy order.
      //
      // Deliberately NOT suppressed when `config.assets.pipeline` is set,
      // though that was proposed on the reasoning that a pipeline site would
      // see this on every build. Measured, it does not: the warning needs two
      // sources at one emitted name, and a Tailwind-shaped pipeline writes
      // `site.css` with no `site.scss` to collide with, so nothing fires at
      // all. What a pipeline site *can* have is a leftover `site.scss` beside
      // the generated file — dead, silent, and exactly what this exists to
      // catch. Suppressing on `pipeline` would blind the one case it is for.
      const [ignored, served] = isSass(source)
        ? [source, sources[0]]
        : [sources[0], source]
      logger?.warn(
        `${ignored} compiles to ${name}, then ${served} is copied over it — so edits to ${ignored} are not reaching the site. A copied .css wins by design (that is how a pipeline stylesheet overrides kiss's Sass). Delete one if this is not deliberate.`,
      )
    }
    current.set(name, emittedName)
  }
  for (const stale of manifest.reconcile(owner, current)) {
    const file = onDisk(stale)
    if (protectedPaths.has(path.resolve(file))) continue
    // Only unlink a known file: never recursively remove an output directory.
    await fs.unlink(file).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

// Always resolves: generate() waits on this, and a rejected or forever-pending
// promise here would hang or crash the whole build.
export async function copyAssets(
  sourceDir,
  targetDir,
  {
    config,
    logger,
    manifest = createAssetManifest(),
    protectedPaths = new Set(),
    display = /** @type {{ source?: string, target?: string }} */ ({}),
  },
) {
  // What the author wrote, where they wrote it — the caller resolves the paths
  // it actually copies (a relative path must not be re-resolved against
  // whatever the working directory is when the queue drains), and resolving
  // for correctness must not turn every build's asset line into an absolute
  // path nobody typed. `id` rides on the same strings so it does not move
  // either.
  const shownSource = display.source ?? sourceDir
  const shownTarget = display.target ?? targetDir
  const id = hashId(`${shownSource} - ${shownTarget}`)
  if (!sourceDir || !targetDir) return { id, data: null }
  const owner = JSON.stringify([
    path.resolve(sourceDir),
    path.resolve(targetDir),
  ])
  if (config.assets?.hash && config.assets?.version)
    logger.warn(
      'config.assets: hash and version are both set; the hashed filename wins and version is ignored',
    )
  const sass = await Promise.all(
    compileSassFiles(sourceDir, targetDir, { config, logger }),
  )
  try {
    // A previously copied root can be deleted while watching. Treat that as
    // an empty inventory; a missing root on its first copy is still an error.
    if ((await fs.pathExists(sourceDir)) || !manifest.hasOwner(owner))
      await fs.copy(sourceDir, targetDir, { filter: (src) => !isSass(src) })
    await recordEmitted(sourceDir, targetDir, {
      config,
      manifest,
      logger,
      owner,
      protectedPaths,
    })
    const msg = `Copied assets: ${shownSource} to ${shownTarget}`
    logger.info(msg)
    return { id, data: msg, sass }
  } catch (err) {
    logger.error(`Error copying assets (${shownSource} => ${shownTarget}): `)
    logger.error(err)
    return { id, data: null, error: err, sass }
  }
}
