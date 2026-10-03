// The staging folder and its promotion, under `cleanBuild: 'atomic'`.
//
// Every function takes the `Kiss` instance and reads its state at call time:
// state stays on the instance, and a call to another of its methods goes
// through `kiss._x()`, so a test that patches one on the instance is seen.
// The `fs` and `fsp` objects are the default imports on purpose — tests spy on
// their `rm`, `remove`, `move` and `rename`.
import fs from 'fs-extra'
import fsp from 'node:fs/promises'
import path from 'node:path'

// The errors Windows gives a rename when something holds a file open inside
// the folder, and the waits between the promotion's attempts at it: about a
// second and a half in all, which outlasts an antivirus or indexer blip and
// not a program that has the folder open. `null` marks the last attempt.
const LOCKED = new Set(['EPERM', 'EACCES', 'EBUSY'])
const PROMOTE_RETRY_MS = [100, 200, 400, 800, null]

/**
 * The staging and renamed-aside siblings of one build. One suffix for both,
 * so a leftover pair is recognisably one crashed run rather than two unrelated
 * ones; the pid in it is what `sweepStaleSiblings` tells a live build by.
 *
 * @param {string} target the build folder the author named
 * @returns {{ stagingDir: string, oldDir: string }}
 */
export function stagingSiblings(target) {
  const suffix = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  return {
    stagingDir: `${target}.kiss-staging-${suffix}`,
    oldDir: `${target}.kiss-old-${suffix}`,
  }
}

/**
 * The folder this build WRITES into: the staging sibling while one is active,
 * the author's folder otherwise.
 *
 * @param {any} kiss
 * @returns {string}
 */
export function writeRoot(kiss) {
  return kiss._stagingDir ?? kiss.config.folders.build
}

/**
 * `config` as a writer module (sitemap, llms, feed, redirects, robots) should
 * see it: `folders.build` is the write root. The same object as `config` when
 * nothing is staged, so the ordinary build allocates nothing.
 *
 * @param {any} kiss
 * @returns {any}
 */
export function writeConfig(kiss) {
  return kiss._stagingDir
    ? {
        ...kiss.config,
        folders: { ...kiss.config.folders, build: kiss._stagingDir },
      }
    : kiss.config
}

// A staging or renamed-aside sibling of the build folder that outlived the
// process that made it — a crashed or killed run. Removed here rather than
// left to accumulate beside published output: the suffix carries the pid, so
// one belonging to a live build (this process's own concurrent instance) is
// never a candidate.
/**
 * @param {any} kiss
 */
export function sweepStaleSiblings(kiss) {
  const target = path.resolve(kiss._buildTarget)
  const parent = path.dirname(target)
  const prefix = `${path.basename(target)}.kiss-`
  let stale
  try {
    stale = fs
      .readdirSync(parent)
      .filter(
        (name) =>
          (name.startsWith(`${prefix}staging-`) ||
            name.startsWith(`${prefix}old-`)) &&
          !name.startsWith(`${prefix}staging-${process.pid}-`) &&
          !name.startsWith(`${prefix}old-${process.pid}-`),
      )
  } catch {
    return // No parent folder yet, so nothing can be stale in it.
  }
  for (const name of stale) {
    try {
      fs.removeSync(path.join(parent, name))
    } catch (err) {
      kiss.logger.error(err.message)
    }
  }
  if (stale.length > 0)
    kiss.logger.notice(
      `Removed leftovers of an interrupted build: ${stale.join(', ')}`,
    )
}

// A copy the caller aimed at the real build folder has to follow the build
// into staging, or the promotion removes the very files it copied. Anything
// outside the build folder is left exactly where it was asked for.
/**
 * @param {any} kiss
 * @param {string} target
 * @returns {string}
 */
export function stagedPath(kiss, target) {
  if (!kiss._stagingDir || !target) return target
  const resolved = path.resolve(target)
  const root = path.resolve(kiss._buildTarget)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return target
  return path.join(kiss._stagingDir, path.relative(root, resolved))
}

// The staging folder is an implementation detail, so a failure names the
// page where the operator will look for it: in the build folder they asked
// for, not in a sibling with a random suffix that is about to be deleted.
/**
 * @param {any} kiss
 * @param {any} target
 * @returns {any}
 */
export function toReportedPath(kiss, target) {
  if (!kiss._stagingDir || typeof target !== 'string') return target
  return target.startsWith(`${kiss._stagingDir}/`)
    ? `${kiss._buildTarget}${target.slice(kiss._stagingDir.length)}`
    : target
}

// One rename of the promotion, through Node's own `fs/promises` rather than
// fs-extra. fs-extra's `rename` is graceful-fs's, which on Windows retries
// EPERM/EACCES/EBUSY for up to 60 s — so a preview server or an editor
// holding a file open in the build folder made the build sit silent for a
// minute and then fail with a bare EPERM (measured 2026-09-28: 60136 ms;
// AIKB/upstream.md). A lock that clears by itself (antivirus, an indexer)
// clears within a second or two, so this retries briefly and then says what
// is holding the folder instead of waiting out a lock that will not move.
/**
 * @param {string} from
 * @param {string} to
 * @param {string} folder the build folder the operator named, for the message
 */
export async function renameForPromote(from, to, folder) {
  for (const delay of PROMOTE_RETRY_MS) {
    try {
      return await fsp.rename(from, to)
    } catch (err) {
      if (!LOCKED.has(err.code)) throw err
      if (delay === null)
        throw Object.assign(
          new Error(
            `Could not replace ${folder}: a file in it is open in another program — a preview server such as VS Code's Live Server, an editor, or antivirus (${err.code}). Close it, or point it at another folder, and build again. Nothing was published; the previous output is unchanged.`,
          ),
          { code: err.code, cause: err },
        )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

// Puts the previous output back after a promotion that failed, or names
// where it is when even that fails: it is now the only copy of the site.
/**
 * @param {any} kiss
 * @param {string} old
 * @param {string} target
 */
export async function restorePrevious(kiss, old, target) {
  try {
    await kiss._renameForPromote(old, target, target)
    kiss._oldDir = null
  } catch (restoreErr) {
    // Kept: close() leaves it alone while the target is missing.
    kiss.logger.error(
      `Could not restore ${target} after a failed promotion (${restoreErr.message}); the previous output is in ${old}`,
    )
  }
}

// Swaps a staged build into place: the whole folder appears at once, and a
// build that never got here leaves the previous output untouched. Once, on
// the first complete() that settles without failures — the nested pattern
// has two calls draining the same build.
/**
 * @param {any} kiss
 */
export async function promote(kiss) {
  if (!kiss._stagingDir || kiss._buildSettled) return
  const staging = kiss._stagingDir
  const target = kiss._buildTarget
  kiss._buildSettled = true
  try {
    await kiss._swapIn(staging, target)
  } catch (err) {
    // A swap that failed will not be retried by this build, so the staged
    // copy is litter now — not at close(), which a one-shot build script
    // never calls. A lock on the published folder does not reach it.
    await kiss._abandonStaging(staging)
    throw err
  }
  // Kept on `_promotedFrom` for `_finishBuild`: the dependency graph's page
  // keys are the paths the pages were written to, which were staging paths.
  kiss._promotedFrom = staging
  kiss._outputs.relocate(staging, target)
  kiss._stagingDir = null
  // From here the instance is an ordinary one building into the real folder:
  // a watch rebuild, or a second build on this instance, must not write into
  // a staging folder nothing will ever swap in again.
  // `_writeRoot` follows `_stagingDir` back to the real folder; config never moved.
  for (const entry of kiss._stack) {
    entry.page.buildDir = target
    entry.buildTo = entry.page.buildTo
  }
  kiss.logger.success(target)
}

// The swap itself. Throws with the previous output back in place, or named
// in the log when even the restore failed.
/**
 * @param {any} kiss
 * @param {string} staging
 * @param {string} target
 */
export async function swapIn(kiss, staging, target) {
  const old = kiss._oldDir
  await fs.ensureDir(path.dirname(path.resolve(target)))
  // Rename aside rather than remove: the previous output is absent only
  // between two renames — metadata operations on one filesystem — instead of
  // for the whole of a recursive delete, and it can be put back if the
  // second one fails.
  const hadTarget = await fs.pathExists(target)
  if (hadTarget) await kiss._renameForPromote(target, old, target)
  try {
    await kiss._renameForPromote(staging, target, target)
  } catch (err) {
    // A staging sibling is normally on the target's own filesystem, but a
    // build folder that is a mount point or a symlink into one is not:
    // rename fails EXDEV there and only a copy-then-remove crosses it. Only
    // there: a lock is not a filesystem boundary, and copying under one
    // fails the same way after doing much more work.
    kiss.logger.debug(err.stack)
    if (err.code !== 'EXDEV') {
      if (hadTarget) await kiss._restorePrevious(old, target)
      throw err
    }
    try {
      await fs.move(staging, target, { overwrite: true })
      await fs.remove(staging)
    } catch (moveErr) {
      if (hadTarget) {
        // Whatever the failed move managed to write is in the way of the
        // restore, and it is a fragment of a build nothing will publish.
        await fs.remove(target).catch((e) => kiss.logger.debug(e.stack))
        await kiss._restorePrevious(old, target)
      }
      throw moveErr
    }
  }
  if (hadTarget) await fs.remove(old)
  kiss._oldDir = null
}

// A failed build promotes nothing and leaves nothing behind. `_stagingDir`
// is deliberately kept: a later write would recreate the folder, and
// close() is what removes it for good. The claims are cleared whether or not
// the folder went — they are this instance's bookkeeping, not the disk's,
// and a watch session that kept them would treat files nothing owns any more
// as owned.
/**
 * @param {any} kiss
 */
export async function discardStaging(kiss) {
  if (!kiss._stagingDir || kiss._buildSettled) return
  kiss._buildSettled = true
  await kiss._abandonStaging(kiss._stagingDir)
}

// The discard both unpromoted ends of a settled build share: a failed build,
// and a promotion whose swap failed.
/**
 * @param {any} kiss
 * @param {string} staging
 */
export async function abandonStaging(kiss, staging) {
  try {
    await kiss._removeStaging(staging, 'discarded')
  } finally {
    kiss._outputs.clearUnder(staging)
  }
}

// The one removal both ends of an unpromoted staged build share: a failed
// build's discard, and close() with nothing promoted. On Windows a removal
// can fail for a moment — an antivirus or indexer holding a file, a delete
// still pending — with EBUSY, ENOTEMPTY or EPERM, and fs.rm retries exactly
// those (maxRetries) without a mechanism of ours. A failure that outlasts the
// retries is said out loud rather than at debug level: the folder is a full
// copy of the site sitting beside the published one. It never throws — a
// leftover folder is not a build failure.
/**
 * @param {any} kiss
 * @param {string} staging
 * @param {string} which the adjective the warning uses for the folder
 */
export async function removeStaging(kiss, staging, which) {
  try {
    await fs.rm(staging, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    })
  } catch (err) {
    kiss.logger.warn(
      `Could not remove the ${which} staging folder ${staging} (${err.code ?? err.message}). Nothing was published from it — delete it by hand; the next build with cleanBuild: 'atomic' also sweeps leftover staging folders when it starts.`,
    )
    kiss.logger.debug(err.stack)
  }
}
