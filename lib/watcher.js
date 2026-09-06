import { createRequire } from 'node:module'

import { posixPath as posix } from './utils.js'

// Required on the first watch, not at import: `lib/kiss.js` imports this
// module for `isInside` and for the branch it takes only under `dev`, so a
// one-shot build was loading chokidar to never call it. Synchronous `require`
// keeps `createWatcher` synchronous, which `Kiss.watch()` needs — it is
// chainable public API and returns `this`, not a promise.
const require = createRequire(import.meta.url)

// chokidar v4 removed glob support: `ignored` takes a path, a regex or a
// predicate, and a `'src/assets/**'` string silently matches nothing — the
// assets tree then reaches the page watcher and every asset save triggers a
// whole-site rebuild. A predicate says the same thing and cannot rot that way.
export const isInside = (dir) => {
  const root = posix(dir)
  return (p) => {
    const path = posix(p)
    return path === root || path.startsWith(`${root}/`)
  }
}

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

// `entry` is the script that configured Kiss (process.argv[1] by default —
// module.parent.filename does not exist under ESM); a change to it rebuilds
// everything because the page list itself may have changed.
export function createWatcher({
  config,
  entry = process.argv[1],
  rebuildSite,
  onChange,
  assetsChanged,
  logger,
}) {
  const chokidar = require('chokidar')
  const watchers = []
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

  const assetsDir = config.folders.assets || './src/assets'
  // chokidar emits an `add` for every existing file during its initial scan;
  // only events after that scan are real authoring events.
  let scanned = false
  watchers.push(
    chokidar
      .watch(config.folders.src, {
        ignored: isInside(assetsDir),
        ...WRITE_SETTLE,
      })
      .on('ready', () => {
        scanned = true
      })
      // What to do about an event is Kiss's call, not the watcher's: only Kiss
      // knows the stack, the partials registration and the rebuild queue.
      .on('all', (event, p) => {
        if (!scanned && (event === 'add' || event === 'addDir')) return
        onChange(event, posix(p))
      })
      .on('error', (/** @type {any} */ err) =>
        logger.error('Watcher error', err.message),
      ),
  )

  watchers.push(
    chokidar
      .watch(assetsDir, WRITE_SETTLE)
      .on('change', (p) => {
        logger.info('Asset changed: ', p)
        // The path goes with the event: only the caller knows where that file
        // lands in the build, and a live reload can name it.
        assetsChanged(posix(p))
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
      await Promise.all(watchers.map((w) => w.close()))
    },
  }
}
