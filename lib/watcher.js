import chokidar from 'chokidar'

import { posixPath as posix } from './utils.js'

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
const WRITE_SETTLE = {
  awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 },
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
        .on('error', (err) => logger.error('Watcher error', err.message)),
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
      .on('error', (err) => logger.error('Watcher error', err.message)),
  )

  watchers.push(
    chokidar
      .watch(assetsDir, WRITE_SETTLE)
      .on('change', (p) => {
        logger.info('Asset changed: ', p)
        assetsChanged()
      })
      .on('error', (err) => logger.error('Watcher error', err.message)),
  )

  return {
    ready: Promise.all(
      watchers.map((w) => new Promise((r) => w.on('ready', r))),
    ),
    close: async () => {
      await Promise.all(watchers.map((w) => w.close()))
    },
  }
}
