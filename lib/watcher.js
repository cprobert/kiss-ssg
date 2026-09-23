import { createRequire } from 'node:module'
import { statSync } from 'node:fs'
import nodePath from 'node:path'

import { posixPath as posix, isInside } from './utils.js'

// Required on the first watch, not at import: `lib/kiss.js` imports this
// module for the branch it takes only under `dev`, so a
// one-shot build was loading chokidar to never call it. Synchronous `require`
// keeps `createWatcher` synchronous, which `Kiss.watch()` needs — it is
// chainable public API and returns `this`, not a promise.
const require = createRequire(import.meta.url)

// chokidar v4 removed glob support: `ignored` takes a path, a regex or a
// predicate, and a `'src/assets/**'` string silently matches nothing — the
// assets tree then reaches the page watcher and every asset save triggers a
// whole-site rebuild. A predicate says the same thing and cannot rot that way.
// Both sides are RESOLVED, not merely separator-normalised. This is the same
// seam that made the helpers entry unreachable: a site may give one of these
// folders relative and another absolute, and chokidar reports an event in the
// form of the path it was given to watch. Comparing `./src/assets` against an
// absolute event never matched, so a helpers folder inside `src` failed its
// exclusion and got both dispatches — a whole-site replay racing the reload,
// over one registry.
// Wait for a file's size to stop changing before reacting: editors and
// fs.writeFile can produce several notifications per save, and reacting to
// the first one can rebuild from a half-written file.
//
// The threshold is the whole of the dev loop's felt latency. It is pure idle —
// chokidar sits on the event until the size has held still this long — so it
// showed up in the benchmark as a re-render cost of ~108ms that was identical
// at 50 and 500 pages, and identical on a machine 25% slower. A flat number
// that ignores both page count and CPU speed is a timer, not work.
//
// 30ms is still a wide margin, because the threshold only has to outlast the
// *gap between successive writes*, not the write itself: while a file is still
// growing its size keeps changing, so the wait keeps extending. What it has to
// cover is a truncate-then-write (vim, and anything that does not write
// atomically), where the file is briefly empty between two syscalls — that gap
// is sub-millisecond on a local filesystem. The sources being watched are
// templates, models and controllers: small text files, written in one go.
const WRITE_SETTLE = {
  awaitWriteFinish: { stabilityThreshold: 30, pollInterval: 10 },
}

// An empty file may be a truncate-then-write save or intentional content.
// Give it a little longer to settle, then deliver it even if it remains empty.
const isEmptyFileEvent = (event, p) => {
  if (event !== 'add' && event !== 'change') return false
  try {
    return statSync(p).size === 0
  } catch {
    // Gone between the event and the stat: let Kiss see it and decide.
    return false
  }
}

// `entry` is the script that configured Kiss (process.argv[1] by default —
// module.parent.filename does not exist under ESM); a change to it rebuilds
// everything because the page list itself may have changed.
export function createWatcher({
  config,
  entry = process.argv[1],
  rebuildSite,
  onChange,
  assetsChanged,
  helpersChanged,
  logger,
}) {
  const chokidar = require('chokidar')
  const watchers = []
  const timers = new Map()
  let closed = false
  // Empty saves get a bounded grace period, never permanent suppression.
  // Preserve an add through a following change so discovery still happens.
  const settled = (callback) => (event, p) => {
    if (closed) return
    const key = `${callback.name}:${nodePath.resolve(p)}`
    const pending = timers.get(key)
    if (pending) {
      clearTimeout(pending.timer)
      timers.delete(key)
      if (pending.event === 'add' && event === 'unlink') return
      if (pending.event === 'add' && event === 'change') event = 'add'
    }
    if (!isEmptyFileEvent(event, p)) return callback(event, posix(p))
    const timer = setTimeout(() => {
      timers.delete(key)
      callback(event, posix(p))
    }, 200)
    timers.set(key, { timer, event })
  }
  logger.notice('Watching for file changes', config.folders.src)

  if (entry) {
    watchers.push(
      chokidar
        .watch(entry, WRITE_SETTLE)
        .on('change', (p) => {
          logger.notice(`Changed: ${p}: `)
          rebuildSite()
        })
        .on('error', (/** @type {any} */ err) =>
          logger.error('Watcher error', err.message),
        ),
    )
  }

  // The site's own helpers sit beside the build script, outside `src`, so no
  // other watcher sees them. They get one of their own because kiss can now
  // re-import and re-register them: an edit takes effect, where a `src` event
  // could only ever have triggered a replay that ran the cached module.
  //
  // Watched whether or not the folder is there yet. Requiring it to exist at
  // `watch()` time meant that creating a first `helpers/index.js` mid-session
  // got no watcher, no rebuild and no notice — and the restart notice that
  // would otherwise have covered it is deliberately suppressed for this
  // folder. The same three events as the `src` watcher, for the same reasons:
  // a create is how the folder arrives, a delete is how it leaves, and
  // chokidar's initial-scan `add`s are not authoring events.
  const helpersDir = config.folders.helpers
  const notifyHelpers = settled(function helpers(event, p) {
    logger.notice(`Changed: ${p}: `)
    helpersChanged(p)
  })
  if (helpersChanged && helpersDir) {
    let helpersScanned = false
    watchers.push(
      chokidar
        .watch(helpersDir, WRITE_SETTLE)
        .on('ready', () => {
          helpersScanned = true
        })
        .on('all', (event, p) => {
          if (event !== 'add' && event !== 'change' && event !== 'unlink')
            return
          if (!helpersScanned && event === 'add') return
          notifyHelpers(event, p)
        })
        .on('error', (/** @type {any} */ err) =>
          logger.error('Watcher error', err.message),
        ),
    )
  }

  const assetsDir = config.folders.assets
  // Both folders that have a watcher of their own are excluded here, for the
  // same reason: a site may point either of them inside `src`, and a second
  // dispatch for one file is not a harmless duplicate. The helpers case was
  // dispatched twice — a whole-site replay that cannot pick a module edit up,
  // racing the reload that can, over one registry — and `_handleChange` only
  // ever suppressed the *notice* for it, not the replay.
  const inHelpers = helpersDir ? isInside(helpersDir) : () => false
  const inAssets = assetsDir ? isInside(assetsDir) : () => false
  const inBuild = config.folders.build
    ? isInside(config.folders.build)
    : () => false
  const roots = [
    ...new Set(
      ['src', 'pages', 'layouts', 'partials', 'models', 'controllers']
        .map((key) => config.folders[key])
        .filter(Boolean),
    ),
  ]
  const sources = roots.filter(
    (root, index) =>
      !roots.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          isInside(other)(root) &&
          (!isInside(root)(other) || otherIndex < index),
      ),
  )
  const notifySource = settled(function source(event, p) {
    onChange(event, p)
  })
  // chokidar emits an `add` for every existing file during its initial scan;
  // only events after that scan are real authoring events.
  let scanned = false
  if (sources.length)
    watchers.push(
      chokidar
        .watch(sources, {
          ignored: (/** @type {string} */ p) =>
            inAssets(p) || inHelpers(p) || inBuild(p),
          ...WRITE_SETTLE,
        })
        .on('ready', () => {
          scanned = true
        })
        // What to do about an event is Kiss's call, not the watcher's: only Kiss
        // knows the stack, the partials registration and the rebuild queue.
        .on('all', (event, p) => {
          if (!scanned && (event === 'add' || event === 'addDir')) return
          notifySource(event, p)
        })
        .on('error', (/** @type {any} */ err) =>
          logger.error('Watcher error', err.message),
        ),
    )

  let assetsScanned = false
  const notifyAssets = settled(function assets(event, p) {
    logger.info(`Asset ${event}: `, p)
    assetsChanged(p, event)
  })
  if (assetsDir)
    watchers.push(
      chokidar
        .watch(assetsDir, WRITE_SETTLE)
        .on('ready', () => {
          assetsScanned = true
        })
        .on('all', (event, p) => {
          if (
            !assetsScanned ||
            !['add', 'change', 'unlink', 'unlinkDir'].includes(event)
          )
            return
          // The path goes with the event: only the caller knows where that file
          // lands in the build, and a live reload can name it.
          notifyAssets(event, p)
        })
        .on('error', (/** @type {any} */ err) =>
          logger.error('Watcher error', err.message),
        ),
    )

  return {
    ready: Promise.all(
      watchers.map(
        (w) => new Promise((r) => w.on('ready', () => r(undefined))),
      ),
    ),
    close: async () => {
      closed = true
      for (const { timer } of timers.values()) clearTimeout(timer)
      timers.clear()
      await Promise.all(watchers.map((w) => w.close()))
    },
  }
}
