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
import { reportedPath } from './build-report.js'
import { escapeRegExp } from './utils.js'

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

// Whether a process with this pid exists: signal 0 delivers nothing. ESRCH is
// "no such process"; EPERM is a live one owned by another user.
/**
 * @param {number} pid
 * @returns {boolean}
 */
function isRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

// A staging or renamed-aside sibling of the build folder that outlived the
// process that made it — a crashed or killed run. Removed here rather than
// left to accumulate beside published output: the suffix carries the pid, so
// one belonging to a live build (this process's own concurrent instance, or
// another process still running) is never a candidate. A name whose pid cannot
// be read is stale.
/**
 * @param {any} kiss
 */
export function sweepStaleSiblings(kiss) {
  const target = path.resolve(kiss._buildTarget)
  const parent = path.dirname(target)
  const prefix = `${path.basename(target)}.kiss-`
  let stale
  /** @type {{ name: string, pid: number }[]} */
  const running = []
  try {
    stale = fs
      .readdirSync(parent)
      .filter(
        (name) =>
          name.startsWith(`${prefix}staging-`) ||
          name.startsWith(`${prefix}old-`),
      )
      .filter((name) => {
        const pid = Number(
          name.slice(prefix.length).match(/^(?:staging|old)-(\d+)-/)?.[1],
        )
        if (!Number.isInteger(pid) || pid <= 0) return true
        if (pid !== process.pid && !isRunning(pid)) return true
        if (pid !== process.pid) running.push({ name, pid })
        return false
      })
  } catch {
    return // No parent folder yet, so nothing can be stale in it.
  }
  // Liveness is all that is known: the pid may since have been given to an
  // unrelated process, so the line claims no more than that.
  for (const { name, pid } of running)
    kiss.logger.info(
      `Left ${name}: a process is running with pid ${pid}, the one this folder was named for, so it may be a build in progress. Delete the folder if no build of this site is running.`,
    )
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
  // "Inside the build folder" is decided where a path points, as
  // `reportedPath` decides it: `path.relative` reads a Windows path in any
  // case, as Windows does, where a text prefix would not.
  const rel = path.relative(
    path.resolve(kiss._buildTarget),
    path.resolve(target),
  )
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
    return target
  return path.join(kiss._stagingDir, rel)
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
  // One rule for the report and the messages, so the two never name a file
  // differently (`lib/build-report.js` `reportedPath`).
  if (!kiss._stagingDir || typeof target !== 'string') return target
  return reportedPath(target, kiss._buildTarget, kiss._stagingDir)
}

/**
 * A log message with every file under the staging folder written as the
 * report writes it: each path is found in any spelling a writer can produce
 * (as `stagingSiblings` made it, `./docs.kiss-staging-…`; as `path.join`
 * writes it, `docs.kiss-staging-…`; absolute) and handed to `reportedPath`,
 * the one rule for a staged path, so the log and the report name a file the
 * same way (`./docs/x/y.html`). `\` is a separator only where it is one:
 * elsewhere it is a legal character in a file name, as `reportedPath` holds.
 * The folder named on its own is left alone, with or without a trailing
 * separator: a message about the staging folder itself ("could not remove …,
 * delete it by hand") has to name it. A match starts only where a path can
 * start, never partway through a longer one (`/elsewhere/docs.kiss-staging-…`),
 * and on Windows a path in another case is the same path.
 *
 * @param {string} text
 * @param {string} stagingDir
 * @param {string} buildDir
 * @returns {string}
 */
export function unstageText(text, stagingDir, buildDir) {
  return text.replace(stagedPathPattern(stagingDir), (staged) =>
    String(reportedPath(staged, buildDir, stagingDir)),
  )
}

/** @type {{ stagingDir: string, pattern: RegExp }|null} */
let lastPattern = null

/**
 * The pattern for a path under one staging folder, built once per folder: a
 * staged build logs every file it writes, and the folder does not change.
 * One slot, not a map: each build's folder has a new random suffix, so a map
 * would keep a pattern per build for the life of the process.
 *
 * @param {string} stagingDir
 * @returns {RegExp}
 */
function stagedPathPattern(stagingDir) {
  if (lastPattern?.stagingDir === stagingDir) return lastPattern.pattern
  const windows = path.sep === '\\'
  const spellings = [
    ...new Set(
      [
        path.resolve(stagingDir),
        stagingDir,
        path.normalize(stagingDir),
        // `./docs.kiss-staging-…` for a folder configured as `docs`: a writer
        // that logs `./<path>` (fourth review, 2026-11-08).
        ...(path.isAbsolute(stagingDir)
          ? []
          : [`.${path.sep}${path.normalize(stagingDir)}`]),
      ].flatMap((s) => (windows ? [s, s.replaceAll('\\', '/')] : [s])),
    ),
  ]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
  // Not after a character a path continues with; then one of the folder's
  // spellings, a separator, and at least one character a name can start
  // with, so `…staging/,` is the folder in a sentence, not a file.
  const pattern = new RegExp(
    String.raw`(?<![\w.~\\/-])(?:${spellings.join('|')})${windows ? String.raw`[\\/]` : '/'}(?=[^\s'"\`<>,;:)\]\\/])[^\s'"\`<>]*`,
    windows ? 'gi' : 'g',
  )
  lastPattern = { stagingDir, pattern }
  return pattern
}

/**
 * The logger a build writes through: the site's own, with the strings its
 * `success` and `info` lines are handed passed through `unstageText` while a
 * staging folder is active. Those are the "wrote this file" channels: each
 * writer logs the file it wrote (`sitemap.xml`, `_redirects`, the consent
 * files…), and under staging that is a folder with a random suffix that is
 * about to be renamed or deleted. Mapped here once, so a writer added later
 * cannot reintroduce it. `warn`, `error` and `debug` are left as they are:
 * they carry diagnostics (an `err.stack`, a file the staging folder could not
 * remove) whose real path is the one to act on.
 *
 * @template {object} L
 * @param {L} logger
 * @param {any} kiss
 * @returns {L}
 */
export function stagingLogger(logger, kiss) {
  /** @type {Map<string|symbol, { source: Function, fn: Function }>} */
  const bound = new Map()
  // The Proxy stands over the logger itself, so it is the logger in every
  // other respect: its keys, its class, and a spy or override defined on it
  // (fourth review, 2026-11-08; over an empty object, all three were lost).
  const handler = {
    /**
     * @param {any} target
     * @param {string|symbol} key
     */
    get(target, key) {
      const value = Reflect.get(target, key)
      if (typeof value !== 'function') return value
      // A Proxy must return a read-only, non-configurable property as it is,
      // so a frozen logger's methods pass through unmapped and unbound.
      const own = Reflect.getOwnPropertyDescriptor(target, key)
      if (own && !own.configurable && !own.writable) return value
      // Every method runs on the site's own logger, never on the Proxy: a
      // logger class whose methods read private fields (`this.#out`) throws
      // when called with the Proxy as `this`. One function per method while
      // the method is the same one, so `logger.warn === logger.warn` holds
      // and a spy installed later is still reached.
      const known = bound.get(key)
      if (known?.source === value) return known.fn
      const fn = WROTE.has(key)
        ? (/** @type {any[]} */ ...args) =>
            value.apply(
              target,
              kiss._stagingDir && kiss._buildTarget
                ? args.map((arg) =>
                    typeof arg === 'string'
                      ? unstageText(arg, kiss._stagingDir, kiss._buildTarget)
                      : arg,
                  )
                : args,
            )
        : value.bind(target)
      bound.set(key, { source: value, fn })
      return fn
    },
  }
  return /** @type {L} */ (new Proxy(/** @type {any} */ (logger), handler))
}

// The logger methods a writer reports a written file through.
/** @type {Set<string|symbol>} */
const WROTE = new Set(['success', 'info'])

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
