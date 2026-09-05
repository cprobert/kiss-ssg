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
  getStack,
  entry = process.argv[1],
  rebuildSite,
  rebuildPage,
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
  const pagesDir = posix(config.folders.pages)
  watchers.push(
    chokidar
      .watch(config.folders.src, {
        ignored: isInside(assetsDir),
        ...WRITE_SETTLE,
      })
      .on('all', (event, p) => {
        if (event.includes('add')) return
        const changed = posix(p)
        // A deleted page view cannot be re-rendered on its own: only a full
        // replay can drop its stack entry and sweep the stale output.
        if (event === 'unlink' && changed.startsWith(`${pagesDir}/`)) {
          logger.info(`${event}: ${p}: `)
          return rebuildSite()
        }
        const lookup = changed.startsWith(`${pagesDir}/`)
          ? changed.slice(pagesDir.length + 1)
          : changed
        const matches = getStack().filter((e) => e.view === lookup)
        logger.info(`${event}: ${p}: `, matches.length)
        if (matches.length === 0) return rebuildSite()
        matches.forEach((m) => {
          logger.info('Rebuilding:', m.page.view)
          rebuildPage(m)
        })
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
